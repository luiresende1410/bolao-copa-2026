/**
 * Implementacao PostgreSQL do repositorio de Palpite
 * Inclui UPSERT com ON CONFLICT DO UPDATE
 */

import type { Pool } from 'pg';
import type { IPalpiteRepository } from '@domain/bolao/repositories';
import type { PaginatedResult } from '@domain/bolao/repositories';
import type { Palpite } from '@domain/bolao/entities';

function mapRowToPalpite(row: Record<string, unknown>): Palpite {
  return {
    id: row.id as string,
    participanteId: row.participante_id as string,
    partidaId: row.partida_id as string,
    golsMandante: row.gols_mandante as number,
    golsVisitante: row.gols_visitante as number,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export class PalpitePostgresRepository implements IPalpiteRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<Palpite | null> {
    const result = await this.pool.query(
      'SELECT * FROM palpite WHERE id = $1',
      [id],
    );
    if (result.rows.length === 0) return null;
    return mapRowToPalpite(result.rows[0]);
  }

  async findByParticipanteEPartida(participanteId: string, partidaId: string): Promise<Palpite | null> {
    const result = await this.pool.query(
      'SELECT * FROM palpite WHERE participante_id = $1 AND partida_id = $2',
      [participanteId, partidaId],
    );
    if (result.rows.length === 0) return null;
    return mapRowToPalpite(result.rows[0]);
  }

  async findByParticipante(participanteId: string, limite: number): Promise<Palpite[]> {
    const result = await this.pool.query(
      `SELECT * FROM palpite WHERE participante_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [participanteId, limite],
    );
    return result.rows.map(mapRowToPalpite);
  }

  async findByParticipantePaginado(participanteId: string, pagina: number, tamanhoPagina: number): Promise<PaginatedResult<Palpite>> {
    const offset = (pagina - 1) * tamanhoPagina;

    const countResult = await this.pool.query(
      'SELECT COUNT(*) as total FROM palpite WHERE participante_id = $1',
      [participanteId],
    );
    const total = parseInt(countResult.rows[0].total as string, 10);

    const dataResult = await this.pool.query(
      `SELECT * FROM palpite WHERE participante_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [participanteId, tamanhoPagina, offset],
    );

    return {
      data: dataResult.rows.map(mapRowToPalpite),
      total,
      pagina,
      tamanhoPagina,
      totalPaginas: Math.ceil(total / tamanhoPagina),
    };
  }

  async findByPartida(partidaId: string): Promise<Palpite[]> {
    const result = await this.pool.query(
      'SELECT * FROM palpite WHERE partida_id = $1 ORDER BY created_at ASC',
      [partidaId],
    );
    return result.rows.map(mapRowToPalpite);
  }

  async upsert(participanteId: string, partidaId: string, golsMandante: number, golsVisitante: number): Promise<Palpite> {
    const result = await this.pool.query(
      `INSERT INTO palpite (participante_id, partida_id, gols_mandante, gols_visitante)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (participante_id, partida_id) DO UPDATE SET
         gols_mandante = EXCLUDED.gols_mandante,
         gols_visitante = EXCLUDED.gols_visitante,
         updated_at = NOW()
       RETURNING *`,
      [participanteId, partidaId, golsMandante, golsVisitante],
    );
    return mapRowToPalpite(result.rows[0]);
  }

  async countByPartida(partidaId: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*) as total FROM palpite WHERE partida_id = $1',
      [partidaId],
    );
    return parseInt(result.rows[0].total as string, 10);
  }
}