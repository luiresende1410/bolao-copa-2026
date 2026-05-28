/**
 * Erros do modulo Bolao - Palpite e Pontuacao
 *
 * Cada classe de erro inclui:
 * - code: codigo unico para identificacao no frontend
 * - statusCode: HTTP status code para mapeamento na camada de API
 */

/**
 * Erro base para validacoes do modulo Bolao
 */
export class BolaoValidationError extends Error {
  public readonly code = 'BOLAO_VALIDATION_ERROR';
  public readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'BolaoValidationError';
  }
}

/**
 * Erro quando palpite e submetido fora da janela temporal
 * (timestamp >= data_horario da partida)
 */
export class JanelaFechadaError extends Error {
  public readonly code = 'BOLAO_JANELA_FECHADA';
  public readonly statusCode = 400;

  constructor(partidaId: string) {
    super(`Janela de palpite fechada para a partida ${partidaId}. Palpites so sao aceitos antes do inicio da partida.`);
    this.name = 'JanelaFechadaError';
  }
}

/**
 * Erro quando partida nao e encontrada
 */
export class PartidaNaoEncontradaError extends Error {
  public readonly code = 'BOLAO_PARTIDA_NAO_ENCONTRADA';
  public readonly statusCode = 404;

  constructor(partidaId: string) {
    super(`Partida ${partidaId} nao encontrada.`);
    this.name = 'PartidaNaoEncontradaError';
  }
}

/**
 * Erro quando partida nao esta finalizada (sem placar real)
 */
export class PartidaNaoFinalizadaError extends Error {
  public readonly code = 'BOLAO_PARTIDA_NAO_FINALIZADA';
  public readonly statusCode = 400;

  constructor(partidaId: string) {
    super(`Partida ${partidaId} nao esta finalizada. Pontuacao so pode ser calculada apos o resultado.`);
    this.name = 'PartidaNaoFinalizadaError';
  }
}

/**
 * Erro quando calculo de pontuacao ja esta em andamento (lock nao adquirido)
 */
export class PontuacaoLockError extends Error {
  public readonly code = 'BOLAO_PONTUACAO_LOCK';
  public readonly statusCode = 409;

  constructor(partidaId: string) {
    super(`Calculo de pontuacao para partida ${partidaId} ja esta em andamento.`);
    this.name = 'PontuacaoLockError';
  }
}

/**
 * Erro quando a API externa de resultados esta indisponivel (timeout, rede, etc.)
 */
export class FonteIndisponivelError extends Error {
  public readonly code = 'BOLAO_FONTE_INDISPONIVEL';
  public readonly statusCode = 502;

  constructor(message: string, public readonly causa?: unknown) {
    super(message);
    this.name = 'FonteIndisponivelError';
  }
}

/**
 * Erro quando o resultado retornado pela fonte externa e inconsistente
 * (ex: selecoes nao correspondem, dados invalidos)
 */
export class ResultadoInconsistenteError extends Error {
  public readonly code = 'BOLAO_RESULTADO_INCONSISTENTE';
  public readonly statusCode = 422;

  constructor(partidaId: string, motivo: string) {
    super(`Resultado inconsistente para partida ${partidaId}: ${motivo}`);
    this.name = 'ResultadoInconsistenteError';
  }
}

export type PalpiteError = BolaoValidationError | JanelaFechadaError | PartidaNaoEncontradaError;

export type PontuacaoError = PartidaNaoEncontradaError | PartidaNaoFinalizadaError | PontuacaoLockError;

export type SyncError = FonteIndisponivelError | ResultadoInconsistenteError;
