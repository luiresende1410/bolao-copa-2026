/**
 * GrupoBolaoController - CRUD de grupos de bolao
 *
 * Endpoints:
 * - GET    /api/v1/bolao/grupos       - Lista grupos com paginacao
 * - POST   /api/v1/bolao/grupos       - Criar grupo
 * - PATCH  /api/v1/bolao/grupos/:id   - Atualizar grupo
 * - DELETE /api/v1/bolao/grupos/:id   - Excluir grupo
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { IBolaoService } from '../../../domain/bolao/services/bolao.service';

// === Schemas de validacao Zod ===

const criarGrupoSchema = z.object({
  nome: z.string().min(1, 'Nome e obrigatorio').max(100, 'Nome deve ter no maximo 100 caracteres'),
  descricao: z.string().max(500, 'Descricao deve ter no maximo 500 caracteres').optional(),
});

const atualizarGrupoSchema = z.object({
  nome: z.string().min(1, 'Nome e obrigatorio').max(100, 'Nome deve ter no maximo 100 caracteres').optional(),
  descricao: z.string().max(500, 'Descricao deve ter no maximo 500 caracteres').optional(),
  status: z.enum(['aberto', 'fechado', 'finalizado']).optional(),
});

const listarGruposQuerySchema = z.object({
  status: z.enum(['aberto', 'fechado', 'finalizado']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  tamanhoPagina: z.coerce.number().int().min(1).max(100).default(20),
});

const idParamSchema = z.object({
  id: z.string().uuid('ID deve ser um UUID valido'),
});

// === Controller ===

export class GrupoBolaoController {
  constructor(private readonly bolaoService: IBolaoService) {}

  /**
   * GET /api/v1/bolao/grupos
   * Lista grupos com paginacao e filtro por status.
   */
  listar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listarGruposQuerySchema.parse(req.query);

      const resultado = await this.bolaoService.listarGrupos({
        status: query.status,
        pagina: query.pagina,
        tamanhoPagina: query.tamanhoPagina,
      });

      res.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/bolao/grupos
   * Cria um novo grupo de bolao.
   */
  criar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dados = criarGrupoSchema.parse(req.body);
      const criadoPor = req.user?.sub ?? '';

      const result = await this.bolaoService.criarGrupo(dados, criadoPor);

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

  /**
   * PATCH /api/v1/bolao/grupos/:id
   * Atualiza um grupo existente (nome, descricao, status).
   */
  atualizar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const dados = atualizarGrupoSchema.parse(req.body);

      const result = await this.bolaoService.atualizarGrupo(id, dados);

      if (!result.ok) {
        const error = result.error;
        res.status(error.statusCode).json({
          error: { code: error.code, message: error.message },
        });
        return;
      }

      res.status(200).json(result.value);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/bolao/grupos/:id
   * Exclui um grupo (somente se nao tiver participantes).
   */
  excluir = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = idParamSchema.parse(req.params);

      const result = await this.bolaoService.excluirGrupo(id);

      if (!result.ok) {
        const error = result.error;
        res.status(error.statusCode).json({
          error: { code: error.code, message: error.message },
        });
        return;
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
