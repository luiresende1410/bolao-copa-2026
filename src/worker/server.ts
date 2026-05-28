import express from 'express';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  name: 'worker-server',
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
  process.env.SQS_QUEUE_URL ||
  'http://localstack:4566/000000000000/whatsapp-messages';

// Bolao command patterns
const BOLAO_COMMANDS = ['JOGOS', 'RANKING', 'MEUS PALPITES', 'AJUDA', 'ENTRAR'];
const PALPITE_REGEX = /^(.+?)\s+(\d+)\s*x\s*(\d+)\s+(.+)$/i;

interface IncomingMessage {
  messageId: string;
  from: string;
  text: string;
  timestamp: number;
  phoneNumberId: string;
  type: string;
}

/**
 * Checks if a text message is a bolao command.
 */
function isBolaoCommand(text: string): boolean {
  const normalized = text.trim().toUpperCase();
  if (BOLAO_COMMANDS.includes(normalized)) return true;
  if (PALPITE_REGEX.test(text.trim())) return true;
  return false;
}

/**
 * Processes a bolao command and returns the response text.
 */
async function processBolaoCommand(text: string, from: string): Promise<string> {
  const normalized = text.trim().toUpperCase();

  if (normalized === 'JOGOS') {
    const result = await pool.query(
      `SELECT selecao_mandante, selecao_visitante, data_horario
       FROM partida
       WHERE status = 'agendada'
       ORDER BY data_horario ASC
       LIMIT 10`,
    );
    if (result.rows.length === 0) {
      return 'Nenhum jogo agendado no momento.';
    }
    const lines = result.rows.map((r: any) => {
      const date = new Date(r.data_horario).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${r.selecao_mandante} vs ${r.selecao_visitante} - ${date}`;
    });
    return `\u26BD *Proximos Jogos*\n\n${lines.join('\n')}`;
  }

  if (normalized === 'RANKING') {
    const rankResult = await pool.query(
      `SELECT nome, pontuacao_total
       FROM participante
       ORDER BY pontuacao_total DESC NULLS LAST
       LIMIT 10`,
    );
    if (rankResult.rows.length === 0) {
      return 'Ranking ainda nao disponivel.';
    }
    const lines = rankResult.rows.map(
      (r: any, i: number) => `${i + 1}. ${r.nome} - ${r.pontuacao_total || 0} pts`,
    );
    return `\uD83C\uDFC6 *Ranking Top 10*\n\n${lines.join('\n')}`;
  }

  if (normalized === 'MEUS PALPITES') {
    const partResult = await pool.query(
      `SELECT pa.selecao_mandante, pa.selecao_visitante,
              p.gols_mandante, p.gols_visitante, pa.data_horario
       FROM palpite p
       JOIN partida pa ON pa.id = p.partida_id
       JOIN participante part ON part.id = p.participante_id
       WHERE part.telefone = $1
       ORDER BY pa.data_horario DESC
       LIMIT 10`,
      [from],
    );
    if (partResult.rows.length === 0) {
      return 'Voce ainda nao registrou nenhum palpite.';
    }
    const lines = partResult.rows.map(
      (r: any) => `${r.selecao_mandante} ${r.gols_mandante} x ${r.gols_visitante} ${r.selecao_visitante}`,
    );
    return `\uD83D\uDCDD *Seus Palpites*\n\n${lines.join('\n')}`;
  }

  if (normalized === 'AJUDA') {
    return [
      '\uD83E\uDD16 *Comandos do Bolao Copa 2026*',
      '',
      'JOGOS - Ver proximos jogos',
      'RANKING - Ver ranking do grupo',
      'MEUS PALPITES - Ver seus palpites',
      'ENTRAR - Participar do bolao',
      'AJUDA - Ver esta mensagem',
      '',
      'Para registrar palpite:',
      'Brasil 2 x 1 Argentina',
    ].join('\n');
  }

  if (normalized === 'ENTRAR') {
    // Check if participant already exists
    const existing = await pool.query(
      'SELECT id FROM participante WHERE telefone = $1',
      [from],
    );
    if (existing.rows.length > 0) {
      return 'Voce ja esta participando do bolao! Digite AJUDA para ver os comandos.';
    }
    return 'Para entrar no bolao, peca ao administrador do grupo para adicionar seu numero.';
  }

  // Palpite pattern
  const match = text.trim().match(PALPITE_REGEX);
  if (match) {
    const [, mandante, golsM, golsV, visitante] = match;
    const golsMandante = parseInt(golsM, 10);
    const golsVisitante = parseInt(golsV, 10);

    // Find participant
    const partResult = await pool.query(
      'SELECT id FROM participante WHERE telefone = $1',
      [from],
    );
    if (partResult.rows.length === 0) {
      return 'Voce nao esta registrado no bolao. Digite ENTRAR para saber como participar.';
    }
    const participanteId = partResult.rows[0].id;

    // Find match
    const matchResult = await pool.query(
      `SELECT id, data_horario FROM partida
       WHERE UPPER(selecao_mandante) LIKE $1
       AND UPPER(selecao_visitante) LIKE $2
       AND status = 'agendada'
       ORDER BY data_horario ASC LIMIT 1`,
      [`%${mandante!.trim().toUpperCase()}%`, `%${visitante!.trim().toUpperCase()}%`],
    );
    if (matchResult.rows.length === 0) {
      return `Partida ${mandante!.trim()} vs ${visitante!.trim()} nao encontrada ou ja iniciada.`;
    }

    const partida = matchResult.rows[0];
    const now = new Date();
    if (now >= new Date(partida.data_horario)) {
      return 'Janela de palpite fechada! O jogo ja comecou ou esta prestes a comecar.';
    }

    // Upsert palpite
    await pool.query(
      `INSERT INTO palpite (participante_id, partida_id, gols_mandante, gols_visitante)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (participante_id, partida_id)
       DO UPDATE SET gols_mandante = $3, gols_visitante = $4, updated_at = NOW()`,
      [participanteId, partida.id, golsMandante, golsVisitante],
    );

    return `\u2705 Palpite registrado: ${mandante!.trim()} ${golsMandante} x ${golsVisitante} ${visitante!.trim()}`;
  }

  return 'Comando nao reconhecido. Digite AJUDA para ver os comandos disponiveis.';
}

/**
 * Processes a single SQS message.
 */
async function processMessage(message: IncomingMessage): Promise<void> {
  if (message.type !== 'text' || !message.text?.trim()) {
    logger.info({ from: message.from, type: message.type }, 'Skipping non-text message');
    return;
  }

  const text = message.text.trim();

  if (isBolaoCommand(text)) {
    logger.info({ from: message.from, command: text }, 'Processing bolao command');
    const response = await processBolaoCommand(text, message.from);
    logger.info({ from: message.from, response: response.substring(0, 100) }, 'Bolao command processed');
    // In production, would send response back via WhatsApp API
  } else {
    logger.info({ from: message.from }, 'Non-bolao message, skipping (would route to human agent)');
  }
}

/**
 * Main polling loop.
 */
let running = true;

async function pollMessages(): Promise<void> {
  logger.info({ queueUrl: SQS_QUEUE_URL }, 'Starting SQS consumer');

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
          const payload: IncomingMessage = JSON.parse(sqsMessage.Body);
          await processMessage(payload);

          // Delete message after successful processing
          await sqsClient.send(
            new DeleteMessageCommand({
              QueueUrl: SQS_QUEUE_URL,
              ReceiptHandle: sqsMessage.ReceiptHandle,
            }),
          );
        } catch (error) {
          logger.error(
            {
              messageId: sqsMessage.MessageId,
              error: error instanceof Error ? error.message : String(error),
            },
            'Error processing SQS message',
          );
        }
      }

      if (messages.length === 0) {
        // Short sleep between empty polls (long polling already waits 20s)
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error in poll loop',
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  logger.info('Worker consumer stopped');
}

// Optional health check server for Docker
const healthApp = express();
healthApp.get('/health', (_req: any, res: any) => {
  res.json({ status: 'ok', service: 'worker' });
});

const HEALTH_PORT = parseInt(process.env.PORT_WORKER || '3002', 10);
healthApp.listen(HEALTH_PORT, '0.0.0.0', () => {
  logger.info({ port: HEALTH_PORT }, 'Worker health check server started');
});

// Graceful shutdown
function shutdown(): void {
  logger.info('Shutdown signal received');
  running = false;
  pool.end().catch((err) => logger.error({ err }, 'Error closing DB pool'));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start polling
pollMessages().catch((error) => {
  logger.fatal({ error: error instanceof Error ? error.message : String(error) }, 'Fatal error in worker');
  process.exit(1);
});