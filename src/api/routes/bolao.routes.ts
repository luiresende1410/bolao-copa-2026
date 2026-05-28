/**
 * Rotas do modulo Bolao Copa 2026
 *
 * Todos os endpoints estao sob /api/v1/bolao/
 * Rotas admin requerem JWT + role admin.
 * Rotas participante requerem JWT + role participante.
 *
 * Endpoints:
 * === Grupos de Bolao (Admin) ===
 * GET    /grupos                    - Lista grupos com contagem de participantes
 * POST   /grupos                    - Criar grupo
 * PATCH  /grupos/:id                - Atualizar grupo (nome, descricao, status)
 * DELETE /grupos/:id                - Excluir grupo (somente sem participantes)
 * GET    /grupos/:id/participantes  - Lista participantes do grupo
 * POST   /grupos/:id/participantes  - Cadastrar participante manualmente
 * GET    /grupos/:id/ranking        - Ranking completo paginado
 * GET    /grupos/:id/ranking/export - Exportar ranking CSV
 *
 * === Partidas (Admin) ===
 * GET    /partidas                  - Lista partidas (filtro por fase, status)
 * POST   /partidas                  - Cadastrar partida
 * POST   /partidas/importar         - Importacao em lote (ate 64)
 * PATCH  /partidas/:id              - Atualizar partida
 * POST   /partidas/:id/resultado    - Registrar resultado manual
 * PATCH  /partidas/:id/sync         - Ativar/desativar sync automatico
 * GET    /partidas/:id/palpites     - Lista palpites de uma partida
 *
 * === Palpites (Participante) ===
 * GET    /meus-palpites             - Palpites do participante autenticado
 * POST   /partidas/:id/palpite      - Registrar/atualizar palpite
 *
 * === Dashboard (Admin) ===
 * GET    /dashboard                 - Metricas gerais do bolao
 * GET    /notificacoes              - Log de notificacoes paginado
 *
 * === Participante ===
 * GET    /ranking                   - Ranking do grupo do participante
 * GET    /proximos-jogos            - Proximas partidas com status palpite
 */

import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/authorize.middleware';
import type { GrupoBolaoController } from '../controllers/bolao/grupo-bolao.controller';
import type { ParticipanteController } from '../controllers/bolao/participante.controller';
import type { PartidaController } from '../controllers/bolao/partida.controller';
import type { PalpiteController } from '../controllers/bolao/palpite.controller';
import type { RankingController } from '../controllers/bolao/ranking.controller';
import type { DashboardController } from '../controllers/bolao/dashboard.controller';
import type { Request, Response } from 'express';

/**
 * Dependencias necessarias para criar as rotas do Bolao.
 */
export interface BolaoRoutesDeps {
  grupoBolaoController: GrupoBolaoController;
  participanteController: ParticipanteController;
  partidaController: PartidaController;
  palpiteController: PalpiteController;
  rankingController: RankingController;
  dashboardController?: DashboardController;
}

/**
 * Cria e retorna o Router do modulo Bolao com todos os endpoints configurados.
 *
 * @param deps - Controllers injetados
 * @returns Router Express configurado para montar em /api/v1/bolao
 */
