/**
 * ComandoBolaoService - Parser e processamento de comandos WhatsApp do Bolao.
 *
 * Responsabilidades:
 * - Identificar tipo de comando (case-insensitive)
 * - Parsear formato de palpite "[Selecao] [N] x [N] [Selecao]"
 * - Rotear mensagem para handler correto
 * - Rate limiting via Redis (max 5 comandos invalidos em 5 min, silencio 15 min)
 * - Formatar respostas para cada comando
 * - Handler ENTRAR para registro via codigo de convite
 */

import type { TipoComando, ComandoPalpite, RespostaComando } from '../entities';
import type { IPalpiteService } from './palpite.service';
import type { IRankingService } from './ranking.service';
import { type IRedisCache, REDIS_BOLAO_KEYS } from './ranking.service';
import type { IBolaoService } from './bolao.service';
import type { IPartidaRepository } from '../repositories/partida.repository';
import type { IParticipanteRepository } from '../repositories/participante.repository';
import { type Result, ok, err } from '../../../shared/types/result';

/**
 * Erro de parse de comando palpite
 */
export class ParseError extends Error {
  readonly code = 'BOLAO_PARSE_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/** Max comandos invalidos antes de silenciar */
const MAX_COMANDOS_INVALIDOS = 5;

/** TTL do contador de comandos invalidos (5 minutos) */
const TTL_COMANDOS_INVALIDOS_SECONDS = 300;

/** Duracao do silencio apos rate limit (15 minutos) */
const TTL_SILENCIO_SECONDS = 900;

/**
 * Regex para formato de palpite: "[Selecao] [N] x [N] [Selecao]"
 * Aceita espacamento flexivel ao redor do "x"
 * Selecao: uma ou mais palavras (letras, espacos, acentos)
 * N: inteiro 0-99
 */
const PALPITE_REGEX = /^(.+?)\s+(\d{1,2})\s*x\s*(\d{1,2})\s+(.+)$/i;

/**
 * Interface publica do ComandoBolaoService
 */
export interface IComandoBolaoService {
  processarMensagem(telefone: string, texto: string): Promise<RespostaComando | null>;
  parsearComandoPalpite(texto: string): Result<ComandoPalpite, ParseError>;
  identificarComando(texto: string): TipoComando | null;
}

export class ComandoBolaoService implements IComandoBolaoService {
  constructor(
    private readonly palpiteService: IPalpiteService,
    private readonly rankingService: IRankingService,
    private readonly bolaoService: IBolaoService,
    private readonly partidaRepository: IPartidaRepository,
    private readonly participanteRepository: IParticipanteRepository,
    private readonly redisCache: IRedisCache,
  ) {}

  /**
   * Processa uma mensagem recebida via WhatsApp.
   * Retorna null se o telefone esta silenciado por rate limit.
   *
   * Fluxo:
   * 1. Verifica rate limit (silencio)
   * 2. Identifica tipo de comando
   * 3. Se invalido, incrementa contador e retorna ajuda
   * 4. Se valido, roteia para handler correto
   */
  async processarMensagem(telefone: string, texto: string): Promise<RespostaComando | null> {
    // 1. Verificar se esta silenciado
    const silenciado = await this.verificarSilencio(telefone);
    if (silenciado) {
      return null;
    }

    const textoTrimmed = texto.trim();

    // 2. Identificar comando
    const tipoComando = this.identificarComando(textoTrimmed);

    // 3. Se nao reconhecido, tentar parse de palpite
    if (tipoComando === null) {
      const parsePalpite = this.parsearComandoPalpite(textoTrimmed);
      if (parsePalpite.ok) {
        return this.handlePalpite(telefone, parsePalpite.value);
      }

      // Comando invalido - incrementar rate limit
      await this.incrementarComandosInvalidos(telefone);
      return this.respostaAjuda();
    }

    // 4. Rotear para handler correto
    switch (tipoComando) {
      case 'JOGOS':
        return this.handleJogos();
      case 'RANKING':
        return this.handleRanking(telefone);
      case 'MEUS_PALPITES':
        return this.handleMeusPalpites(telefone);
      case 'AJUDA':
        return this.respostaAjuda();
      case 'ENTRAR':
        return this.handleEntrar(telefone, textoTrimmed);
      case 'PALPITE': {
        // Nao deveria chegar aqui via identificarComando, mas por seguranca
        const parse = this.parsearComandoPalpite(textoTrimmed);
        if (parse.ok) {
          return this.handlePalpite(telefone, parse.value);
        }
        await this.incrementarComandosInvalidos(telefone);
        return this.respostaAjuda();
      }
    }
  }

