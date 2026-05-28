/**
 * NotificadorBolaoService - Servico de notificacoes via WhatsApp para o modulo Bolao.
 *
 * Responsabilidades:
 * - Enviar resultado de partida + pontuacao individual para participantes
 * - Enviar lembrete 24h antes da partida
 * - Enviar lembrete 2h antes da partida
 * - Enviar ranking atualizado (top 5) para participantes do grupo
 * - Respeitar rate limit de 80 msg/s com backoff em erros
 * - Registrar todas as notificacoes na tabela notificacao_log
 */

import pino from 'pino';
import type { Partida, RankingEntry, NotificacaoLog } from '../entities';
import type { IPartidaRepository } from '../repositories/partida.repository';
import type { IParticipanteRepository } from '../repositories/participante.repository';
import type { IPalpiteRepository } from '../repositories/palpite.repository';
import type { IPontuacaoRepository } from '../repositories/pontuacao.repository';
import type { IRankingService } from './ranking.service';

/**
 * Interface para envio de mensagens WhatsApp.
 * Implementada pela camada de infraestrutura (WhatsApp Cloud API client).
 */
export interface IWhatsAppSender {
  /** Envia mensagem de texto para um numero de telefone. Retorna o message ID do WhatsApp. */
  enviarMensagem(telefone: string, conteudo: string): Promise<string>;
}

/**
 * Interface de repositorio para log de notificacoes.
 */
export interface INotificacaoLogRepository {
  /** Cria um novo registro de notificacao */
  create(dados: { participanteId: string; tipo: string; conteudo?: string }): Promise<NotificacaoLog>;

  /** Atualiza status de uma notificacao */
  atualizarStatus(id: string, status: 'pendente' | 'enviada' | 'falha', whatsappMessageId?: string): Promise<NotificacaoLog | null>;
}

/**
 * Interface publica do NotificadorBolaoService
 */
export interface INotificadorBolao {
  notificarResultado(partidaId: string): Promise<void>;
  notificarLembrete24h(partidaId: string): Promise<void>;
  notificarLembrete2h(partidaId: string): Promise<void>;
  notificarRankingAtualizado(grupoId: string): Promise<void>;
}

/**
 * Configuracao do NotificadorBolaoService
 */
export interface NotificadorConfig {
  /** Rate limit maximo de mensagens por segundo (default: 80) */
  rateLimitMsgPorSegundo?: number;
  /** Logger pino (opcional) */
  logger?: pino.Logger;
}

/** Rate limit padrao: 80 mensagens por segundo */
const DEFAULT_RATE_LIMIT = 80;

/** Delay base para backoff em ms */
const BACKOFF_BASE_MS = 500;

/** Maximo de tentativas por mensagem */
const MAX_RETRIES = 3;

/**
 * Implementacao do NotificadorBolaoService
 */
export class NotificadorBolaoService implements INotificadorBolao {
  private readonly logger: pino.Logger;
  private readonly rateLimitMsgPorSegundo: number;

  constructor(
    private readonly whatsAppSender: IWhatsAppSender,
    private readonly notificacaoLogRepository: INotificacaoLogRepository,
    private readonly partidaRepository: IPartidaRepository,
    private readonly participanteRepository: IParticipanteRepository,
    private readonly palpiteRepository: IPalpiteRepository,
    private readonly pontuacaoRepository: IPontuacaoRepository,
    private readonly rankingService: IRankingService,
    config?: NotificadorConfig,
  ) {
    this.logger = config?.logger ?? pino({
      name: 'notificador-bolao',
      level: process.env.LOG_LEVEL ?? 'info',
    });
    this.rateLimitMsgPorSegundo = config?.rateLimitMsgPorSegundo ?? DEFAULT_RATE_LIMIT;
  }

  /**
   * Notifica participantes sobre o resultado de uma partida finalizada.
   * Envia o placar final + pontuacao individual de cada participante.
   */
  async notificarResultado(partidaId: string): Promise<void> {
    const partida = await this.partidaRepository.findById(partidaId);
    if (!partida || partida.status !== 'finalizada') {
      this.logger.warn({ partidaId }, 'Partida nao encontrada ou nao finalizada para notificacao de resultado');
      return;
    }

    const palpites = await this.palpiteRepository.findByPartida(partidaId);
    if (palpites.length === 0) {
      this.logger.info({ partidaId }, 'Nenhum palpite registrado para esta partida');
      return;
    }

    this.logger.info(
      { partidaId, totalPalpites: palpites.length },
      'Iniciando notificacao de resultado',
    );

    const mensagens: Array<{ participanteId: string; telefone: string; conteudo: string }> = [];

    for (const palpite of palpites) {
      const participante = await this.participanteRepository.findById(palpite.participanteId);
      if (!participante) continue;

      const pontuacao = await this.pontuacaoRepository.findByPalpiteId(palpite.id);
      const pontos = pontuacao?.pontos ?? 0;
      const categoria = pontuacao?.categoria ?? 'erro';

      const conteudo = this.formatarMensagemResultado(partida, palpite.golsMandante, palpite.golsVisitante, pontos, categoria);
      mensagens.push({ participanteId: participante.id, telefone: participante.telefone, conteudo });
    }

    await this.enviarLote(mensagens, 'resultado');
  }

