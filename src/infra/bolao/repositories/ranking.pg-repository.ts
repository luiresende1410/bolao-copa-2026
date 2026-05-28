/**
 * Implementacao PostgreSQL do repositorio de Ranking
 */

import type { Pool } from 'pg';
import type { IRankingRepository, RankingHistorico } from '@domain/bolao/repositories';
import type { PaginatedResult } from '@domain/bolao/repositories';
import type { RankingEntry } from '@domain/bolao/entities';

function mapRowToRankingEntry(row: Record<string, unknown>, posicao: number, variacaoPosicao: number): RankingEntry {
  return {
    posicao,
    participanteId: row.id as string,
    nome: row.nome as string,
    pontuacaoTotal: row.pontuacao_acumulada as number,
    acertosExatos: row.acertos_exatos as number,
    acertosVencedor: row.acertos_vencedor as number,
    variacaoPosicao,
  };
}

function mapRowToRankingHistorico(row: Record<string, unknown>): RankingHistorico {
  return {
    id: row.id as string,
    participanteId: row.participante_id as string,
    grupoBolaoId: row.grupo_bolao_id as string,
    posicao: row.posicao as number,
    pontuacaoTotal: row.pontuacao_total as number,
    acertosExatos: row.acertos_exatos as number,
    acertosVencedor: row.acertos_vencedor as number,
    partidaReferencia: (row.partida_referencia as string) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}

export class RankingPostgresRepository implements IRankingRepository {
  constructor(private readonly pool: Pool) {}

  async obterRanking(grupoBolaoId: string, pagina: number, tamanhoPagina: number): Promise<PaginatedResult<RankingEntry>> {
    const offset = (pagina - 1) * tamanhoPagina;

    const countResult = await this.pool.query(
      'SELECT COUNT(*) as total FROM participante WHERE grupo_bolao_id = $1',
      [grupoBolaoId],
    );
    const total = parseInt(countResult.rows[0].total as string, 10);

    const dataResult = await this.pool.query(
      `SELECT * FROM participante WHERE grupo_bolao_id = $1
       ORDER BY pontuacao_acumulada DESC, acertos_exatos DESC, acertos_vencedor DESC, nome ASC
       LIMIT $2 OFFSET $3`,
      [grupoBolaoId, tamanhoPagina, offset],
    );

    // Buscar ultimo historico para calcular variacao de posicao
    const ultimoHistorico = await this.obterUltimoHistorico(grupoBolaoId);
    const historicoMap = new Map(ultimoHistorico.map(h => [h.participanteId, h.posicao]));

    const entries: RankingEntry[] = dataResult.rows.map((row, index) => {
      const posicaoAtual = offset + index + 1;
      const posicaoAnterior = historicoMap.get(row.id as string);
      const variacaoPosicao = posicaoAnterior !== undefined ? posicaoAnterior - posicaoAtual : 0;
      return mapRowToRankingEntry(row, posicaoAtual, variacaoPosicao);
    });

    return {
      data: entries,
      total,
      pagina,
      tamanhoPagina,
      totalPaginas: Math.ceil(total / tamanhoPagina),
    };
  }

  async obterRankingTop(grupoBolaoId: string, limite: number): Promise<RankingEntry[]> {
    const dataResult = await this.pool.query(
      `SELECT * FROM participante WHERE grupo_bolao_id = $1
       ORDER BY pontuacao_acumulada DESC, acertos_exatos DESC, acertos_vencedor DESC, nome ASC
       LIMIT $2`,
      [grupoBolaoId, limite],
    );

    const ultimoHistorico = await this.obterUltimoHistorico(grupoBolaoId);
    const historicoMap = new Map(ultimoHistorico.map(h => [h.participanteId, h.posicao]));

    return dataResult.rows.map((row, index) => {
      const posicaoAtual = index + 1;
      const posicaoAnterior = historicoMap.get(row.id as string);
      const variacaoPosicao = posicaoAnterior !== undefined ? posicaoAnterior - posicaoAtual : 0;
      return mapRowToRankingEntry(row, posicaoAtual, variacaoPosicao);
    });
  }

  async obterPosicaoParticipante(grupoBolaoId: string, participanteId: string): Promise<RankingEntry | null> {
    // Buscar dados do participante
    const participanteResult = await this.pool.query(
      'SELECT * FROM participante WHERE id = $1 AND grupo_bolao_id = $2',
      [participanteId, grupoBolaoId],
    );
    if (participanteResult.rows.length === 0) return null;

    const participante = participanteResult.rows[0];

    // Calcular posicao contando quantos estao acima
    const posicaoResult = await this.pool.query(
      `SELECT COUNT(*) + 1 as posicao FROM participante
       WHERE grupo_bolao_id = $1 AND (
         pontuacao_acumulada > $2
         OR (pontuacao_acumulada = $2 AND acertos_exatos > $3)
         OR (pontuacao_acumulada = $2 AND acertos_exatos = $3 AND acertos_vencedor > $4)
         OR (pontuacao_acumulada = $2 AND acertos_exatos = $3 AND acertos_vencedor = $4 AND nome < $5)
       )`,
      [
        grupoBolaoId,
        participante.pontuacao_acumulada,
        participante.acertos_exatos,
        participante.acertos_vencedor,
        participante.nome,
      ],
    );
    const posicaoAtual = parseInt(posicaoResult.rows[0].posicao as string, 10);

    // Buscar variacao
    const ultimoHistorico = await this.obterUltimoHistorico(grupoBolaoId);
    const historicoEntry = ultimoHistorico.find(h => h.participanteId === participanteId);
    const variacaoPosicao = historicoEntry ? historicoEntry.posicao - posicaoAtual : 0;

    return mapRowToRankingEntry(participante, posicaoAtual, variacaoPosicao);
  }

  async salvarHistorico(
    grupoBolaoId: string,
    partidaReferencia: string | null,
    entries: Array<{ participanteId: string; posicao: number; pontuacaoTotal: number; acertosExatos: number; acertosVencedor: number }>,
  ): Promise<void> {
    if (entries.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const entry of entries) {
        await client.query(
          `INSERT INTO ranking_historico (participante_id, grupo_bolao_id, posicao, pontuacao_total, acertos_exatos, acertos_vencedor, partida_referencia)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            entry.participanteId,
            grupoBolaoId,
            entry.posicao,
            entry.pontuacaoTotal,
            entry.acertosExatos,
            entry.acertosVencedor,
            partidaReferencia,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async obterUltimoHistorico(grupoBolaoId: string): Promise<RankingHistorico[]> {
    // Buscar o created_at mais recente do historico deste grupo
    const latestResult = await this.pool.query(
      `SELECT created_at FROM ranking_historico
       WHERE grupo_bolao_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [grupoBolaoId],
    );

    if (latestResult.rows.length === 0) return [];

    const latestTimestamp = latestResult.rows[0].created_at;

    const result = await this.pool.query(
      `SELECT * FROM ranking_historico
       WHERE grupo_bolao_id = $1 AND created_at = $2
       ORDER BY posicao ASC`,
      [grupoBolaoId, latestTimestamp],
    );

    return result.rows.map(mapRowToRankingHistorico);
  }
}