/**
 * Implementacao PostgreSQL do repositorio de Participante
 */

import type { Pool } from 'pg';
import type { IParticipanteRepository } from '@domain/bolao/repositories';
import type { PaginatedResult } from '@domain/bolao/repositories';
import type { Participante, RegistrarParticipanteDTO } from '@domain/bolao/entities';

function mapRowToParticipante(row: Record<string, unknown>): Participante {
  return {
    id: row.id as string,
    nome: row.nome as string,
    telefone: row.telefone as string,
    grupoBolaoId: row.grupo_bolao_id as string,
    pontuacaoAcumulada: row.pontuacao_acumulada as number,
    acertosExatos: row.acertos_exatos as number,
    acertosVencedor: row.acertos_vencedor as number,
    createdAt: new Date(row.created_at as string),
  };
}

export class ParticipantePostgresRepository implements IParticipanteRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<Participante | null> {
    const result = await this.pool.query(
      'SELECT * FROM participante WHERE id = $1',
      [id],
    );
    if (result.rows.length === 0) return null;
    return mapRowToParticipante(result.rows[0]);
  }

  async findByTelefoneEGrupo(telefone: string, grupoBolaoId: string): Promise<Participante | null> {
    const result = await this.pool.query(
      'SELECT * FROM participante WHERE telefone = $1 AND grupo_bolao_id = $2',
      [telefone, grupoBolaoId],
    );
    if (result.rows.length === 0) return null;
    return mapRowToParticipante(result.rows[0]);
  }

  async findByTelefone(telefone: string): Promise<Participante[]> {
    const result = await this.pool.query(
      'SELECT * FROM participante WHERE telefone = $1 ORDER BY created_at DESC',
      [telefone],
    );
    return result.rows.map(mapRowToParticipante);
  }

  async findByGrupo(grupoBolaoId: string, pagina: number, tamanhoPagina: number): Promise<PaginatedResult<Participante>> {
    const offset = (pagina - 1) * tamanhoPagina;

    const countResult = await this.pool.query(
      'SELECT COUNT(*) as total FROM participante WHERE grupo_bolao_id = $1',
      [grupoBolaoId],
    );
    const total = parseInt(countResult.rows[0].total as string, 10);

    const dataResult = await this.pool.query(
      `SELECT * FROM participante WHERE grupo_bolao_id = $1
       ORDER BY pontuacao_acumulada DESC, acertos_exatos DESC, acertos_vencedor DESC
       LIMIT $2 OFFSET $3`,
      [grupoBolaoId, tamanhoPagina, offset],
    );

    return {
      data: dataResult.rows.map(mapRowToParticipante),
      total,
      pagina,
      tamanhoPagina,
      totalPaginas: Math.ceil(total / tamanhoPagina),
    };
  }

  async countByGrupo(grupoBolaoId: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*) as total FROM participante WHERE grupo_bolao_id = $1',
      [grupoBolaoId],
    );
    return parseInt(result.rows[0].total as string, 10);
  }

  async create(grupoBolaoId: string, dados: RegistrarParticipanteDTO): Promise<Participante> {
    const result = await this.pool.query(
      `INSERT INTO participante (nome, telefone, grupo_bolao_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [dados.nome, dados.telefone, grupoBolaoId],
    );
    return mapRowToParticipante(result.rows[0]);
  }

  async atualizarPontuacao(
    participanteId: string,
    pontosAdicionais: number,
    acertoExato: boolean,
    acertoVencedor: boolean,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE participante SET
         pontuacao_acumulada = pontuacao_acumulada + $2,
         acertos_exatos = acertos_exatos + $3,
         acertos_vencedor = acertos_vencedor + $4
       WHERE id = $1`,
      [participanteId, pontosAdicionais, acertoExato ? 1 : 0, acertoVencedor ? 1 : 0],
    );
  }

  async resetarPontuacao(participanteId: string): Promise<void> {
    await this.pool.query(
      `UPDATE participante SET
         pontuacao_acumulada = 0,
         acertos_exatos = 0,
         acertos_vencedor = 0
       WHERE id = $1`,
      [participanteId],
    );
  }
}