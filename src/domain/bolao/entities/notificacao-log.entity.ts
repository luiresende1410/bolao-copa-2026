/**
 * Entidade NotificacaoLog - Registro de notificacoes enviadas via WhatsApp
 */

export type StatusNotificacao = 'pendente' | 'enviada' | 'falha';

export interface NotificacaoLog {
  id: string;
  participanteId: string;
  tipo: string;
  status: StatusNotificacao;
  conteudo: string | null;
  whatsappMessageId: string | null;
  createdAt: Date;
}