export function createBolaoRouter(deps: BolaoRoutesDeps): Router {
  const router = Router();

  const {
    grupoBolaoController,
    participanteController,
    partidaController,
    palpiteController,
    rankingController,
    dashboardController,
  } = deps;

  // ============================================================
  // Rotas Admin - Grupos de Bolao
  // ============================================================

  router.get(
    '/grupos',
    requireAuth,
    requireRole('admin'),
    grupoBolaoController.listar,
  );

  router.post(
    '/grupos',
    requireAuth,
    requireRole('admin'),
    grupoBolaoController.criar,
  );

  router.patch(
    '/grupos/:id',
    requireAuth,
    requireRole('admin'),
    grupoBolaoController.atualizar,
  );

  router.delete(
    '/grupos/:id',
    requireAuth,
    requireRole('admin'),
    grupoBolaoController.excluir,
  );

  // ============================================================
  // Rotas Admin - Participantes de Grupo
  // ============================================================

  router.get(
    '/grupos/:id/participantes',
    requireAuth,
    requireRole('admin'),
    participanteController.listar,
  );

  router.post(
    '/grupos/:id/participantes',
    requireAuth,
    requireRole('admin'),
    participanteController.registrar,
  );

  // ============================================================
  // Rotas Admin - Ranking de Grupo
  // ============================================================

  router.get(
    '/grupos/:id/ranking',
    requireAuth,
    requireRole('admin'),
    rankingController.obterRanking,
  );

  router.get(
    '/grupos/:id/ranking/export',
    requireAuth,
    requireRole('admin'),
    rankingController.exportarCSV,
  );

  // ============================================================
  // Rotas Admin - Partidas
  // ============================================================

  router.get(
    '/partidas',
    requireAuth,
    requireRole('admin'),
    partidaController.listar,
  );

  router.post(
    '/partidas',
    requireAuth,
    requireRole('admin'),
    partidaController.criar,
  );

  router.post(
    '/partidas/importar',
    requireAuth,
    requireRole('admin'),
    partidaController.importar,
  );

  router.patch(
    '/partidas/:id',
    requireAuth,
    requireRole('admin'),
    partidaController.atualizar,
  );

  router.post(
    '/partidas/:id/resultado',
    requireAuth,
    requireRole('admin'),
    partidaController.registrarResultado,
  );

  router.patch(
    '/partidas/:id/sync',
    requireAuth,
    requireRole('admin'),
    partidaController.toggleSync,
  );

  // ============================================================
  // Rotas Admin - Palpites (visualizacao)
  // ============================================================

  router.get(
    '/partidas/:id/palpites',
    requireAuth,
    requireRole('admin'),
    palpiteController.listarPorPartida,
  );

  // ============================================================
  // Rotas Participante - Palpites
  // ============================================================

  router.get(
    '/meus-palpites',
    requireAuth,
    requireRole('participante'),
    palpiteController.meusPalpites,
  );

  router.post(
    '/partidas/:id/palpite',
    requireAuth,
    requireRole('participante'),
    palpiteController.registrar,
  );

  // ============================================================
  // Rotas Admin - Dashboard
  // ============================================================

  router.get(
    '/dashboard',
    requireAuth,
    requireRole('admin'),
    dashboardController
      ? dashboardController.getDashboard
      : (_req: Request, res: Response) => {
          res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Dashboard ainda nao implementado' } });
        },
  );

  router.get(
    '/notificacoes',
    requireAuth,
    requireRole('admin'),
    dashboardController
      ? dashboardController.getNotificacoes
      : (_req: Request, res: Response) => {
          res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Notificacoes ainda nao implementado' } });
        },
  );

  // ============================================================
  // Rotas Participante - Ranking e Proximos Jogos
  // ============================================================

  router.get(
    '/ranking',
    requireAuth,
    requireRole('participante'),
    (_req: Request, res: Response) => {
      // Placeholder - usa rankingService.obterRanking com grupo do participante
      // Sera conectado quando o fluxo de participante estiver completo
      res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Ranking participante ainda nao implementado' } });
    },
  );

  router.get(
    '/proximos-jogos',
    requireAuth,
    requireRole('participante'),
    (_req: Request, res: Response) => {
      // Placeholder - usa partidaRepository.findProximas
      // Sera conectado quando o fluxo de participante estiver completo
      res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Proximos jogos ainda nao implementado' } });
    },
  );

  return router;
}

/**
 * Registra as rotas do modulo Bolao no Express app.
 *
 * @param app - Express application instance
 * @param deps - Controllers injetados
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { registerBolaoRoutes } from './api/routes/bolao.routes';
 *
 * const app = express();
 * registerBolaoRoutes(app, {
 *   grupoBolaoController,
 *   participanteController,
 *   partidaController,
 *   palpiteController,
 *   rankingController,
 * });
 * ```
 */
export function registerBolaoRoutes(
  app: { use: (path: string, router: Router) => void },
  deps: BolaoRoutesDeps,
): void {
  const router = createBolaoRouter(deps);
  app.use('/api/v1/bolao', router);
}