  /**
   * Identifica o tipo de comando a partir do texto da mensagem.
   * Case-insensitive matching.
   * Retorna null se nao reconhecido como comando explicito.
   */
  identificarComando(texto: string): TipoComando | null {
    const normalizado = texto.trim().toUpperCase();

    if (normalizado === 'JOGOS') return 'JOGOS';
    if (normalizado === 'RANKING') return 'RANKING';
    if (normalizado === 'MEUS PALPITES') return 'MEUS_PALPITES';
    if (normalizado === 'AJUDA') return 'AJUDA';
    if (normalizado.startsWith('ENTRAR')) return 'ENTRAR';

    return null;
  }

  /**
   * Parseia uma mensagem no formato de palpite: "[Selecao] [N] x [N] [Selecao]"
   *
   * Exemplos validos:
   * - "Brasil 2 x 1 Argentina"
   * - "brasil 2x1 argentina"
   * - "Coreia do Sul 0 x 3 Alemanha"
   *
   * Retorna Result com ComandoPalpite ou ParseError.
   */
  parsearComandoPalpite(texto: string): Result<ComandoPalpite, ParseError> {
    const match = texto.trim().match(PALPITE_REGEX);

    if (!match) {
      return err(
        new ParseError(
          'Formato invalido. Use: [Selecao] [N] x [N] [Selecao]. Exemplo: Brasil 2 x 1 Argentina',
        ),
      );
    }

    const [, selecaoMandante, golsMandanteStr, golsVisitanteStr, selecaoVisitante] = match;

    const golsMandante = parseInt(golsMandanteStr, 10);
    const golsVisitante = parseInt(golsVisitanteStr, 10);

    // Validar range de gols (0-99)
    if (golsMandante < 0 || golsMandante > 99) {
      return err(new ParseError(`Gols do mandante invalido: ${golsMandante}. Deve ser entre 0 e 99.`));
    }
    if (golsVisitante < 0 || golsVisitante > 99) {
      return err(new ParseError(`Gols do visitante invalido: ${golsVisitante}. Deve ser entre 0 e 99.`));
    }

    return ok({
      selecaoMandante: selecaoMandante.trim(),
      golsMandante,
      golsVisitante,
      selecaoVisitante: selecaoVisitante.trim(),
    });
  }

  // === Handlers privados ===

  /**
   * Handler para comando JOGOS - lista proximas partidas agendadas.
   */
  private async handleJogos(): Promise<RespostaComando> {
    const proximas = await this.partidaRepository.findProximas(5);

    if (proximas.length === 0) {
      return this.resposta('Nao ha jogos agendados no momento.');
    }

    const linhas = proximas.map((p) => {
      const data = this.formatarData(p.dataHorario);
      return `${p.selecaoMandante} x ${p.selecaoVisitante}\n${data} | ${p.local}`;
    });

    const conteudo = `Proximos Jogos\n\n${linhas.join('\n\n')}`;
    return this.resposta(conteudo);
  }

