/**
 * FonteResultadosClient - Cliente para consulta de resultados de partidas
 * em API externa (ex: football-data.org, api-football, etc.)
 *
 * Responsabilidades:
 * - Consultar API externa com timeout de 10s
 * - Retry com backoff exponencial (1s, 2s, 4s) - max 3 tentativas
 * - Mapear dados externos para formato interno (PlacarExterno)
 * - Tratar erros: FonteIndisponivelError, ResultadoInconsistenteError
 *
 * Configuracao via env vars:
 * - BOLAO_FONTE_RESULTADOS_BASE_URL: URL base da API externa
 * - BOLAO_FONTE_RESULTADOS_API_KEY: Chave de autenticacao (opcional)
 */

import type { Partida } from '../../domain/bolao/entities';
import { FonteIndisponivelError, ResultadoInconsistenteError } from '../../domain/bolao/errors';

/** Timeout padrao para requisicoes a API externa (10 segundos) */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Numero maximo de tentativas (1 original + 2 retries) */
const MAX_ATTEMPTS = 3;

/** Delays de backoff exponencial em ms: 1s, 2s, 4s */
const BACKOFF_DELAYS_MS = [1_000, 2_000, 4_000];

/**
 * Resultado de uma partida retornado pela fonte externa
 */
export interface PlacarExterno {
  /** ID externo da partida na fonte */
  externalId: string;
  /** Selecao mandante (nome normalizado) */
  selecaoMandante: string;
  /** Selecao visitante (nome normalizado) */
  selecaoVisitante: string;
  /** Gols do mandante */
  golsMandante: number;
  /** Gols do visitante */
  golsVisitante: number;
  /** Status da partida na fonte */
  status: 'em_andamento' | 'finalizada' | 'nao_iniciada';
  /** Minuto atual (se em andamento) */
  minutoAtual?: number;
}

/**
 * Resposta bruta da API externa (formato generico)
 */
interface RespostaApiExterna {
  match?: {
    id?: string;
    homeTeam?: { name?: string };
    awayTeam?: { name?: string };
    score?: {
      home?: number;
      away?: number;
    };
    status?: string;
    minute?: number;
  };
  error?: string;
}

/**
 * Configuracao do cliente de fonte de resultados
 */
export interface FonteResultadosConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

/**
 * Interface do cliente de fonte de resultados (para injecao de dependencia)
 */
export interface IFonteResultadosClient {
  consultarPartida(partida: Partida): Promise<PlacarExterno>;
}

/**
 * Implementacao do cliente de fonte de resultados
 */
