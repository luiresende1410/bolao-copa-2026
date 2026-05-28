/**
 * Implementacao PostgreSQL do repositorio de Pontuacao
 */

import type { Pool } from 'pg';
import type { IPontuacaoRepository } from '@domain/bolao/repositories';
import type { Pontuacao, CategoriaPontuacao } from '@domain/bolao/entities';

function mapRowToPontuacao(row: Record<string, unknown>): Pontuacao {
  return {
    id: row.id as string,
    palpiteId: row.palpite_id as string,
    pontos: row.pontos as number,
    categoria: row.categoria as CategoriaPontuacao,
    createdAt: new Date(row.created_at as string),
  };
}

export class PontuacaoPostgresRepository implements IPontuacaoRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<Pontuacao | null> {
    const result = await this.pool.query(
      'SELECT * FROM pontuacao WHERE id = $1',
      [id],
    );
    if (result.rows.length === 0) return null;
    return mapRowToPontuacao(result.rows[0]);
  }

  async findByPalpiteId(palpiteId: string): Promise<Pontuacao | null> {
    const result = await this.pool.query(
      'SELECT * FROM pontuacao WHERE palpite_id = $1',
      [palpiteId],
    );
    if (result.rows.length === 0) return null;
    return mapRowToPontuacao(result.rows[0]);
  }

  async findByParticipante(participanteId: string): Promise<Pontuacao[]> {
    const result = await this.pool.query(
      `SELECT po.* FROM pontuacao po
       INNER JOIN palpite pa ON po.palpite_id = pa.id
       WHERE pa.participante_id = $1
       ORDER BY po.created_at DESC`,
      [participanteId],
    );
    return result.rows.map(mapRowToPontuacao);
  }

  async create(palpiteId: string, pontos: number, categoria: CategoriaPontuacao): Promise<Pontuacao> {
    const result = await this.pool.query(
      `INSERT INTO pontuacao (palpite_id, pontos, categoria)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [palpiteId, pontos, categoria],
    );
    return mapRowToPontuacao(result.rows[0]);
  }

  async createBatch(pontuacoes: Array<{ palpiteId: string; pontos: number; categoria: CategoriaPontuacao }>): Promise<Pontuacao[]> {
    if (pontuacoes.length === 0) return [];

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const results: Pontuacao[] = [];

      for (const p of pontuacoes) {
        const result = await client.query(
          `INSERT INTO pontuacao (palpite_id, pontos, categoria)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [p.palpiteId, p.pontos, p.categoria],
        );
        results.push(mapRowToPontuacao(result.rows[0]));
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async existsByPalpiteId(palpiteId: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM pontuacao WHERE palpite_id = $1 LIMIT 1',
      [palpiteId],
    );
    return result.rows.length > 0;
  }

  async deleteByPalpiteId(palpiteId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM pontuacao WHERE palpite_id = $1',
      [palpiteId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByPartidaId(partidaId: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM pontuacao
       WHERE palpite_id IN (SELECT id FROM palpite WHERE partida_id = $1)`,
      [partidaId],
    );
    return result.rowCount ?? 0;
  }

  async countTotal(): Promise<number> {
    const result = await this.pool.query('SELECT COUNT(*)::int AS count FROM pontuacao');
    return result.rows[0].count;
  }

  async countAcertos(): Promise<number> {
    const result = await this.pool.query(
      "SELECT COUNT(*)::int AS count FROM pontuacao WHERE categoria != 'erro'",
    );
    return result.rows[0].count;
  }
}