  /**
   * Handler para comando RANKING - mostra top 5 do ranking do grupo.
   */
  private async handleRanking(telefone: string): Promise<RespostaComando> {
    const participantes = await this.participanteRepository.findByTelefone(telefone);

    if (participantes.length === 0) {
      return this.resposta(
        'Voce nao esta registrado em nenhum grupo de bolao. Use ENTRAR [codigo] para participar.',
      );
    }

    // Usa o primeiro grupo do participante
    const participante = participantes[0];
    const top = await this.rankingService.obterRankingTop(participante.grupoBolaoId, 5);

    if (top.length === 0) {
      return this.resposta('Ranking ainda nao disponivel. Aguarde os primeiros resultados.');
    }

    const linhas = top.map(
      (entry) => `${this.medalha(entry.posicao)} ${entry.nome} - ${entry.pontuacaoTotal} pts`,
    );

    const conteudo = `Ranking - Top 5\n\n${linhas.join('\n')}`;
    return this.resposta(conteudo);
  }

  /**
   * Handler para comando MEUS PALPITES - lista ultimos palpites do participante.
   */
  private async handleMeusPalpites(telefone: string): Promise<RespostaComando> {
    const participantes = await this.participanteRepository.findByTelefone(telefone);

    if (participantes.length === 0) {
      return this.resposta(
        'Voce nao esta registrado em nenhum grupo de bolao. Use ENTRAR [codigo] para participar.',
      );
    }

    const participante = participantes[0];
    const palpites = await this.palpiteService.listarPalpitesParticipante(participante.id, 5);

    if (palpites.length === 0) {
      return this.resposta(
        'Voce ainda nao registrou nenhum palpite. Envie no formato: Brasil 2 x 1 Argentina',
      );
    }

    // Para exibir os palpites, precisamos buscar as partidas correspondentes
    const linhas: string[] = [];
    for (const palpite of palpites) {
      const partida = await this.partidaRepository.findById(palpite.partidaId);
      if (partida) {
        linhas.push(
          `${partida.selecaoMandante} ${palpite.golsMandante} x ${palpite.golsVisitante} ${partida.selecaoVisitante}`,
        );
      }
    }

    const conteudo = `Seus Ultimos Palpites\n\n${linhas.join('\n')}`;
    return this.resposta(conteudo);
  }

  /**
   * Handler para comando ENTRAR - registro via codigo de convite.
   * Formato: "ENTRAR [codigo]"
   */
  private async handleEntrar(telefone: string, texto: string): Promise<RespostaComando> {
    const partes = texto.trim().split(/\s+/);

    if (partes.length < 2) {
      return this.resposta(
        'Formato invalido. Use: ENTRAR [codigo]\nExemplo: ENTRAR abc123',
      );
    }

    const codigo = partes.slice(1).join(' ').trim();

    const resultado = await this.bolaoService.entrarViaConvite(telefone, codigo);

    if (!resultado.ok) {
      const error = resultado.error;
      if (error.code === 'BOLAO_GRUPO_FECHADO') {
        return this.resposta('Este grupo nao esta aceitando novos participantes no momento.');
      }
      if (error.code === 'BOLAO_GRUPO_LOTADO') {
        return this.resposta('Este grupo ja atingiu o limite maximo de participantes.');
      }
      if (error.code === 'BOLAO_PARTICIPANTE_DUPLICADO') {
        return this.resposta('Voce ja esta registrado neste grupo.');
      }
      return this.resposta(`Erro: ${error.message}`);
    }

    return this.resposta(
      `Bem-vindo ao bolao! Voce foi registrado com sucesso.\n\nComandos disponiveis:\n- JOGOS - Ver proximas partidas\n- RANKING - Ver classificacao\n- MEUS PALPITES - Ver seus palpites\n- [Selecao] [N] x [N] [Selecao] - Registrar palpite\n- AJUDA - Ver todos os comandos`,
    );
  }

