/**
 * Entidade Pontuacao - Representa a pontuacao calculada para um palpite
 */

export type CategoriaPontuacao =
  | 'exato'
  | 'diferenca_gols'
  | 'vencedor'
  | 'empate'
  | 'gols_parcial'
  | 'erro';

export interface Pontuacao {
  id: string;
  palpiteId: string;
  pontos: number;
  categoria: CategoriaPontuacao;
  createdAt: Date;
}

export interface PontuacaoCalculo {
  pontos: number;
  categoria: CategoriaPontuacao;
}
