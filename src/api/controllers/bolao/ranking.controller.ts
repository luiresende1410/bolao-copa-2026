/**
 * RankingController - Ranking paginado e exportacao CSV
 *
 * Endpoints:
 * - GET /api/v1/bolao/grupos/:id/ranking        - Ranking completo paginado
 * - GET /api/v1/bolao/grupos/:id/ranking/export  - Exportar ranking CSV
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { IRankingService } from '../../../domain/bolao/services/ranking.service';

// === Schemas de validacao Zod ===

const grupoIdParamSchema = z.object({
  id: z.string().uuid('ID do grupo deve ser um UUID valido'),
});

const rankingQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamanhoPagina: z.coerce.number().int().min(1).max(100).default(20),
});

// === Controller ===

export class RankingController {
  constructor(private readonly rankingService: IRankingService) {}

  /**
   * GET /api/v1/bolao/grupos/:id/ranking
   * Retorna ranking paginado de um grupo.
   */
  obterRanking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = grupoIdParamSchema.parse(req.params);
      const query = rankingQuerySchema.parse(req.query);

      const resultado = await this.rankingService.obterRanking(
        id,
        query.pagina,
        query.tamanhoPagina,
      );

      res.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/bolao/grupos/:id/ranking/export
   * Exporta ranking completo em formato CSV.
   */
  exportarCSV = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = grupoIdParamSchema.parse(req.params);

      const csv = await this.rankingService.exportarRankingCSV(id);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ranking-${id}.csv"`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  };
}