  /**
   * Handler para palpite parseado - encontra partida e registra.
   */
  private async handlePalpite(telefone: string, comando: ComandoPalpite): Promise<RespostaComando> {
    // Buscar participante
    const participantes = await this.participanteRepository.findByTelefone(telefone);

    if (participantes.length === 0) {
      return this.resposta(
        'Voce nao esta registrado em nenhum grupo de bolao. Use ENTRAR [codigo] para participar.',
      );
    }

    const participante = participantes[0];

    // Buscar partida correspondente (proximas agendadas)
    const proximas = await this.partidaRepository.findProximas(50);
    const partida = proximas.find(
      (p) =>
        this.normalizarSelecao(p.selecaoMandante) === this.normalizarSelecao(comando.selecaoMandante) &&
        this.normalizarSelecao(p.selecaoVisitante) === this.normalizarSelecao(comando.selecaoVisitante),
    );

    if (!partida) {
      return this.resposta(
        `Partida "${comando.selecaoMandante} x ${comando.selecaoVisitante}" nao encontrada entre os proximos jogos.`,
      );
    }

    // Registrar palpite
    const resultado = await this.palpiteService.registrarPalpite(
      participante.id,
      partida.id,
      comando.golsMandante,
      comando.golsVisitante,
    );

    if (!resultado.ok) {
      const error = resultado.error;
      if (error.code === 'BOLAO_JANELA_FECHADA') {
        return this.resposta(
          `Janela de palpite encerrada para ${partida.selecaoMandante} x ${partida.selecaoVisitante}. Palpites so sao aceitos antes do inicio da partida.`,
        );
      }
      return this.resposta(`Erro: ${error.message}`);
    }

    return this.resposta(
      `Palpite registrado!\n${partida.selecaoMandante} ${comando.golsMandante} x ${comando.golsVisitante} ${partida.selecaoVisitante}\n\nBoa sorte!`,
    );
  }

  // === Rate Limiting ===

  /**
   * Verifica se o telefone esta silenciado por rate limit.
   */
  private async verificarSilencio(telefone: string): Promise<boolean> {
    const key = REDIS_BOLAO_KEYS.comandoRateLimit(telefone);
    const silenciado = await this.redisCache.get<boolean>(key);
    return silenciado === true;
  }

  /**
   * Incrementa contador de comandos invalidos.
   * Se atingir o limite, ativa silencio de 15 minutos.
   */
  private async incrementarComandosInvalidos(telefone: string): Promise<void> {
    const key = REDIS_BOLAO_KEYS.comandosInvalidos(telefone);
    const atual = await this.redisCache.get<number>(key);
    const novoValor = (atual ?? 0) + 1;

    await this.redisCache.set(key, novoValor, TTL_COMANDOS_INVALIDOS_SECONDS);

    if (novoValor >= MAX_COMANDOS_INVALIDOS) {
      // Ativar silencio
      const rateLimitKey = REDIS_BOLAO_KEYS.comandoRateLimit(telefone);
      await this.redisCache.set(rateLimitKey, true, TTL_SILENCIO_SECONDS);
    }
  }

  // === Helpers ===

  /**
   * Retorna resposta de ajuda com lista de comandos disponiveis.
   */
  private respostaAjuda(): RespostaComando {
    return this.resposta(
      `Comandos do Bolao Copa 2026\n\n` +
        `- JOGOS - Ver proximas partidas\n` +
        `- RANKING - Ver classificacao\n` +
        `- MEUS PALPITES - Ver seus palpites\n` +
        `- ENTRAR [codigo] - Entrar em um grupo\n` +
        `- [Selecao] [N] x [N] [Selecao] - Registrar palpite\n` +
        `  Ex: Brasil 2 x 1 Argentina\n\n` +
        `- AJUDA - Ver esta mensagem`,
    );
  }

  /**
   * Cria uma RespostaComando de texto.
   */
  private resposta(conteudo: string): RespostaComando {
    return { tipo: 'texto', conteudo };
  }

  /**
   * Formata data para exibicao amigavel.
   */
  private formatarData(data: Date): string {
    return data.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Retorna emoji de medalha para posicoes do ranking.
   */
  private medalha(posicao: number): string {
    switch (posicao) {
      case 1:
        return '1.';
      case 2:
        return '2.';
      case 3:
        return '3.';
      default:
        return `${posicao}.`;
    }
  }

  /**
   * Normaliza nome de selecao para comparacao case-insensitive e sem acentos.
   */
  private normalizarSelecao(nome: string): string {
    return nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }
}
