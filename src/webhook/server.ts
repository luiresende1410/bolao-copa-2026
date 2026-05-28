import express from 'express';
import crypto from 'crypto';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  name: 'webhook-server',
  timestamp: pino.stdTimeFunctions.isoTime,
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

const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || '';
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';

const app = express();

// Parse raw body for signature verification
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

/**
 * Validates the X-Hub-Signature-256 header from WhatsApp webhook.
 */
function validateSignature(rawBody: Buffer, signature: string): boolean {
  if (!WHATSAPP_APP_SECRET) {
    logger.warn('WHATSAPP_APP_SECRET not set, skipping signature validation');
    return true;
  }

  if (!signature) {
    return false;
  }

  const expectedSignature =
    'sha256=' +
    crypto
      .createHmac('sha256', WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}

// GET /webhook - Verification endpoint
app.get('/webhook', (req: any, res: any) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    logger.info('Webhook verification successful');
    return res.status(200).send(challenge);
  }

  logger.warn({ mode, token }, 'Webhook verification failed');
  return res.status(403).json({ error: 'Verification failed' });
});

// POST /webhook - Receive WhatsApp webhook events
app.post('/webhook', async (req: any, res: any) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;

    if (!validateSignature(req.rawBody, signature)) {
      logger.warn('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const body = req.body;

    // Extract messages from WhatsApp webhook payload
    const entries = body?.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value;
        if (!value?.messages) continue;

        for (const message of value.messages) {
          const sqsPayload = {
            messageId: message.id,
            from: message.from,
            text: message.text?.body || '',
            timestamp: parseInt(message.timestamp, 10),
            phoneNumberId: value.metadata?.phone_number_id || '',
            type: message.type || 'text',
          };

          logger.info(
            { from: sqsPayload.from, type: sqsPayload.type },
            'Publishing message to SQS',
          );

          await sqsClient.send(
            new SendMessageCommand({
              QueueUrl: SQS_QUEUE_URL,
              MessageBody: JSON.stringify(sqsPayload),
            }),
          );
        }
      }
    }

    // WhatsApp expects 200 response quickly
    return res.status(200).json({ status: 'received' });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error processing webhook',
    );
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /health - Health check
app.get('/health', (_req: any, res: any) => {
  res.json({ status: 'ok', service: 'webhook' });
});

const PORT = parseInt(process.env.PORT_WEBHOOK || '3001', 10);

app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'Webhook server started');
});