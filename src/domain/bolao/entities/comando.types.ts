/**
 * Tipos relacionados a comandos WhatsApp do Bolao
 */

export type TipoComando = 'PALPITE' | 'JOGOS' | 'RANKING' | 'MEUS_PALPITES' | 'AJUDA' | 'ENTRAR';

export interface ComandoPalpite {
  selecaoMandante: string;
  golsMandante: number;
  golsVisitante: number;
  selecaoVisitante: string;
}

export interface RespostaComando {
  tipo: 'texto';
  conteudo: string;
}
