/**
 * RankingService - Servico de dominio para ranking com desempate e cache Redis.
 *
 * Responsabilidades:
 * - Obter ranking paginado com criterios de desempate
 * - Cache Redis com TTL 60s e invalidacao apos calculo de pontuacao
 * - Atualizar ranking (recalcular posicoes e salvar historico)
 * - Obter top N para consultas rapidas
 * - Exportar ranking em formato CSV
 * - Consultar posicao individual de um participante
 *
 * Criterios de desempate (em ordem):
 * 1. Maior pontuacao_acumulada
 * 2. Maior acertos_exatos
 * 3. Maior acertos_vencedor
 */

import type { RankingEntry } from '../entities';
import type { PaginatedResult } from '../repositories';
import type { IRankingRepository } from '../repositories/ranking.repository';
import type { IParticipanteRepository } from '../repositories/participante.repository';

/**
 * Interface para operacoes de cache Redis (get/set/del com TTL)
 */
export interface IRedisCache {
  /** Obtem valor do cache. Retorna null se nao encontrado ou expirado. */
  get<T>(key: string): Promise<T | null>;
  /** Salva valor no cache com TTL em segundos. */
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  /** Remove chave do cache. */
  del(key: string): Promise<void>;
}

/**
 * Constantes Redis para o modulo Bolao
 */
export const REDIS_BOLAO_KEYS = {
  /** Cache do ranking (TTL: 60s) */
  ranking: (grupoId: string) => `bolao:ranking:${grupoId}`,

  /** Cache de proximos jogos (TTL: 300s) */
  proximosJogos: () => 'bolao:proximos-jogos',

  /** Rate limit de comandos por telefone (TTL: 5min) */
  comandoRateLimit: (telefone: string) => `bolao:rate:${telefone}`,

  /** Contador de comandos invalidos (TTL: 5min) */
  comandosInvalidos: (telefone: string) => `bolao:invalid:${telefone}`,

  /** Lock para calculo de pontuacao (TTL: 30s) */
  lockPontuacao: (partidaId: string) => `bolao:lock:pontuacao:${partidaId}`,

  /** Canal pub/sub para atualizacoes de ranking */
  channelRanking: (grupoId: string) => `bolao:channel:ranking:${grupoId}`,
};

/** TTL do cache de ranking em segundos */
const RANKING_CACHE_TTL_SECONDS = 60;

/**
 * Interface publica do RankingService
 */
export interface IRankingService {
  obterRanking(grupoId: string, pagina: number, tamanhoPagina: number): Promise<PaginatedResult<RankingEntry>>;
  obterRankingTop(grupoId: string, limite: number): Promise<RankingEntry[]>;
  atualizarRanking(grupoId: string): Promise<void>;
  exportarRankingCSV(grupoId: string): Promise<string>;
  obterPosicaoParticipante(grupoId: string, participanteId: string): Promise<RankingEntry | null>;
}

export class RankingService implements IRankingService {
  constructor(
    private readonly rankingRepository: IRankingRepository,
    private readonly participanteRepository: IParticipanteRepository,
    private readonly redisCache: IRedisCache,
  ) {}

  /**
   * Obtem ranking paginado de um grupo com cache Redis.
   *
   * Criterios de desempate (aplicados pelo repositorio na query SQL):
   * 1. Maior pontuacao_acumulada
   * 2. Maior acertos_exatos
   * 3. Maior acertos_vencedor
   *
   * O resultado e cacheado no Redis com TTL de 60s.
   */
  async obterRanking(grupoId: string, pagina: number, tamanhoPagina: number): Promise<PaginatedResult<RankingEntry>> {
    const cacheKey = REDIS_BOLAO_KEYS.ranking(grupoId);
    const fullCacheKey = `${cacheKey}:page:${pagina}:size:${tamanhoPagina}`;

    // Tentar obter do cache
    const cached = await this.redisCache.get<PaginatedResult<RankingEntry>>(fullCacheKey);
    if (cached) {
      return cached;
    }

    // Buscar do repositorio (ja ordenado pelos criterios de desempate)
    const resultado = await this.rankingRepository.obterRanking(grupoId, pagina, tamanhoPagina);

    // Salvar no cache
    await this.redisCache.set(fullCacheKey, resultado, RANKING_CACHE_TTL_SECONDS);

    return resultado;
  }

