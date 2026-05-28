import { z } from 'zod';

const envSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT_API: z.coerce.number().int().positive().default(3000),
  PORT_WEBHOOK: z.coerce.number().int().positive().default(3001),
  PORT_WORKER: z.coerce.number().int().positive().default(3002),

  // PostgreSQL
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_SSL: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Redis
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_TLS: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),

  // SQS
  SQS_QUEUE_URL: z.string().url(),
  SQS_REGION: z.string().min(1).default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_ENDPOINT_URL: z.string().url().optional(),

  // WhatsApp Cloud API (secrets - stored only in env vars per Requirement 9.6)
  WHATSAPP_APP_SECRET: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_API_VERSION: z.string().min(1).default('v18.0'),
  WHATSAPP_API_BASE_URL: z.string().url().default('https://graph.facebook.com'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default('whatsapp-panel'),
  JWT_EXPIRATION: z.string().min(1).default('8h'),

  // Bcrypt
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).default(10),

  // Logging
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const errors = Object.entries(formatted)
      .filter(([key]) => key !== '_errors')
      .map(([key, value]) => {
        const messages = (value as { _errors?: string[] })?._errors ?? [];
        return `  ${key}: ${messages.join(', ')}`;
      })
      .join('\n');

    throw new Error(
      `Environment variable validation failed:\n${errors}`
    );
  }

  return result.data;
}

export const env = loadEnv();
