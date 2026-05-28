/**
 * Interface de repositorio para Pontuacao
 */

import type { Pontuacao, CategoriaPontuacao } from '../entities';

export interface IPontuacaoRepository {
  /** Busca pontuacao por ID */
  findById(id: string): Promise<Pontuacao | null>;

  /** Busca pontuacao pelo palpite (relacao 1:1) */
  findByPalpiteId(palpiteId: string): Promise<Pontuacao | null>;

  /** Lista pontuacoes de um participante (via join com palpite) */
  findByParticipante(participanteId: string): Promise<Pontuacao[]>;

  /** Cria uma nova pontuacao */
  create(palpiteId: string, pontos: number, categoria: CategoriaPontuacao): Promise<Pontuacao>;

  /** Cria multiplas pontuacoes em lote (para calculo de partida inteira) */
  createBatch(pontuacoes: Array<{ palpiteId: string; pontos: number; categoria: CategoriaPontuacao }>): Promise<Pontuacao[]>;

  /** Verifica se pontuacao ja foi calculada para um palpite */
  existsByPalpiteId(palpiteId: string): Promise<boolean>;

  /** Remove pontuacao de um palpite (para recalculo) */
  deleteByPalpiteId(palpiteId: string): Promise<boolean>;

  /** Remove todas as pontuacoes de uma partida (para recalculo completo) */
  deleteByPartidaId(partidaId: string): Promise<number>;

  /** Conta total de pontuacoes registradas */
  countTotal(): Promise<number>;

  /** Conta pontuacoes com categoria diferente de 'erro' (acertos) */
  countAcertos(): Promise<number>;
}
