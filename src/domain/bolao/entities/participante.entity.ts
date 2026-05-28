/**
 * Entidade Participante - Representa um participante de um grupo de bolao
 */

export interface Participante {
  id: string;
  nome: string;
  telefone: string;
  grupoBolaoId: string;
  pontuacaoAcumulada: number;
  acertosExatos: number;
  acertosVencedor: number;
  createdAt: Date;
}

export interface RegistrarParticipanteDTO {
  nome: string; // 1-100 chars
  telefone: string; // formato E.164, max 15 digitos
}
