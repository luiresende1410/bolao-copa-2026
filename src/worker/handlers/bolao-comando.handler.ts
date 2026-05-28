/**
 * Handler de comandos do Bolao Copa 2026 no pipeline do Worker.
 *
 * Responsabilidades:
 * - Detectar se uma mensagem recebida via SQS e um comando do bolao
 * - Processar o comando via ComandoBolaoService
 * - Enviar a resposta de volta ao participante via WhatsApp Cloud API
 * - Tratar erros com mensagens amigaveis
 * - Passar mensagens nao-bolao para o proximo handler no pipeline
 */

import type { IComandoBolaoService } from '@domain/bolao/services/comando-bolao.service';
import type { IWhatsAppApiService } from '@domain/services/whatsapp-api.service';
import logger from '@shared/logger';

/**
 * Estrutura de uma mensagem WhatsApp recebida via SQS.
 * Representa o payload que o Webhook Service publica na fila.
 */
export interface WhatsAppIncomingMessage {
  /** ID unico da mensagem no WhatsApp */
  messageId: string;
  /** Numero do remetente no formato E.164 (ex: "5511999999999") */
  from: string;
  /** Conteudo textual da mensagem */
  text: string;
  /** Timestamp Unix da mensagem */
  timestamp: number;
  /** ID do numero WhatsApp que recebeu a mensagem (phone_number_id) */
  phoneNumberId: string;
  /** Tipo da mensagem (text, image, document, audio, etc.) */
  type: string;
}

/**
 * Resultado do processamento pelo handler.
 */
export interface HandlerResult {
  /** Se o handler processou a mensagem (true) ou deve passar adiante (false) */
  handled: boolean;
}

/**
 * Interface para o proximo handler no pipeline do Worker.
 * Permite encadear handlers em um padrao chain-of-responsibility.
 */
export interface IMessageHandler {
  handle(message: WhatsAppIncomingMessage): Promise<HandlerResult>;
}

/**
 * Handler de comandos do Bolao no pipeline do Worker.
 *
 * Detecta mensagens de texto que sao comandos do bolao,
 * processa via ComandoBolaoService e envia a resposta via WhatsApp.
 * Mensagens que nao sao comandos do bolao sao passadas ao proximo handler.
 */
export class BolaoComandoHandler implements IMessageHandler {
  constructor(
    private readonly comandoBolaoService: IComandoBolaoService,
    private readonly whatsAppApiService: IWhatsAppApiService,
    private readonly nextHandler?: IMessageHandler,
  ) {}

  /**
   * Processa uma mensagem recebida do SQS.
   *
   * Fluxo:
   * 1. Verifica se e mensagem de texto
   * 2. Tenta identificar como comando bolao (via identificarComando ou parsearComandoPalpite)
   * 3. Se for comando bolao, processa e envia resposta
   * 4. Se nao for, delega ao proximo handler
   */
  async handle(message: WhatsAppIncomingMessage): Promise<HandlerResult> {
    // Somente mensagens de texto podem ser comandos do bolao
    if (message.type !== 'text' || !message.text?.trim()) {
      return this.passToNext(message);
    }

    const texto = message.text.trim();

    // Detectar se e um comando do bolao
    if (!this.isComandoBolao(texto)) {
      return this.passToNext(message);
    }

    // Processar comando do bolao
    try {
      logger.info(
        { from: message.from, messageId: message.messageId },
        'Processando comando bolao',
      );

      const resposta = await this.comandoBolaoService.processarMensagem(
        message.from,
        texto,
      );

      // Se resposta e null, o participante esta silenciado por rate limit
      if (resposta === null) {
        logger.debug(
          { from: message.from },
          'Participante silenciado por rate limit, ignorando mensagem',
        );
        return { handled: true };
      }

      // Enviar resposta via WhatsApp Cloud API
      const envioResult = await this.whatsAppApiService.enviarMensagemTexto(
        message.phoneNumberId,
        message.from,
        resposta.conteudo,
      );

      if (!envioResult.ok) {
        logger.error(
          {
            from: message.from,
            error: envioResult.error,
            messageId: message.messageId,
          },
          'Falha ao enviar resposta do bolao via WhatsApp',
        );
        // Tenta enviar mensagem de erro amigavel ao participante
        await this.enviarMensagemErro(message.phoneNumberId, message.from);
      } else {
        logger.info(
          {
            from: message.from,
            whatsappMessageId: envioResult.value,
          },
          'Resposta do bolao enviada com sucesso',
        );
      }

      return { handled: true };
    } catch (error) {
      logger.error(
        {
          from: message.from,
          messageId: message.messageId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Erro inesperado ao processar comando bolao',
      );

      // Tenta enviar mensagem de erro amigavel
      await this.enviarMensagemErro(message.phoneNumberId, message.from);

      return { handled: true };
    }
  }

  /**
   * Detecta se o texto e um comando do bolao.
   *
   * Verifica:
   * 1. Se e um comando explicito (JOGOS, RANKING, MEUS PALPITES, AJUDA, ENTRAR)
   * 2. Se e um formato de palpite (ex: "Brasil 2 x 1 Argentina")
   */
  private isComandoBolao(texto: string): boolean {
    // Verificar comandos explicitos
    const comando = this.comandoBolaoService.identificarComando(texto);
    if (comando !== null) {
      return true;
    }

    // Verificar se e formato de palpite
    const parsePalpite = this.comandoBolaoService.parsearComandoPalpite(texto);
    if (parsePalpite.ok) {
      return true;
    }

    return false;
  }

  /**
   * Delega a mensagem ao proximo handler no pipeline.
   * Se nao ha proximo handler, retorna handled: false.
   */
  private async passToNext(message: WhatsAppIncomingMessage): Promise<HandlerResult> {
    if (this.nextHandler) {
      return this.nextHandler.handle(message);
    }
    return { handled: false };
  }

  /**
   * Envia uma mensagem de erro amigavel ao participante.
   * Nao propaga erros - falhas no envio sao apenas logadas.
   */
  private async enviarMensagemErro(
    phoneNumberId: string,
    destinatario: string,
  ): Promise<void> {
    const mensagemErro =
      'Desculpe, ocorreu um erro ao processar sua mensagem. ' +
      'Por favor, tente novamente em alguns instantes. ' +
      'Digite AJUDA para ver os comandos disponiveis.';

    try {
      await this.whatsAppApiService.enviarMensagemTexto(
        phoneNumberId,
        destinatario,
        mensagemErro,
      );
    } catch (error) {
      logger.error(
        {
          destinatario,
          error: error instanceof Error ? error.message : String(error),
        },
        'Falha ao enviar mensagem de erro amigavel',
      );
    }
  }
}
