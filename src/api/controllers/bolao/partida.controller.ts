/**
 * PartidaController - CRUD de partidas, importacao em lote, resultado manual
 *
 * Endpoints:
 * - GET   /api/v1/bolao/partidas              - Lista partidas com filtros
 * - POST  /api/v1/bolao/partidas              - Cadastrar partida
 * - POST  /api/v1/bolao/partidas/importar     - Importacao em lote (ate 64)
 * - PATCH /api/v1/bolao/partidas/:id          - Atualizar partida
 * - POST  /api/v1/bolao/partidas/:id/resultado - Registrar resultado manual
 * - PATCH /api/v1/bolao/partidas/:id/sync     - Ativar/desativar sync automatico
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { IPartidaRepository } from '../../../domain/bolao/repositories/partida.repository';

// === Schemas de validacao Zod ===

const faseTorneioEnum = z.enum([
  'fase_de_grupos',
  'oitavas',
  'quartas',
  'semifinal',
  'terceiro_lugar',
  'final',
]);

const statusPartidaEnum = z.enum(['agendada', 'em_andamento', 'finalizada', 'cancelada']);

const criarPartidaSchema = z.object({
  selecaoMandante: z.string().min(1).max(50, 'Selecao mandante deve ter no maximo 50 caracteres'),
  selecaoVisitante: z.string().min(1).max(50, 'Selecao visitante deve ter no maximo 50 caracteres'),
  dataHorario: z.string().datetime({ message: 'Data/horario deve estar no formato ISO 8601' }),
  local: z.string().min(1).max(100, 'Local deve ter no maximo 100 caracteres'),
  faseTorneio: faseTorneioEnum,
});

const importarPartidasSchema = z.object({
  partidas: z
    .array(criarPartidaSchema)
    .min(1, 'Deve conter ao menos 1 partida')
    .max(64, 'Maximo de 64 partidas por importacao'),
});

const atualizarPartidaSchema = z.object({
  selecaoMandante: z.string().min(1).max(50).optional(),
  selecaoVisitante: z.string().min(1).max(50).optional(),
  dataHorario: z.string().datetime().optional(),
  local: z.string().min(1).max(100).optional(),
  faseTorneio: faseTorneioEnum.optional(),
  status: statusPartidaEnum.optional(),
});

const registrarResultadoSchema = z.object({
  golsMandante: z.number().int('Gols deve ser inteiro').min(0).max(99, 'Gols deve ser no maximo 99'),
  golsVisitante: z.number().int('Gols deve ser inteiro').min(0).max(99, 'Gols deve ser no maximo 99'),
});

const toggleSyncSchema = z.object({
  syncAutomatico: z.boolean(),
});

const listarPartidasQuerySchema = z.object({
  status: statusPartidaEnum.optional(),
  faseTorneio: faseTorneioEnum.optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  tamanhoPagina: z.coerce.number().int().min(1).max(100).default(20),
});

const idParamSchema = z.object({
  id: z.string().uuid('ID deve ser um UUID valido'),
});

// === Controller ===

export class PartidaController {
  constructor(private readonly partidaRepository: IPartidaRepository) {}

  /**
   * GET /api/v1/bolao/partidas
   * Lista partidas com filtros por status e fase.
   */
  listar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listarPartidasQuerySchema.parse(req.query);

      const resultado = await this.partidaRepository.findAll({
        status: query.status,
        faseTorneio: query.faseTorneio,
        pagina: query.pagina,
        tamanhoPagina: query.tamanhoPagina,
      });

      res.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/bolao/partidas
   * Cadastra uma nova partida.
   */
  criar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dados = criarPartidaSchema.parse(req.body);

      const partida = await this.partidaRepository.create(dados);

      res.status(201).json(partida);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/bolao/partidas/importar
   * Importa partidas em lote (ate 64 por requisicao).
   */
  importar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { partidas } = importarPartidasSchema.parse(req.body);

      const criadas = await this.partidaRepository.createBatch(partidas);

      res.status(201).json({ partidas: criadas, total: criadas.length });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/bolao/partidas/:id
   * Atualiza dados de uma partida existente.
   */
  atualizar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const dados = atualizarPartidaSchema.parse(req.body);

      const partida = await this.partidaRepository.findById(id);
      if (!partida) {
        res.status(404).json({
          error: { code: 'BOLAO_PARTIDA_NAO_ENCONTRADA', message: `Partida ${id} nao encontrada` },
        });
        return;
      }

      if (partida.status === 'finalizada' || partida.status === 'cancelada') {
        res.status(400).json({
          error: {
            code: 'BOLAO_PARTIDA_IMUTAVEL',
            message: `Partida ${id} com status "${partida.status}" nao pode ser alterada`,
          },
        });
        return;
      }

      const atualizada = await this.partidaRepository.update(id, {
        ...(dados.selecaoMandante !== undefined && { selecaoMandante: dados.selecaoMandante }),
        ...(dados.selecaoVisitante !== undefined && { selecaoVisitante: dados.selecaoVisitante }),
        ...(dados.dataHorario !== undefined && { dataHorario: new Date(dados.dataHorario) }),
        ...(dados.local !== undefined && { local: dados.local }),
        ...(dados.faseTorneio !== undefined && { faseTorneio: dados.faseTorneio }),
        ...(dados.status !== undefined && { status: dados.status }),
      });

      res.status(200).json(atualizada);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/bolao/partidas/:id/resultado
   * Registra resultado manual de uma partida.
   */
  registrarResultado = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const resultado = registrarResultadoSchema.parse(req.body);

      const partida = await this.partidaRepository.findById(id);
      if (!partida) {
        res.status(404).json({
          error: { code: 'BOLAO_PARTIDA_NAO_ENCONTRADA', message: `Partida ${id} nao encontrada` },
        });
        return;
      }

      const atualizada = await this.partidaRepository.registrarResultado(id, resultado);

      res.status(200).json(atualizada);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/bolao/partidas/:id/sync
   * Ativa ou desativa sincronizacao automatica de uma partida.
   */
  toggleSync = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { syncAutomatico } = toggleSyncSchema.parse(req.body);

      const partida = await this.partidaRepository.findById(id);
      if (!partida) {
        res.status(404).json({
          error: { code: 'BOLAO_PARTIDA_NAO_ENCONTRADA', message: `Partida ${id} nao encontrada` },
        });
        return;
      }

      const atualizada = await this.partidaRepository.toggleSync(id, syncAutomatico);

      res.status(200).json(atualizada);
    } catch (error) {
      next(error);
    }
  };
}
