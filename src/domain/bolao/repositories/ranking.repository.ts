/**
 * Interface de repositorio para Ranking
 */

import type { RankingEntry } from '../entities';
import type { PaginatedResult } from './index';

export interface RankingHistorico {
  id: string;
  participanteId: string;
  grupoBolaoId: string;
  posicao: number;
  pontuacaoTotal: number;
  acertosExatos: number;
  acertosVencedor: number;
  partidaReferencia: string | null;
  createdAt: Date;
}

export interface IRankingRepository {
  /** Obtem ranking atual de um grupo com paginacao (calculado a partir de participantes) */
  obterRanking(grupoBolaoId: string, pagina: number, tamanhoPagina: number): Promise<PaginatedResult<RankingEntry>>;

  /** Obtem top N do ranking de um grupo */
  obterRankingTop(grupoBolaoId: string, limite: number): Promise<RankingEntry[]>;

  /** Obtem posicao de um participante especifico no ranking */
  obterPosicaoParticipante(grupoBolaoId: string, participanteId: string): Promise<RankingEntry | null>;

  /** Salva snapshot do ranking no historico */
  salvarHistorico(
    grupoBolaoId: string,
    partidaReferencia: string | null,
    entries: Array<{ participanteId: string; posicao: number; pontuacaoTotal: number; acertosExatos: number; acertosVencedor: number }>,
  ): Promise<void>;

  /** Obtem ultimo historico de ranking (para calcular variacao de posicao) */
  obterUltimoHistorico(grupoBolaoId: string): Promise<RankingHistorico[]>;
}
