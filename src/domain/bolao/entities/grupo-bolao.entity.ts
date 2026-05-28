/**
 * Entidade GrupoBolao - Representa um grupo de bolao da Copa 2026
 */

export type StatusGrupoBolao = 'aberto' | 'fechado' | 'finalizado';

export interface GrupoBolao {
  id: string;
  nome: string;
  descricao: string | null;
  status: StatusGrupoBolao;
  criadoPor: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CriarGrupoDTO {
  nome: string; // 1-100 chars
  descricao?: string; // ate 500 chars
}

export interface AtualizarGrupoDTO {
  nome?: string;
  descricao?: string;
  status?: StatusGrupoBolao;
}

export interface FiltroGrupos {
  status?: StatusGrupoBolao;
  pagina?: number;
  tamanhoPagina?: number;
}
