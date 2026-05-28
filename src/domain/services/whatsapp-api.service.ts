/**
 * Interface do servico de envio de mensagens via WhatsApp Cloud API.
 *
 * Utilizado pelo Worker e outros componentes para enviar mensagens
 * de resposta aos participantes.
 */

export interface WhatsAppError {
  code: string;
  message: string;
  statusCode?: number;
}

export interface IWhatsAppApiService {
  /**
   * Envia uma mensagem de texto para um destinatario via WhatsApp Cloud API.
   *
   * @param phoneNumberId - ID do numero WhatsApp remetente (phone_number_id do Meta)
   * @param destinatario - Numero do destinatario no formato E.164 (ex: "5511999999999")
   * @param texto - Conteudo da mensagem de texto (max 4096 chars)
   * @returns ID da mensagem enviada ou erro
   */
  enviarMensagemTexto(
    phoneNumberId: string,
    destinatario: string,
    texto: string,
  ): Promise<{ ok: true; value: string } | { ok: false; error: WhatsAppError }>;
}
