/**
 * Unit tests para DashboardController
 *
 * Testa os endpoints:
 * - GET /api/v1/bolao/dashboard (metricas gerais)
 * - GET /api/v1/bolao/notificacoes (log paginado)
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { DashboardController } from '../../../src/api/controllers/bolao/dashboard.controller';
import type { IGrupoBolaoRepository } from '../../../src/domain/bolao/repositories/grupo-bolao.repository';
import type { IParticipanteRepository } from '../../../src/domain/bolao/repositories/participante.repository';
import type { IPartidaRepository } from '../../../src/domain/bolao/repositories/partida.repository';
import type { IPalpiteRepository } from '../../../src/domain/bolao/repositories/palpite.repository';
import type { IPontuacaoRepository } from '../../../src/domain/bolao/repositories/pontuacao.repository';
import type { INotificacaoLogRepository } from '../../../src/domain/bolao/repositories/notificacao-log.repository';

function createMockResponse(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function createMockRequest(query: Record<string, string> = {}): Request {
  return { query } as unknown as Request;
}

describe('DashboardController', () => {
  let controller: DashboardController;
  let grupoRepository: IGrupoBolaoRepository;
  let participanteRepository: IParticipanteRepository;
  let partidaRepository: IPartidaRepository;
  let palpiteRepository: IPalpiteRepository;
  let pontuacaoRepository: IPontuacaoRepository;
  let notificacaoLogRepository: INotificacaoLogRepository;

  beforeEach(() => {
    grupoRepository = {
      findById: vi.fn(),
      findByNome: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      countParticipantes: vi.fn(),
    } as unknown as IGrupoBolaoRepository;

    participanteRepository = {
      findById: vi.fn(),
      findByTelefoneEGrupo: vi.fn(),
      findByTelefone: vi.fn(),
      findByGrupo: vi.fn(),
      countByGrupo: vi.fn(),
      create: vi.fn(),
      atualizarPontuacao: vi.fn(),
      resetarPontuacao: vi.fn(),
    } as unknown as IParticipanteRepository;

    partidaRepository = {
      findById: vi.fn(),
      findAll: vi.fn(),
      findProximas: vi.fn(),
      findEmAndamento: vi.fn(),
      findParaSincronizar: vi.fn(),
      create: vi.fn(),
      createBatch: vi.fn(),
      update: vi.fn(),
      registrarResultado: vi.fn(),
      atualizarStatus: vi.fn(),
      toggleSync: vi.fn(),
    } as unknown as IPartidaRepository;

    palpiteRepository = {
      findById: vi.fn(),
      findByParticipanteEPartida: vi.fn(),
      findByParticipante: vi.fn(),
      findByParticipantePaginado: vi.fn(),
      findByPartida: vi.fn(),
      upsert: vi.fn(),
      countByPartida: vi.fn(),
    } as unknown as IPalpiteRepository;

    pontuacaoRepository = {
      findById: vi.fn(),
      findByPalpiteId: vi.fn(),
      findByParticipante: vi.fn(),
      create: vi.fn(),
      createBatch: vi.fn(),
      existsByPalpiteId: vi.fn(),
      deleteByPalpiteId: vi.fn(),
      deleteByPartidaId: vi.fn(),
    } as unknown as IPontuacaoRepository;

    notificacaoLogRepository = {
      findById: vi.fn(),
      findAll: vi.fn(),
      findByParticipante: vi.fn(),
      create: vi.fn(),
      atualizarStatus: vi.fn(),
      count: vi.fn(),
      countByStatus: vi.fn(),
    } as unknown as INotificacaoLogRepository;

    controller = new DashboardController(
      grupoRepository,
      participanteRepository,
      partidaRepository,
      palpiteRepository,
      pontuacaoRepository,
      notificacaoLogRepository,
    );
  });

  describe('getDashboard', () => {
    it('deve retornar metricas gerais com dados vazios', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      vi.mocked(grupoRepository.findAll).mockResolvedValue({
        data: [],
        total: 0,
        pagina: 1,
        tamanhoPagina: 1,
        totalPaginas: 0,
      });
      vi.mocked(partidaRepository.findAll).mockResolvedValue({
        data: [],
        total: 0,
        pagina: 1,
        tamanhoPagina: 1,
        totalPaginas: 0,
      });
      vi.mocked(partidaRepository.findProximas).mockResolvedValue([]);

      await controller.getDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        totalGrupos: 0,
        totalParticipantes: 0,
        totalPartidas: 0,
        totalPalpites: 0,
        taxaAcerto: 0,
        partidasFinalizadas: 0,
        proximaPartida: null,
      });
    });

    it('deve retornar metricas com dados populados', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const grupoMock = {
        id: 'grupo-1',
        nome: 'Grupo A',
        descricao: null,
        status: 'aberto' as const,
        criadoPor: 'admin-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const partidaMock = {
        id: 'partida-1',
        selecaoMandante: 'Brasil',
        bandeiraMandante: '🇧🇷',
        selecaoVisitante: 'Argentina',
        bandeiraVisitante: '🇦🇷',
        dataHorario: new Date('2026-06-15T20:00:00Z'),
        local: 'Maracana',
        faseTorneio: 'fase_de_grupos' as const,
        status: 'agendada' as const,
        golsMandante: null,
        golsVisitante: null,
        syncAutomatico: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First call: total groups
      vi.mocked(grupoRepository.findAll).mockResolvedValueOnce({
        data: [grupoMock],
        total: 2,
        pagina: 1,
        tamanhoPagina: 1,
        totalPaginas: 2,
      });

      // First call for partidas: total
      vi.mocked(partidaRepository.findAll).mockResolvedValueOnce({
        data: [partidaMock],
        total: 5,
        pagina: 1,
        tamanhoPagina: 1,
        totalPaginas: 5,
      });

      // Second call for partidas: finalizadas
      vi.mocked(partidaRepository.findAll).mockResolvedValueOnce({
        data: [],
        total: 1,
        pagina: 1,
        tamanhoPagina: 1,
        totalPaginas: 1,
      });

      vi.mocked(partidaRepository.findProximas).mockResolvedValue([partidaMock]);

      // For total participantes: findAll returns all groups
      vi.mocked(grupoRepository.findAll).mockResolvedValueOnce({
        data: [grupoMock, { ...grupoMock, id: 'grupo-2', nome: 'Grupo B' }],
        total: 2,
        pagina: 1,
        tamanhoPagina: 100,
        totalPaginas: 1,
      });

      vi.mocked(participanteRepository.countByGrupo).mockResolvedValue(10);

      // For total palpites: findAll returns all partidas
      vi.mocked(partidaRepository.findAll).mockResolvedValueOnce({
        data: [partidaMock],
        total: 5,
        pagina: 1,
        tamanhoPagina: 100,
        totalPaginas: 1,
      });

      vi.mocked(palpiteRepository.countByPartida).mockResolvedValue(8);

      await controller.getDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonCall = vi.mocked(res.json).mock.calls[0][0];
      expect(jsonCall.totalGrupos).toBe(2);
      expect(jsonCall.totalPartidas).toBe(5);
      expect(jsonCall.proximaPartida).not.toBeNull();
      expect(jsonCall.proximaPartida.selecaoMandante).toBe('Brasil');
      expect(jsonCall.proximaPartida.selecaoVisitante).toBe('Argentina');
    });

    it('deve retornar 500 quando ocorre erro interno', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      vi.mocked(grupoRepository.findAll).mockRejectedValue(new Error('DB connection failed'));

      await controller.getDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        code: 'INTERNAL_ERROR',
        message: 'Erro ao buscar metricas do dashboard',
      });
    });
  });

  describe('getNotificacoes', () => {
    it('deve retornar notificacoes paginadas com parametros default', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockResult = {
        data: [
          {
            id: 'notif-1',
            participanteId: 'part-1',
            tipo: 'resultado',
            status: 'enviada' as const,
            conteudo: 'Brasil 2 x 1 Argentina',
            whatsappMessageId: 'wamid.123',
            createdAt: new Date(),
          },
        ],
        total: 1,
        pagina: 1,
        tamanhoPagina: 20,
        totalPaginas: 1,
      };

      vi.mocked(notificacaoLogRepository.findAll).mockResolvedValue(mockResult);

      await controller.getNotificacoes(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(notificacaoLogRepository.findAll).toHaveBeenCalledWith({
        pagina: 1,
        tamanhoPagina: 20,
        tipo: undefined,
        status: undefined,
      });
    });

    it('deve aceitar filtros de tipo e status', async () => {
      const req = createMockRequest({
        pagina: '2',
        tamanhoPagina: '10',
        tipo: 'lembrete',
        status: 'falha',
      });
      const res = createMockResponse();

      vi.mocked(notificacaoLogRepository.findAll).mockResolvedValue({
        data: [],
        total: 0,
        pagina: 2,
        tamanhoPagina: 10,
        totalPaginas: 0,
      });

      await controller.getNotificacoes(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(notificacaoLogRepository.findAll).toHaveBeenCalledWith({
        pagina: 2,
        tamanhoPagina: 10,
        tipo: 'lembrete',
        status: 'falha',
      });
    });

    it('deve retornar 400 para parametros invalidos', async () => {
      const req = createMockRequest({
        pagina: '0',
        tamanhoPagina: '200',
      });
      const res = createMockResponse();

      await controller.getNotificacoes(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const jsonCall = vi.mocked(res.json).mock.calls[0][0];
      expect(jsonCall.code).toBe('BOLAO_VALIDATION_ERROR');
    });

    it('deve retornar 400 para status invalido', async () => {
      const req = createMockRequest({
        status: 'invalido',
      });
      const res = createMockResponse();

      await controller.getNotificacoes(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(vi.mocked(res.json).mock.calls[0][0].code).toBe('BOLAO_VALIDATION_ERROR');
    });

    it('deve retornar 500 quando ocorre erro interno', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      vi.mocked(notificacaoLogRepository.findAll).mockRejectedValue(new Error('DB error'));

      await controller.getNotificacoes(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        code: 'INTERNAL_ERROR',
        message: 'Erro ao buscar notificacoes',
      });
    });
  });
});
