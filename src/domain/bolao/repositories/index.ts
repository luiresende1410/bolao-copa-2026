/**
 * Barrel export para repositorios do modulo Bolao
 */

/**
 * Tipo generico para resultados paginados
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
  totalPaginas: number;
}

export type { IGrupoBolaoRepository } from './grupo-bolao.repository';
export type { IParticipanteRepository } from './participante.repository';
export type { IPartidaRepository, FiltroPartidas } from './partida.repository';
export type { IPalpiteRepository } from './palpite.repository';
export type { IPontuacaoRepository } from './pontuacao.repository';
export type { IRankingRepository, RankingHistorico } from './ranking.repository';
export type { INotificacaoLogRepository, FiltroNotificacoes } from './notificacao-log.repository';
