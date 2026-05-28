/**
 * Entidade RankingEntry - Representa uma entrada no ranking de um grupo de bolao
 */

export interface RankingEntry {
  posicao: number;
  participanteId: string;
  nome: string;
  pontuacaoTotal: number;
  acertosExatos: number;
  acertosVencedor: number;
  variacaoPosicao: number; // positivo = subiu, negativo = desceu
}