  /**
   * Obtem top N do ranking de um grupo para consultas rapidas.
   * Usa cache Redis com TTL de 60s.
   */
  async obterRankingTop(grupoId: string, limite: number): Promise<RankingEntry[]> {
    const cacheKey = REDIS_BOLAO_KEYS.ranking(grupoId);
    const fullCacheKey = `${cacheKey}:top:${limite}`;

    // Tentar obter do cache
    const cached = await this.redisCache.get<RankingEntry[]>(fullCacheKey);
    if (cached) {
      return cached;
    }

    // Buscar do repositorio
    const resultado = await this.rankingRepository.obterRankingTop(grupoId, limite);

    // Salvar no cache
    await this.redisCache.set(fullCacheKey, resultado, RANKING_CACHE_TTL_SECONDS);

    return resultado;
  }

  /**
   * Atualiza o ranking de um grupo:
   * 1. Invalida cache Redis
   * 2. Recalcula posicoes (busca ranking completo do repositorio)
   * 3. Salva snapshot no historico (ranking_historico)
   */
  async atualizarRanking(grupoId: string): Promise<void> {
    // 1. Invalidar cache
    await this.invalidarCache(grupoId);

    // 2. Buscar ranking completo recalculado (sem paginacao - busca todos)
    const totalParticipantes = await this.participanteRepository.countByGrupo(grupoId);
    if (totalParticipantes === 0) {
      return;
    }

    const rankingCompleto = await this.rankingRepository.obterRanking(grupoId, 1, totalParticipantes);

    // 3. Salvar historico
    const entries = rankingCompleto.data.map((entry) => ({
      participanteId: entry.participanteId,
      posicao: entry.posicao,
      pontuacaoTotal: entry.pontuacaoTotal,
      acertosExatos: entry.acertosExatos,
      acertosVencedor: entry.acertosVencedor,
    }));

    await this.rankingRepository.salvarHistorico(grupoId, null, entries);
  }

  /**
   * Exporta ranking completo de um grupo em formato CSV.
   *
   * Formato:
   * posicao,nome,telefone,pontuacao_acumulada,acertos_exatos,acertos_vencedor
   *
   * Inclui cabecalho + todas as linhas de dados (um por participante).
   */
  async exportarRankingCSV(grupoId: string): Promise<string> {
    const header = 'posicao,nome,telefone,pontuacao_acumulada,acertos_exatos,acertos_vencedor';

    // Buscar todos os participantes para obter telefone
    const totalParticipantes = await this.participanteRepository.countByGrupo(grupoId);
    if (totalParticipantes === 0) {
      return header;
    }

    // Buscar ranking completo
    const rankingCompleto = await this.rankingRepository.obterRanking(grupoId, 1, totalParticipantes);

    // Buscar participantes para obter telefone (nao disponivel no RankingEntry)
    const participantes = await this.participanteRepository.findByGrupo(grupoId, 1, totalParticipantes);
    const telefoneMap = new Map<string, string>();
    for (const p of participantes.data) {
      telefoneMap.set(p.id, p.telefone);
    }

    // Montar CSV
    const rows = rankingCompleto.data.map((entry) => {
      const telefone = telefoneMap.get(entry.participanteId) ?? '';
      return `${entry.posicao},${this.escapeCsvField(entry.nome)},${telefone},${entry.pontuacaoTotal},${entry.acertosExatos},${entry.acertosVencedor}`;
    });

    return [header, ...rows].join('\n');
  }

  /**
   * Obtem a posicao de um participante especifico no ranking.
   * Retorna null se o participante nao for encontrado no grupo.
   */
  async obterPosicaoParticipante(grupoId: string, participanteId: string): Promise<RankingEntry | null> {
    return this.rankingRepository.obterPosicaoParticipante(grupoId, participanteId);
  }

  /**
   * Invalida todas as chaves de cache relacionadas ao ranking de um grupo.
   * Usa o padrao de chave base para invalidar cache paginado e top N.
   */
  private async invalidarCache(grupoId: string): Promise<void> {
    const cacheKey = REDIS_BOLAO_KEYS.ranking(grupoId);
    await this.redisCache.del(cacheKey);
  }

  /**
   * Escapa um campo para CSV (adiciona aspas se contem virgula ou aspas).
   */
  private escapeCsvField(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }
}
