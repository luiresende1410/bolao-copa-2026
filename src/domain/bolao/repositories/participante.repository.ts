/**
 * Interface de repositorio para Participante
 */

import type { Participante, RegistrarParticipanteDTO } from '../entities';
import type { PaginatedResult } from './index';

export interface IParticipanteRepository {
  /** Busca participante por ID */
  findById(id: string): Promise<Participante | null>;

  /** Busca participante por telefone e grupo */
  findByTelefoneEGrupo(telefone: string, grupoBolaoId: string): Promise<Participante | null>;

  /** Busca participante por telefone (em qualquer grupo) */
  findByTelefone(telefone: string): Promise<Participante[]>;

  /** Lista participantes de um grupo com paginacao */
  findByGrupo(grupoBolaoId: string, pagina: number, tamanhoPagina: number): Promise<PaginatedResult<Participante>>;

  /** Conta participantes de um grupo */
  countByGrupo(grupoBolaoId: string): Promise<number>;

  /** Cria um novo participante */
  create(grupoBolaoId: string, dados: RegistrarParticipanteDTO): Promise<Participante>;

  /** Atualiza pontuacao acumulada e contadores de acertos */
  atualizarPontuacao(
    participanteId: string,
    pontosAdicionais: number,
    acertoExato: boolean,
    acertoVencedor: boolean,
  ): Promise<void>;

  /** Reseta pontuacao (para recalculo) */
  resetarPontuacao(participanteId: string): Promise<void>;
}