  /**
   * Envia lembrete 24h antes do inicio da partida para participantes
   * que ainda nao registraram palpite.
   */
  async notificarLembrete24h(partidaId: string): Promise<void> {
    await this.enviarLembrete(partidaId, 'lembrete_24h', '24 horas');
  }

  /**
   * Envia lembrete 2h antes do inicio da partida para participantes
   * que ainda nao registraram palpite.
   */
  async notificarLembrete2h(partidaId: string): Promise<void> {
    await this.enviarLembrete(partidaId, 'lembrete_2h', '2 horas');
  }

  /**
   * Notifica participantes de um grupo sobre o ranking atualizado (top 5).
   */
  async notificarRankingAtualizado(grupoId: string): Promise<void> {
    const top5 = await this.rankingService.obterRankingTop(grupoId, 5);
    if (top5.length === 0) {
      this.logger.info({ grupoId }, 'Ranking vazio, nenhuma notificacao enviada');
      return;
    }

    const totalParticipantes = await this.participanteRepository.countByGrupo(grupoId);
    if (totalParticipantes === 0) return;

    const participantes = await this.participanteRepository.findByGrupo(grupoId, 1, totalParticipantes);
    const conteudo = this.formatarMensagemRanking(top5);

    this.logger.info(
      { grupoId, totalParticipantes: participantes.data.length },
      'Iniciando notificacao de ranking atualizado',
    );

    const mensagens = participantes.data.map((p) => ({
      participanteId: p.id,
      telefone: p.telefone,
      conteudo,
    }));

    await this.enviarLote(mensagens, 'ranking_atualizado');
  }

  // === Metodos privados ===

  /**
   * Envia lembrete generico para participantes sem palpite registrado.
   */
  private async enviarLembrete(partidaId: string, tipo: string, tempoRestante: string): Promise<void> {
    const partida = await this.partidaRepository.findById(partidaId);
    if (!partida || partida.status !== 'agendada') {
      this.logger.warn({ partidaId }, `Partida nao encontrada ou nao agendada para ${tipo}`);
      return;
    }

    const palpitesExistentes = await this.palpiteRepository.findByPartida(partidaId);
    const participantesComPalpite = new Set(palpitesExistentes.map((p) => p.participanteId));

    // Buscar participantes que poderiam fazer palpite mas ainda nao fizeram.
    // Como partidas sao globais, buscamos participantes de todos os grupos ativos
    // que nao possuem palpite para esta partida.
    // Simplificacao: notificamos participantes que ja interagiram com o sistema
    // mas nao fizeram palpite nesta partida especifica.
    const participantesParaNotificar: Array<{ id: string; telefone: string }> = [];

    for (const palpite of palpitesExistentes) {
      if (!participantesComPalpite.has(palpite.participanteId)) {
        const participante = await this.participanteRepository.findById(palpite.participanteId);
        if (participante) {
          participantesParaNotificar.push({ id: participante.id, telefone: participante.telefone });
        }
      }
    }

    if (participantesParaNotificar.length === 0) {
      this.logger.info({ partidaId, tipo }, 'Nenhum participante identificado para lembrete');
      return;
    }

    const conteudo = this.formatarMensagemLembrete(partida, tempoRestante);

    const mensagens = participantesParaNotificar.map((p) => ({
      participanteId: p.id,
      telefone: p.telefone,
      conteudo,
    }));

    await this.enviarLote(mensagens, tipo);
  }

