import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  name: 'sincronizador-task',
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

const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS || '300000', 10);

let running = true;

/**
 * Checks for matches with status 'em_andamento' and sync_automatico = true,
 * and would sync them with an external API.
 */
async function syncCycle(): Promise<void> {
  logger.info('Starting sync cycle');

  try {
    const result = await pool.query(
      `SELECT id, selecao_mandante, selecao_visitante, status
       FROM partida
       WHERE status = 'em_andamento'
       AND sync_automatico = true`,
    );

    if (result.rows.length === 0) {
      logger.info('No matches to sync');
      return;
    }

    logger.info({ count: result.rows.length }, 'Found matches to sync');

    for (const row of result.rows) {
      // In production, would call external API to get live scores
      logger.info(
        {
          id: row.id,
          match: `${row.selecao_mandante} vs ${row.selecao_visitante}`,
        },
        `Would sync match: ${row.id}`,
      );
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error in sync cycle',
    );
  }
}

/**
 * Main loop: runs sync cycle every SYNC_INTERVAL_MS.
 */
async function main(): Promise<void> {
  logger.info(
    { intervalMs: SYNC_INTERVAL_MS },
    'Sincronizador task started',
  );

  while (running) {
    await syncCycle();

    // Sleep for the configured interval, with early exit on shutdown
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SYNC_INTERVAL_MS);
      const checkShutdown = setInterval(() => {
        if (!running) {
          clearTimeout(timer);
          clearInterval(checkShutdown);
          resolve();
        }
      }, 1000);
      // Clean up interval when timer fires normally
      setTimeout(() => clearInterval(checkShutdown), SYNC_INTERVAL_MS + 100);
    });
  }

  logger.info('Sincronizador task stopped');
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
main().catch((error) => {
  logger.fatal({ error: error instanceof Error ? error.message : String(error) }, 'Fatal error in sincronizador');
  process.exit(1);
});