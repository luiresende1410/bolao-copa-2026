/**
 * Implementacao PostgreSQL do repositorio de Partida
 */

import type { Pool } from 'pg';
import type { IPartidaRepository, FiltroPartidas } from '@domain/bolao/repositories';
import type { PaginatedResult } from '@domain/bolao/repositories';
import type { Partida, CriarPartidaDTO, RegistrarResultadoDTO, StatusPartida } from '@domain/bolao/entities';

function mapRowToPartida(row: Record<string, unknown>): Partida {
  return {
    id: row.id as string,
    selecaoMandante: row.selecao_mandante as string,
    bandeiraMandante: row.bandeira_mandante as string,
    selecaoVisitante: row.selecao_visitante as string,
    bandeiraVisitante: row.bandeira_visitante as string,
    dataHorario: new Date(row.data_horario as string),
    local: row.local as string,
    faseTorneio: row.fase_torneio as Partida['faseTorneio'],
    status: row.status as Partida['status'],
    golsMandante: row.gols_mandante as number | null,
    golsVisitante: row.gols_visitante as number | null,
    syncAutomatico: row.sync_automatico as boolean,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export class PartidaPostgresRepository implements IPartidaRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<Partida | null> {
    const result = await this.pool.query(
      'SELECT * FROM partida WHERE id = $1',
      [id],
    );
    if (result.rows.length === 0) return null;
    return mapRowToPartida(result.rows[0]);
  }

  async findAll(filtros: FiltroPartidas): Promise<PaginatedResult<Partida>> {
    const pagina = filtros.pagina ?? 1;
    const tamanhoPagina = filtros.tamanhoPagina ?? 20;
    const offset = (pagina - 1) * tamanhoPagina;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filtros.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filtros.status);
    }
    if (filtros.faseTorneio) {
      conditions.push(`fase_torneio = $${paramIndex++}`);
      params.push(filtros.faseTorneio);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM partida ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total as string, 10);

    const dataResult = await this.pool.query(
      `SELECT * FROM partida ${whereClause} ORDER BY data_horario ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, tamanhoPagina, offset],
    );

    return {
      data: dataResult.rows.map(mapRowToPartida),
      total,
      pagina,
      tamanhoPagina,
      totalPaginas: Math.ceil(total / tamanhoPagina),
    };
  }

  async findProximas(limite: number): Promise<Partida[]> {
    const result = await this.pool.query(
      `SELECT * FROM partida
       WHERE status = 'agendada' AND data_horario > NOW()
       ORDER BY data_horario ASC
       LIMIT $1`,
      [limite],
    );
    return result.rows.map(mapRowToPartida);
  }

  async findEmAndamento(): Promise<Partida[]> {
    const result = await this.pool.query(
      `SELECT * FROM partida WHERE status = 'em_andamento' ORDER BY data_horario ASC`,
    );
    return result.rows.map(mapRowToPartida);
  }

  async findParaSincronizar(): Promise<Partida[]> {
    const result = await this.pool.query(
      `SELECT * FROM partida
       WHERE sync_automatico = TRUE AND status IN ('agendada', 'em_andamento')
       ORDER BY data_horario ASC`,
    );
    return result.rows.map(mapRowToPartida);
  }

  async create(dados: CriarPartidaDTO): Promise<Partida> {
    const result = await this.pool.query(
      `INSERT INTO partida (selecao_mandante, bandeira_mandante, selecao_visitante, bandeira_visitante, data_horario, local, fase_torneio)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        dados.selecaoMandante,
        '',
        dados.selecaoVisitante,
        '',
        dados.dataHorario,
        dados.local,
        dados.faseTorneio,
      ],
    );
    return mapRowToPartida(result.rows[0]);
  }

  async createBatch(dados: CriarPartidaDTO[]): Promise<Partida[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const partidas: Partida[] = [];

      for (const d of dados) {
        const result = await client.query(
          `INSERT INTO partida (selecao_mandante, bandeira_mandante, selecao_visitante, bandeira_visitante, data_horario, local, fase_torneio)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [d.selecaoMandante, '', d.selecaoVisitante, '', d.dataHorario, d.local, d.faseTorneio],
        );
        partidas.push(mapRowToPartida(result.rows[0]));
      }

      await client.query('COMMIT');
      return partidas;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(id: string, dados: Partial<Omit<Partida, 'id' | 'createdAt'>>): Promise<Partida | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (dados.selecaoMandante !== undefined) {
      setClauses.push(`selecao_mandante = $${paramIndex++}`);
      params.push(dados.selecaoMandante);
    }
    if (dados.bandeiraMandante !== undefined) {
      setClauses.push(`bandeira_mandante = $${paramIndex++}`);
      params.push(dados.bandeiraMandante);
    }
    if (dados.selecaoVisitante !== undefined) {
      setClauses.push(`selecao_visitante = $${paramIndex++}`);
      params.push(dados.selecaoVisitante);
    }
    if (dados.bandeiraVisitante !== undefined) {
      setClauses.push(`bandeira_visitante = $${paramIndex++}`);
      params.push(dados.bandeiraVisitante);
    }
    if (dados.dataHorario !== undefined) {
      setClauses.push(`data_horario = $${paramIndex++}`);
      params.push(dados.dataHorario);
    }
    if (dados.local !== undefined) {
      setClauses.push(`local = $${paramIndex++}`);
      params.push(dados.local);
    }
    if (dados.faseTorneio !== undefined) {
      setClauses.push(`fase_torneio = $${paramIndex++}`);
      params.push(dados.faseTorneio);
    }
    if (dados.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      params.push(dados.status);
    }
    if (dados.golsMandante !== undefined) {
      setClauses.push(`gols_mandante = $${paramIndex++}`);
      params.push(dados.golsMandante);
    }
    if (dados.golsVisitante !== undefined) {
      setClauses.push(`gols_visitante = $${paramIndex++}`);
      params.push(dados.golsVisitante);
    }
    if (dados.syncAutomatico !== undefined) {
      setClauses.push(`sync_automatico = $${paramIndex++}`);
      params.push(dados.syncAutomatico);
    }

    if (setClauses.length === 0) return this.findById(id);

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const result = await this.pool.query(
      `UPDATE partida SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params,
    );
    if (result.rows.length === 0) return null;
    return mapRowToPartida(result.rows[0]);
  }

  async registrarResultado(id: string, resultado: RegistrarResultadoDTO): Promise<Partida | null> {
    const result = await this.pool.query(
      `UPDATE partida SET
         gols_mandante = $2,
         gols_visitante = $3,
         status = 'finalizada',
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, resultado.golsMandante, resultado.golsVisitante],
    );
    if (result.rows.length === 0) return null;
    return mapRowToPartida(result.rows[0]);
  }

  async atualizarStatus(id: string, status: StatusPartida): Promise<Partida | null> {
    const result = await this.pool.query(
      `UPDATE partida SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, status],
    );
    if (result.rows.length === 0) return null;
    return mapRowToPartida(result.rows[0]);
  }

  async toggleSync(id: string, syncAutomatico: boolean): Promise<Partida | null> {
    const result = await this.pool.query(
      `UPDATE partida SET sync_automatico = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, syncAutomatico],
    );
    if (result.rows.length === 0) return null;
    return mapRowToPartida(result.rows[0]);
  }
}