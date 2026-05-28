/**
 * Entidade Palpite - Representa um palpite de placar registrado por um participante
 */

export interface Palpite {
  id: string;
  participanteId: string;
  partidaId: string;
  golsMandante: number;
  golsVisitante: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlacarReal {
  golsMandante: number;
  golsVisitante: number;
}
