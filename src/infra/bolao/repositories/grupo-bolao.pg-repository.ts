/**
 * Implementacao PostgreSQL do repositorio de GrupoBolao
 */

import type { Pool } from 'pg';
import type { IGrupoBolaoRepository } from '@domain/bolao/repositories';
import type { PaginatedResult } from '@domain/bolao/repositories';
import type { GrupoBolao, CriarGrupoDTO, AtualizarGrupoDTO, FiltroGrupos } from '@domain/bolao/entities';

function mapRowToGrupoBolao(row: Record<string, unknown>): GrupoBolao {
  return {
    id: row.id as string,
    nome: row.nome as string,
    descricao: (row.descricao as string) ?? null,
    status: row.status as GrupoBolao['status'],
    criadoPor: row.criado_por as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export class GrupoBolaoPostgresRepository implements IGrupoBolaoRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<GrupoBolao | null> {
    const result = await this.pool.query(
      'SELECT * FROM grupo_bolao WHERE id = $1',
      [id],
    );
    if (result.rows.length === 0) return null;
    return mapRowToGrupoBolao(result.rows[0]);
  }

  async findByNome(nome: string): Promise<GrupoBolao | null> {
    const result = await this.pool.query(
      'SELECT * FROM grupo_bolao WHERE nome = $1',
      [nome],
    );
    if (result.rows.length === 0) return null;
    return mapRowToGrupoBolao(result.rows[0]);
  }

  async findAll(filtros: FiltroGrupos): Promise<PaginatedResult<GrupoBolao>> {
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM grupo_bolao ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total as string, 10);

    const dataResult = await this.pool.query(
      `SELECT * FROM grupo_bolao ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, tamanhoPagina, offset],
    );

    return {
      data: dataResult.rows.map(mapRowToGrupoBolao),
      total,
      pagina,
      tamanhoPagina,
      totalPaginas: Math.ceil(total / tamanhoPagina),
    };
  }

  async create(dados: CriarGrupoDTO & { criadoPor: string }): Promise<GrupoBolao> {
    const result = await this.pool.query(
      `INSERT INTO grupo_bolao (nome, descricao, criado_por)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [dados.nome, dados.descricao ?? null, dados.criadoPor],
    );
    return mapRowToGrupoBolao(result.rows[0]);
  }

  async update(id: string, dados: AtualizarGrupoDTO): Promise<GrupoBolao | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (dados.nome !== undefined) {
      setClauses.push(`nome = $${paramIndex++}`);
      params.push(dados.nome);
    }
    if (dados.descricao !== undefined) {
      setClauses.push(`descricao = $${paramIndex++}`);
      params.push(dados.descricao);
    }
    if (dados.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      params.push(dados.status);
    }

    if (setClauses.length === 0) return this.findById(id);

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const result = await this.pool.query(
      `UPDATE grupo_bolao SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params,
    );
    if (result.rows.length === 0) return null;
    return mapRowToGrupoBolao(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM grupo_bolao WHERE id = $1',
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async countParticipantes(grupoId: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*) as total FROM participante WHERE grupo_bolao_id = $1',
      [grupoId],
    );
    return parseInt(result.rows[0].total as string, 10);
  }
}
