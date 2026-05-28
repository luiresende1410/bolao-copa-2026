/**
 * Interface de repositorio para Partida
 */

import type { Partida, CriarPartidaDTO, RegistrarResultadoDTO, StatusPartida, FaseTorneio } from '../entities';
import type { PaginatedResult } from './index';

export interface FiltroPartidas {
  status?: StatusPartida;
  faseTorneio?: FaseTorneio;
  pagina?: number;
  tamanhoPagina?: number;
}

export interface IPartidaRepository {
  /** Busca partida por ID */
  findById(id: string): Promise<Partida | null>;

  /** Lista partidas com filtros e paginacao */
  findAll(filtros: FiltroPartidas): Promise<PaginatedResult<Partida>>;

  /** Lista proximas partidas agendadas (ordenadas por data) */
  findProximas(limite: number): Promise<Partida[]>;

  /** Lista partidas em andamento (para sincronizador) */
  findEmAndamento(): Promise<Partida[]>;

  /** Lista partidas com sync automatico ativo e status agendada/em_andamento */
  findParaSincronizar(): Promise<Partida[]>;

  /** Cria uma nova partida */
  create(dados: CriarPartidaDTO): Promise<Partida>;

  /** Cria multiplas partidas em lote (importacao) */
  createBatch(dados: CriarPartidaDTO[]): Promise<Partida[]>;

  /** Atualiza dados de uma partida */
  update(id: string, dados: Partial<Omit<Partida, 'id' | 'createdAt'>>): Promise<Partida | null>;

  /** Registra resultado (gols) de uma partida */
  registrarResultado(id: string, resultado: RegistrarResultadoDTO): Promise<Partida | null>;

  /** Atualiza status da partida */
  atualizarStatus(id: string, status: StatusPartida): Promise<Partida | null>;

  /** Ativa/desativa sync automatico */
  toggleSync(id: string, syncAutomatico: boolean): Promise<Partida | null>;
}