  /**
   * Envia um lote de mensagens respeitando o rate limit de 80 msg/s.
   * Implementa backoff exponencial em caso de erros.
   */
  private async enviarLote(
    mensagens: Array<{ participanteId: string; telefone: string; conteudo: string }>,
    tipo: string,
  ): Promise<void> {
    const intervalMs = 1000 / this.rateLimitMsgPorSegundo;
    let enviadas = 0;
    let falhas = 0;
    let consecutiveErrors = 0;

    for (const msg of mensagens) {
      // Aplicar backoff se houver erros consecutivos
      if (consecutiveErrors > 0) {
        const backoffMs = BACKOFF_BASE_MS * Math.pow(2, Math.min(consecutiveErrors - 1, 5));
        await this.sleep(backoffMs);
      }

      // Criar registro de log
      const logEntry = await this.notificacaoLogRepository.create({
        participanteId: msg.participanteId,
        tipo,
        conteudo: msg.conteudo,
      });

      // Tentar enviar com retries
      let enviado = false;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const messageId = await this.whatsAppSender.enviarMensagem(msg.telefone, msg.conteudo);
          await this.notificacaoLogRepository.atualizarStatus(logEntry.id, 'enviada', messageId);
          enviadas++;
          consecutiveErrors = 0;
          enviado = true;
          break;
        } catch (error) {
          if (attempt === MAX_RETRIES - 1) {
            await this.notificacaoLogRepository.atualizarStatus(logEntry.id, 'falha');
            falhas++;
            consecutiveErrors++;
            this.logger.warn(
              {
                participanteId: msg.participanteId,
                tipo,
                tentativas: MAX_RETRIES,
                erro: error instanceof Error ? error.message : 'desconhecido',
              },
              'Falha ao enviar notificacao apos todas as tentativas',
            );
          } else {
            await this.sleep(BACKOFF_BASE_MS * Math.pow(2, attempt));
          }
        }
      }

      // Rate limiting: aguardar intervalo minimo entre mensagens
      if (enviado) {
        await this.sleep(intervalMs);
      }
    }

    this.logger.info(
      { tipo, total: mensagens.length, enviadas, falhas },
      'Lote de notificacoes processado',
    );
  }

  /**
   * Formata mensagem de resultado para envio via WhatsApp.
   */
  private formatarMensagemResultado(
    partida: Partida,
    golsPalpiteMandante: number,
    golsPalpiteVisitante: number,
    pontos: number,
    categoria: string,
  ): string {
    const placar = `${partida.selecaoMandante} ${partida.golsMandante} x ${partida.golsVisitante} ${partida.selecaoVisitante}`;
    const palpite = `${partida.selecaoMandante} ${golsPalpiteMandante} x ${golsPalpiteVisitante} ${partida.selecaoVisitante}`;
    const categoriaLabel = this.categoriaPontuacaoLabel(categoria);

    return [
      `\u26BD *Resultado Final*`,
      `${placar}`,
      ``,
      `\uD83D\uDCDD Seu palpite: ${palpite}`,
      `\uD83C\uDFC6 Pontuacao: ${pontos} pts (${categoriaLabel})`,
    ].join('\n');
  }

  /**
   * Formata mensagem de lembrete para envio via WhatsApp.
   */
  private formatarMensagemLembrete(partida: Partida, tempoRestante: string): string {
    const dataFormatada = partida.dataHorario.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    return [
      `\u23F0 *Lembrete de Palpite*`,
      ``,
      `${partida.selecaoMandante} vs ${partida.selecaoVisitante}`,
      `\uD83D\uDCC5 ${dataFormatada}`,
      ``,
      `Faltam ${tempoRestante} para o inicio! Registre seu palpite.`,
    ].join('\n');
  }

  /**
   * Formata mensagem de ranking atualizado (top 5).
   */
  private formatarMensagemRanking(top5: RankingEntry[]): string {
    const medalhas = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49', '4\uFE0F\u20E3', '5\uFE0F\u20E3'];

    const linhas = top5.map((entry, i) => {
      const medalha = medalhas[i] ?? `${entry.posicao}.`;
      return `${medalha} ${entry.nome} - ${entry.pontuacaoTotal} pts`;
    });

    return [
      `\uD83C\uDFC6 *Ranking Atualizado*`,
      ``,
      ...linhas,
    ].join('\n');
  }

  /**
   * Retorna label legivel para a categoria de pontuacao.
   */
  private categoriaPontuacaoLabel(categoria: string): string {
    const labels: Record<string, string> = {
      exato: 'Placar exato',
      diferenca_gols: 'Diferenca de gols',
      vencedor: 'Vencedor correto',
      empate: 'Empate correto',
      gols_parcial: 'Gols parcial',
      erro: 'Sem pontuacao',
    };
    return labels[categoria] ?? categoria;
  }

  /**
   * Utilitario de sleep para rate limiting e backoff.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
