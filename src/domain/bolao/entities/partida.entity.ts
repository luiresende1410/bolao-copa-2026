/**
 * Entidade Partida - Representa uma partida da Copa 2026
 */

export type StatusPartida = 'agendada' | 'em_andamento' | 'finalizada' | 'cancelada';

export type FaseTorneio =
  | 'fase_de_grupos'
  | 'oitavas'
  | 'quartas'
  | 'semifinal'
  | 'terceiro_lugar'
  | 'final';

export interface Partida {
  id: string;
  selecaoMandante: string;
  bandeiraMandante: string;
  selecaoVisitante: string;
  bandeiraVisitante: string;
  dataHorario: Date;
  local: string;
  faseTorneio: FaseTorneio;
  status: StatusPartida;
  golsMandante: number | null;
  golsVisitante: number | null;
  syncAutomatico: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CriarPartidaDTO {
  selecaoMandante: string; // 1-50 chars
  selecaoVisitante: string; // 1-50 chars
  dataHorario: string; // ISO 8601 com timezone
  local: string; // 1-100 chars
  faseTorneio: FaseTorneio;
}

export interface RegistrarResultadoDTO {
  golsMandante: number; // 0-99 inteiro
  golsVisitante: number; // 0-99 inteiro
}
