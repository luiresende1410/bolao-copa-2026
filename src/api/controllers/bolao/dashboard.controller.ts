/**
 * Dashboard Controller - Metricas gerais e log de notificacoes do Bolao
 *
 * Endpoints:
 * - GET /api/v1/bolao/dashboard - Metricas gerais do bolao
 * - GET /api/v1/bolao/notificacoes - Log de notificacoes paginado
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import type { IGrupoBolaoRepository } from '../../../domain/bolao/repositories/grupo-bolao.repository';
import type { IParticipanteRepository } from '../../../domain/bolao/repositories/participante.repository';
import type { IPartidaRepository } from '../../../domain/bolao/repositories/partida.repository';
import type { IPalpiteRepository } from '../../../domain/bolao/repositories/palpite.repository';
import type { IPontuacaoRepository } from '../../../domain/bolao/repositories/pontuacao.repository';
import type { INotificacaoLogRepository } from '../../../domain/bolao/repositories/notificacao-log.repository';

/**
 * Schema de validacao para query params do endpoint de notificacoes
 */
const notificacoesQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamanhoPagina: z.coerce.number().int().min(1).max(100).default(20),
  tipo: z.string().optional(),
  status: z.enum(['pendente', 'enviada', 'falha']).optional(),
});

/**
 * Interface de resposta do dashboard
 */
export interface DashboardMetricas {
  totalGrupos: number;
  totalParticipantes: number;
  totalPartidas: number;
  totalPalpites: number;
  taxaAcerto: number;
  partidasFinalizadas: number;
  proximaPartida: {
    id: string;
    selecaoMandante: string;
    selecaoVisitante: string;
    dataHorario: Date;
    local: string;
    faseTorneio: string;
  } | null;
}

export class DashboardController {
  constructor(
    private readonly grupoRepository: IGrupoBolaoRepository,
    private readonly participanteRepository: IParticipanteRepository,
    private readonly partidaRepository: IPartidaRepository,
    private readonly palpiteRepository: IPalpiteRepository,
    private readonly pontuacaoRepository: IPontuacaoRepository,
    private readonly notificacaoLogRepository: INotificacaoLogRepository,
  ) {}

  /**
   * GET /api/v1/bolao/dashboard
   * Retorna metricas gerais do bolao: total grupos, participantes, partidas,
   * palpites, taxa de acerto, partidas finalizadas e proxima partida.
   */
  getDashboard = async (_req: Request, res: Response): Promise<void> => {
    try {
      // Buscar metricas em paralelo para performance
      const [
        gruposResult,
        totalPartidas,
        partidasFinalizadas,
        proximasPartidas,
      ] = await Promise.all([
        this.grupoRepository.findAll({ pagina: 1, tamanhoPagina: 1 }),
        this.partidaRepository.findAll({ pagina: 1, tamanhoPagina: 1 }),
        this.partidaRepository.findAll({ status: 'finalizada', pagina: 1, tamanhoPagina: 1 }),
        this.partidaRepository.findProximas(1),
      ]);

      // Calcular total de participantes somando de todos os grupos
      // Usamos o total do findAll de grupos para obter a contagem
      const totalGrupos = gruposResult.total;

      // Para total de participantes, precisamos somar de todos os grupos
      // Usamos uma abordagem eficiente: buscar todos os grupos e somar participantes
      let totalParticipantes = 0;
      if (totalGrupos > 0) {
        const todosGrupos = await this.grupoRepository.findAll({ pagina: 1, tamanhoPagina: totalGrupos || 100 });
        const contagens = await Promise.all(
          todosGrupos.data.map((grupo) => this.participanteRepository.countByGrupo(grupo.id)),
        );
        totalParticipantes = contagens.reduce((sum, count) => sum + count, 0);
      }

      // Total de palpites: usar contagem de partidas finalizadas para estimar
      // Precisamos contar palpites de todas as partidas
      let totalPalpites = 0;
      const todasPartidas = await this.partidaRepository.findAll({ pagina: 1, tamanhoPagina: totalPartidas.total || 100 });
      const palpiteContagens = await Promise.all(
        todasPartidas.data.map((partida) => this.palpiteRepository.countByPartida(partida.id)),
      );
      totalPalpites = palpiteContagens.reduce((sum, count) => sum + count, 0);

      // Taxa de acerto: percentual de palpites que acertaram algo (nao-erro)
      // Calculamos baseado nas pontuacoes existentes
      let taxaAcerto = 0;
      if (totalPalpites > 0 && partidasFinalizadas.total > 0) {
        // Contar palpites com pontuacao > 0 (acertaram algo)
        let palpitesComAcerto = 0;
        for (const partida of todasPartidas.data.filter((p) => p.status === 'finalizada')) {
          const palpitesPartida = await this.palpiteRepository.findByPartida(partida.id);
          for (const palpite of palpitesPartida) {
            const pontuacao = await this.pontuacaoRepository.findByPalpiteId(palpite.id);
            if (pontuacao && pontuacao.pontos > 0) {
              palpitesComAcerto++;
            }
          }
        }
        const totalPalpitesFinalizados = palpiteContagens
          .filter((_, idx) => todasPartidas.data[idx].status === 'finalizada')
          .reduce((sum, count) => sum + count, 0);

        taxaAcerto = totalPalpitesFinalizados > 0
          ? Math.round((palpitesComAcerto / totalPalpitesFinalizados) * 100 * 100) / 100
          : 0;
      }

      const proximaPartida = proximasPartidas.length > 0
        ? {
            id: proximasPartidas[0].id,
            selecaoMandante: proximasPartidas[0].selecaoMandante,
            selecaoVisitante: proximasPartidas[0].selecaoVisitante,
            dataHorario: proximasPartidas[0].dataHorario,
            local: proximasPartidas[0].local,
            faseTorneio: proximasPartidas[0].faseTorneio,
          }
        : null;

      const metricas: DashboardMetricas = {
        totalGrupos,
        totalParticipantes,
        totalPartidas: totalPartidas.total,
        totalPalpites,
        taxaAcerto,
        partidasFinalizadas: partidasFinalizadas.total,
        proximaPartida,
      };

      res.status(200).json(metricas);
    } catch (error) {
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Erro ao buscar metricas do dashboard',
      });
    }
  };

  /**
   * GET /api/v1/bolao/notificacoes
   * Retorna log de notificacoes paginado com filtros opcionais por tipo e status.
   */
  getNotificacoes = async (req: Request, res: Response): Promise<void> => {
    try {
      const parseResult = notificacoesQuerySchema.safeParse(req.query);

      if (!parseResult.success) {
        res.status(400).json({
          code: 'BOLAO_VALIDATION_ERROR',
          message: 'Parametros de consulta invalidos',
          errors: parseResult.error.flatten().fieldErrors,
        });
        return;
      }

      const { pagina, tamanhoPagina, tipo, status } = parseResult.data;

      const result = await this.notificacaoLogRepository.findAll({
        pagina,
        tamanhoPagina,
        tipo,
        status,
      });

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Erro ao buscar notificacoes',
      });
    }
  };
}
