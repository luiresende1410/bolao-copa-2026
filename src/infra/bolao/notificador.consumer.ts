import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  name: 'notificador-consumer',
  timestamp: pino.stdTimeFunctions.isoTime,
});

// PostgreSQL Pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'whatsapp_panel',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
});

// SQS Client
const sqsClient = new SQSClient({
  region: process.env.SQS_REGION || 'us-east-1',
  ...(process.env.AWS_ENDPOINT_URL && {
    endpoint: process.env.AWS_ENDPOINT_URL,
  }),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});

const SQS_QUEUE_URL =
  process.env.SQS_BOLAO_NOTIFICACOES_URL ||
  'http://localstack:4566/000000000000/bolao-notificacoes';

const RATE_LIMIT_PER_SECOND = parseInt(
  process.env.WHATSAPP_RATE_LIMIT_PER_SECOND || '80',
  10,
);

// Rate limiter state
let messagesSentThisSecond = 0;
let currentSecondStart = Date.now();

type NotificationType = 'resultado' | 'lembrete_24h' | 'lembrete_2h' | 'ranking_atualizado';

interface NotificationPayload {
  tipo: NotificationType;
  partidaId?: string;
  grupoId?: string;
  participantes?: string[];
  conteudo?: string;
  timestamp?: string;
}

/**
 * Simple rate limiter: waits if we've exceeded the per-second limit.
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  if (now - currentSecondStart >= 1000) {
    // New second window
    messagesSentThisSecond = 0;
    currentSecondStart = now;
  }

  if (messagesSentThisSecond >= RATE_LIMIT_PER_SECOND) {
    const waitMs = 1000 - (now - currentSecondStart);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    messagesSentThisSecond = 0;
    currentSecondStart = Date.now();
  }

  messagesSentThisSecond++;
}

/**
 * Processes a notification message.
 * In production, would send via WhatsApp Cloud API.
 * For now, logs the notification and records in DB.
 */
async function processNotification(payload: NotificationPayload): Promise<void> {
  await waitForRateLimit();

  const { tipo, partidaId, grupoId, conteudo } = payload;

  switch (tipo) {
    case 'resultado':
      logger.info(
        { tipo, partidaId },
        `Would send resultado notification for match: ${partidaId}`,
      );
      break;
    case 'lembrete_24h':
      logger.info(
        { tipo, partidaId },
        `Would send 24h reminder for match: ${partidaId}`,
      );
      break;
    case 'lembrete_2h':
      logger.info(
        { tipo, partidaId },
        `Would send 2h reminder for match: ${partidaId}`,
      );
      break;
    case 'ranking_atualizado':
      logger.info(
        { tipo, grupoId },
        `Would send ranking update for group: ${grupoId}`,
      );
      break;
    default:
      logger.warn({ tipo }, 'Unknown notification type');
      return;
  }

  // Log to notificacao_log table
  try {
    const logContent = conteudo || `Notification: ${tipo} - ${partidaId || grupoId || 'unknown'}`;
    await pool.query(
      `INSERT INTO notificacao_log (tipo, status, conteudo)
       VALUES ($1, 'enviada', $2)`,
      [tipo, logContent],
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error logging notification to DB',
    );
  }
}

/**
 * Main polling loop.
 */
let running = true;

async function pollNotifications(): Promise<void> {
  logger.info({ queueUrl: SQS_QUEUE_URL }, 'Starting notificador consumer');

  while (running) {
    try {
      const response = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: SQS_QUEUE_URL,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20,
        }),
      );

      const messages = response.Messages || [];

      for (const sqsMessage of messages) {
        if (!sqsMessage.Body || !sqsMessage.ReceiptHandle) continue;

        try {
          const payload: NotificationPayload = JSON.parse(sqsMessage.Body);
          await processNotification(payload);

          // Delete message after successful processing
          await sqsClient.send(
            new DeleteMessageCommand({
              QueueUrl: SQS_QUEUE_URL,
              ReceiptHandle: sqsMessage.ReceiptHandle,
            }),
          );

          logger.debug(
            { messageId: sqsMessage.MessageId, tipo: payload.tipo },
            'Notification processed and deleted',
          );
        } catch (error) {
          logger.error(
            {
              messageId: sqsMessage.MessageId,
              error: error instanceof Error ? error.message : String(error),
            },
            'Error processing notification message',
          );
        }
      }

      if (messages.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error in notification poll loop',
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  logger.info('Notificador consumer stopped');
}

// Graceful shutdown
function shutdown(): void {
  logger.info('Shutdown signal received');
  running = false;
  pool.end().catch((err) => logger.error({ err }, 'Error closing DB pool'));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start
pollNotifications().catch((error) => {
  logger.fatal(
    { error: error instanceof Error ? error.message : String(error) },
    'Fatal error in notificador consumer',
  );
  process.exit(1);
});