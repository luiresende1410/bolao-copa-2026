/**
 * ParticipanteController - Gestao de participantes de grupos de bolao
 *
 * Endpoints:
 * - GET  /api/v1/bolao/grupos/:id/participantes  - Lista participantes do grupo
 * - POST /api/v1/bolao/grupos/:id/participantes  - Cadastrar participante manualmente
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { IBolaoService } from '../../../domain/bolao/services/bolao.service';
import type { IParticipanteRepository } from '../../../domain/bolao/repositories/participante.repository';

// === Schemas de validacao Zod ===

const grupoIdParamSchema = z.object({
  id: z.string().uuid('ID do grupo deve ser um UUID valido'),
});

const registrarParticipanteSchema = z.object({
  nome: z.string().min(1, 'Nome e obrigatorio').max(100, 'Nome deve ter no maximo 100 caracteres'),
  telefone: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, 'Telefone deve estar no formato E.164 (ex: +5511999998888)'),
});

const listarParticipantesQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamanhoPagina: z.coerce.number().int().min(1).max(100).default(20),
});

// === Controller ===

export class ParticipanteController {
  constructor(
    private readonly bolaoService: IBolaoService,
    private readonly participanteRepository: IParticipanteRepository,
  ) {}

  /**
   * GET /api/v1/bolao/grupos/:id/participantes
   * Lista participantes de um grupo com paginacao.
   */
  listar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = grupoIdParamSchema.parse(req.params);
      const query = listarParticipantesQuerySchema.parse(req.query);

      const resultado = await this.participanteRepository.findByGrupo(
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
   * POST /api/v1/bolao/grupos/:id/participantes
   * Cadastra um participante manualmente em um grupo.
   */
  registrar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = grupoIdParamSchema.parse(req.params);
      const dados = registrarParticipanteSchema.parse(req.body);

      const result = await this.bolaoService.registrarParticipante(id, dados);

      if (!result.ok) {
        const error = result.error;
        res.status(error.statusCode).json({
          error: { code: error.code, message: error.message },
        });
        return;
      }

      res.status(201).json(result.value);
    } catch (error) {
      next(error);
    }
  };
}