export class FonteResultadosClient implements IFonteResultadosClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;

  constructor(config?: FonteResultadosConfig) {
    this.baseUrl = config?.baseUrl ?? process.env.BOLAO_FONTE_RESULTADOS_BASE_URL ?? '';
    this.apiKey = config?.apiKey ?? process.env.BOLAO_FONTE_RESULTADOS_API_KEY;
    this.timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!this.baseUrl) {
      throw new Error('BOLAO_FONTE_RESULTADOS_BASE_URL nao configurada');
    }
  }

  /**
   * Consulta o resultado de uma partida na API externa.
   * Implementa retry com backoff exponencial em caso de falha.
   *
   * @throws FonteIndisponivelError - quando a API nao responde apos todas as tentativas
   * @throws ResultadoInconsistenteError - quando os dados retornados nao correspondem a partida
   */
  async consultarPartida(partida: Partida): Promise<PlacarExterno> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const resultado = await this.fetchComTimeout(partida);
        this.validarConsistencia(partida, resultado);
        return resultado;
      } catch (error) {
        lastError = error;

        // Nao faz retry para erros de inconsistencia (dados invalidos, nao transitorio)
        if (error instanceof ResultadoInconsistenteError) {
          throw error;
        }

        // Aplica backoff antes do proximo retry (exceto na ultima tentativa)
        if (attempt < MAX_ATTEMPTS - 1) {
          await this.sleep(BACKOFF_DELAYS_MS[attempt]);
        }
      }
    }

    throw new FonteIndisponivelError(
      `API externa indisponivel apos ${MAX_ATTEMPTS} tentativas para partida ${partida.id}`,
      lastError,
    );
  }

  /**
   * Executa a requisicao HTTP com AbortController para timeout de 10s
   */
  private async fetchComTimeout(partida: Partida): Promise<PlacarExterno> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = this.buildUrl(partida);
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new FonteIndisponivelError(
          `API externa retornou status ${response.status} para partida ${partida.id}`,
        );
      }

      const data = (await response.json()) as RespostaApiExterna;
      return this.mapearResposta(partida.id, data);
    } catch (error) {
      if (error instanceof FonteIndisponivelError || error instanceof ResultadoInconsistenteError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new FonteIndisponivelError(
          `Timeout de ${this.timeoutMs}ms excedido ao consultar partida ${partida.id}`,
          error,
        );
      }

      throw new FonteIndisponivelError(
        `Erro de rede ao consultar partida ${partida.id}: ${error instanceof Error ? error.message : 'desconhecido'}`,
        error,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Constroi a URL de consulta para a partida
   */
  private buildUrl(partida: Partida): string {
    // Usa selecoes e data como parametros de busca na API externa
    const encodedMandante = encodeURIComponent(partida.selecaoMandante);
    const encodedVisitante = encodeURIComponent(partida.selecaoVisitante);
    const dataISO = partida.dataHorario.toISOString().split('T')[0];
    return `${this.baseUrl}/matches?home=${encodedMandante}&away=${encodedVisitante}&date=${dataISO}`;
  }

  /**
   * Mapeia a resposta da API externa para o formato interno PlacarExterno
   */
  private mapearResposta(partidaId: string, data: RespostaApiExterna): PlacarExterno {
    if (data.error) {
      throw new FonteIndisponivelError(`API externa retornou erro: ${data.error}`);
    }

    const match = data.match;
    if (!match) {
      throw new FonteIndisponivelError(`API externa nao retornou dados de partida para ${partidaId}`);
    }

    const homeTeam = match.homeTeam?.name;
    const awayTeam = match.awayTeam?.name;
    const homeScore = match.score?.home;
    const awayScore = match.score?.away;
    const status = match.status;

    if (!homeTeam || !awayTeam || homeScore === undefined || awayScore === undefined || !status) {
      throw new ResultadoInconsistenteError(
        partidaId,
        'Dados incompletos na resposta da API externa',
      );
    }

    if (homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) {
      throw new ResultadoInconsistenteError(
        partidaId,
        `Gols fora do intervalo valido: ${homeScore} x ${awayScore}`,
      );
    }

    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
      throw new ResultadoInconsistenteError(
        partidaId,
        `Gols devem ser inteiros: ${homeScore} x ${awayScore}`,
      );
    }

    return {
      externalId: match.id ?? '',
      selecaoMandante: homeTeam,
      selecaoVisitante: awayTeam,
      golsMandante: homeScore,
      golsVisitante: awayScore,
      status: this.mapearStatus(status),
      minutoAtual: match.minute,
    };
  }

  /**
   * Mapeia o status da API externa para o formato interno
   */
  private mapearStatus(statusExterno: string): PlacarExterno['status'] {
    const statusNormalizado = statusExterno.toLowerCase().trim();

    const statusFinalizados = ['finished', 'ft', 'aet', 'pen', 'finalizada', 'ended'];
    const statusEmAndamento = ['live', 'in_play', '1h', '2h', 'ht', 'et', 'em_andamento', 'in_progress'];
    const statusNaoIniciados = ['scheduled', 'tbd', 'ns', 'agendada', 'not_started'];

    if (statusFinalizados.includes(statusNormalizado)) return 'finalizada';
    if (statusEmAndamento.includes(statusNormalizado)) return 'em_andamento';
    if (statusNaoIniciados.includes(statusNormalizado)) return 'nao_iniciada';

    // Default: se nao reconhecido, assume em andamento (mais seguro)
    return 'em_andamento';
  }

  /**
   * Valida que os dados retornados pela fonte correspondem a partida consultada
   */
  private validarConsistencia(partida: Partida, resultado: PlacarExterno): void {
    const mandanteMatch = this.normalizarNomeSelecao(resultado.selecaoMandante) ===
      this.normalizarNomeSelecao(partida.selecaoMandante);
    const visitanteMatch = this.normalizarNomeSelecao(resultado.selecaoVisitante) ===
      this.normalizarNomeSelecao(partida.selecaoVisitante);

    if (!mandanteMatch || !visitanteMatch) {
      throw new ResultadoInconsistenteError(
        partida.id,
        `Selecoes nao correspondem. Esperado: ${partida.selecaoMandante} vs ${partida.selecaoVisitante}. ` +
        `Recebido: ${resultado.selecaoMandante} vs ${resultado.selecaoVisitante}`,
      );
    }
  }

  /**
   * Normaliza nome de selecao para comparacao (lowercase, sem acentos, sem espacos extras)
   */
  private normalizarNomeSelecao(nome: string): string {
    return nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Utilitario de sleep para backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}