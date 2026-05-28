/**
 * PalpiteController - Registro e listagem de palpites
 *
 * Endpoints:
 * - GET  /api/v1/bolao/partidas/:id/palpites  - Lista palpites de uma partida (admin)
 * - GET  /api/v1/bolao/meus-palpites          - Palpites do participante autenticado
 * - POST /api/v1/bolao/partidas/:id/palpite   - Registrar/atualizar palpite
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { IPalpiteService } from '../../../domain/bolao/services/palpite.service';

// === Schemas de validacao Zod ===

const partidaIdParamSchema = z.object({
  id: z.string().uuid('ID da partida deve ser um UUID valido'),
});

const registrarPalpiteSchema = z.object({
  golsMandante: z.number().int('Gols deve ser inteiro').min(0, 'Gols minimo e 0').max(99, 'Gols maximo e 99'),
  golsVisitante: z.number().int('Gols deve ser inteiro').min(0, 'Gols minimo e 0').max(99, 'Gols maximo e 99'),
});

const meusPalpitesQuerySchema = z.object({
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

// === Controller ===

export class PalpiteController {
  constructor(private readonly palpiteService: IPalpiteService) {}

  /**
   * GET /api/v1/bolao/partidas/:id/palpites
   * Lista todos os palpites de uma partida (visao admin).
   */
  listarPorPartida = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = partidaIdParamSchema.parse(req.params);

      const palpites = await this.palpiteService.listarPalpitesPartida(id);

      res.status(200).json({ data: palpites, total: palpites.length });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/bolao/meus-palpites
   * Lista palpites do participante autenticado.
   */
  meusPalpites = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = meusPalpitesQuerySchema.parse(req.query);
      const participanteId = req.user?.sub ?? '';

      const palpites = await this.palpiteService.listarPalpitesParticipante(
        participanteId,
        query.limite,
      );

      res.status(200).json({ data: palpites, total: palpites.length });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/bolao/partidas/:id/palpite
   * Registra ou atualiza palpite para uma partida.
   */
  registrar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: partidaId } = partidaIdParamSchema.parse(req.params);
      const dados = registrarPalpiteSchema.parse(req.body);
      const participanteId = req.user?.sub ?? '';

      const result = await this.palpiteService.registrarPalpite(
        participanteId,
        partidaId,
        dados.golsMandante,
        dados.golsVisitante,
      );

      if (!result.ok) {
        const error = result.error;
        const statusCode = 'statusCode' in error ? (error as { statusCode: number }).statusCode : 400;
        const code = 'code' in error ? (error as { code: string }).code : 'BOLAO_VALIDATION_ERROR';
        res.status(statusCode).json({
          error: { code, message: error.message },
        });
        return;
      }

      res.status(200).json(result.value);
    } catch (error) {
      next(error);
    }
  };
}
