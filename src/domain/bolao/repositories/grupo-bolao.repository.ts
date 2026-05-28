/**
 * Interface de repositorio para GrupoBolao
 */

import type { GrupoBolao, CriarGrupoDTO, AtualizarGrupoDTO, FiltroGrupos } from '../entities';
import type { PaginatedResult } from './index';

export interface IGrupoBolaoRepository {
  /** Busca grupo por ID */
  findById(id: string): Promise<GrupoBolao | null>;

  /** Busca grupo por nome (unique) */
  findByNome(nome: string): Promise<GrupoBolao | null>;

  /** Lista grupos com filtros e paginacao */
  findAll(filtros: FiltroGrupos): Promise<PaginatedResult<GrupoBolao>>;

  /** Cria um novo grupo */
  create(dados: CriarGrupoDTO & { criadoPor: string }): Promise<GrupoBolao>;

  /** Atualiza um grupo existente */
  update(id: string, dados: AtualizarGrupoDTO): Promise<GrupoBolao | null>;

  /** Exclui um grupo (somente sem participantes) */
  delete(id: string): Promise<boolean>;

  /** Conta participantes vinculados ao grupo */
  countParticipantes(grupoId: string): Promise<number>;
}
