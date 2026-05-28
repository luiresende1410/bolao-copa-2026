/**
 * Interface de repositorio para Palpite
 */

import type { Palpite } from '../entities';
import type { PaginatedResult } from './index';

export interface IPalpiteRepository {
  /** Busca palpite por ID */
  findById(id: string): Promise<Palpite | null>;

  /** Busca palpite por participante e partida (unique) */
  findByParticipanteEPartida(participanteId: string, partidaId: string): Promise<Palpite | null>;

  /** Lista palpites de um participante (ordenados por data desc) */
  findByParticipante(participanteId: string, limite: number): Promise<Palpite[]>;

  /** Lista palpites de um participante com paginacao */
  findByParticipantePaginado(participanteId: string, pagina: number, tamanhoPagina: number): Promise<PaginatedResult<Palpite>>;

  /** Lista todos os palpites de uma partida */
  findByPartida(partidaId: string): Promise<Palpite[]>;

  /** Registra ou atualiza palpite (UPSERT por participante + partida) */
  upsert(participanteId: string, partidaId: string, golsMandante: number, golsVisitante: number): Promise<Palpite>;

  /** Conta palpites de uma partida */
  countByPartida(partidaId: string): Promise<number>;
}
