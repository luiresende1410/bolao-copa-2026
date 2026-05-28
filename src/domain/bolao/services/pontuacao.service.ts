/**
 * PontuacaoService - Servico de dominio para calculo automatico de pontuacao.
 *
 * Responsabilidades:
 * - Calcular pontuacao individual de um palpite vs placar real
 * - Processar todos os palpites de uma partida finalizada
 * - Atualizar acumuladores do participante (pontuacao_acumulada, acertos_exatos, acertos_vencedor)
 * - Usar distributed lock Redis para evitar calculo duplicado
 */

import type { Palpite, PlacarReal, PontuacaoCalculo, CategoriaPontuacao } from '../entities';
import type { IPartidaRepository } from '../repositories/partida.repository';
import type { IPalpiteRepository } from '../repositories/palpite.repository';
import type { IPontuacaoRepository } from '../repositories/pontuacao.repository';
import type { IParticipanteRepository } from '../repositories/participante.repository';
import { type Result, ok, err } from '../../../shared/types/result';
import {
  PartidaNaoEncontradaError,
  PartidaNaoFinalizadaError,
  PontuacaoLockError,
  type PontuacaoError,
} from '../errors';

/**
 * Interface para distributed lock Redis
 */
export interface IRedisLock {
  /** Tenta adquirir lock. Retorna true se adquirido, false se ja existe. */
  acquire(key: string, ttlMs: number): Promise<boolean>;
  /** Libera o lock */
  release(key: string): Promise<void>;
}

/**
 * Resultado do calculo de pontuacao para uma partida inteira
 */
export interface PontuacaoResult {
  palpiteId: string;
  participanteId: string;
  pontos: number;
  categoria: CategoriaPontuacao;
}

/**
 * Chaves Redis para o modulo Bolao
 */
const REDIS_BOLAO_KEYS = {
  lockPontuacao: (partidaId: string) => `bolao:lock:pontuacao:${partidaId}`,
};

/** TTL do lock de pontuacao em milissegundos (30s) */
const LOCK_TTL_MS = 30_000;

export interface IPontuacaoService {
  calcularPontuacao(partidaId: string): Promise<Result<PontuacaoResult[], PontuacaoError>>;
  calcularPontuacaoPalpite(palpite: Palpite, placarReal: PlacarReal): PontuacaoCalculo;
}

export class PontuacaoService implements IPontuacaoService {
  constructor(
    private readonly partidaRepository: IPartidaRepository,
    private readonly palpiteRepository: IPalpiteRepository,
    private readonly pontuacaoRepository: IPontuacaoRepository,
    private readonly participanteRepository: IParticipanteRepository,
    private readonly redisLock: IRedisLock,
  ) {}

  /**
   * Calcula a pontuacao de todos os palpites de uma partida finalizada.
   *
   * Fluxo:
   * 1. Adquire lock Redis para evitar calculo duplicado
   * 2. Valida que a partida existe e esta finalizada
   * 3. Busca todos os palpites da partida
   * 4. Calcula pontuacao para cada palpite
   * 5. Salva pontuacoes em lote
   * 6. Atualiza acumuladores dos participantes
   * 7. Libera lock
   */
  async calcularPontuacao(partidaId: string): Promise<Result<PontuacaoResult[], PontuacaoError>> {
    // 1. Adquirir lock
    const lockKey = REDIS_BOLAO_KEYS.lockPontuacao(partidaId);
    const lockAcquired = await this.redisLock.acquire(lockKey, LOCK_TTL_MS);
    if (!lockAcquired) {
      return err(new PontuacaoLockError(partidaId));
    }

    try {
      // 2. Validar partida
      const partida = await this.partidaRepository.findById(partidaId);
      if (!partida) {
        return err(new PartidaNaoEncontradaError(partidaId));
      }

      if (partida.status !== 'finalizada' || partida.golsMandante === null || partida.golsVisitante === null) {
        return err(new PartidaNaoFinalizadaError(partidaId));
      }

      const placarReal: PlacarReal = {
        golsMandante: partida.golsMandante,
        golsVisitante: partida.golsVisitante,
      };

      // 3. Buscar todos os palpites da partida
      const palpites = await this.palpiteRepository.findByPartida(partidaId);

      if (palpites.length === 0) {
        return ok([]);
      }

      // 4. Remover pontuacoes anteriores (para suportar recalculo)
      await this.pontuacaoRepository.deleteByPartidaId(partidaId);

      // 5. Calcular pontuacao para cada palpite
      const resultados: PontuacaoResult[] = palpites.map((palpite) => {
        const calculo = this.calcularPontuacaoPalpite(palpite, placarReal);
        return {
          palpiteId: palpite.id,
          participanteId: palpite.participanteId,
          pontos: calculo.pontos,
          categoria: calculo.categoria,
        };
      });

      // 6. Salvar pontuacoes em lote
      await this.pontuacaoRepository.createBatch(
        resultados.map((r) => ({
          palpiteId: r.palpiteId,
          pontos: r.pontos,
          categoria: r.categoria,
        })),
      );

      // 7. Atualizar acumuladores dos participantes
      for (const resultado of resultados) {
        const acertoExato = resultado.categoria === 'exato';
        const acertoVencedor = resultado.categoria === 'vencedor' || resultado.categoria === 'diferenca_gols';
        await this.participanteRepository.atualizarPontuacao(
          resultado.participanteId,
          resultado.pontos,
          acertoExato,
          acertoVencedor,
        );
      }

      return ok(resultados);
    } finally {
      // 8. Liberar lock
      await this.redisLock.release(lockKey);
    }
  }

  /**
   * Calcula a pontuacao de um palpite individual contra o placar real.
   *
   * Regras mutuamente exclusivas (apenas uma categoria se aplica):
   * 1. exato (10pts): ambos gols corretos
   * 2. diferenca_gols (7pts): vencedor correto + diferenca de gols correta, mas nao exato
   * 3. vencedor (5pts): vencedor correto, mas diferenca de gols incorreta
   * 4. empate (5pts): ambos empate, mas placar diferente
   * 5. gols_parcial (3pts): acerta gols de exatamente um time, sem enquadrar nas categorias acima
   * 6. erro (0pts): caso contrario
   */
  calcularPontuacaoPalpite(palpite: Palpite, placarReal: PlacarReal): PontuacaoCalculo {
    const pM = palpite.golsMandante;
    const pV = palpite.golsVisitante;
    const rM = placarReal.golsMandante;
    const rV = placarReal.golsVisitante;

    // 1. Exato: ambos gols corretos
    if (pM === rM && pV === rV) {
      return { pontos: 10, categoria: 'exato' };
    }

    // Determinar vencedor do palpite e do resultado real
    const vencedorPalpite = this.determinarVencedor(pM, pV);
    const vencedorReal = this.determinarVencedor(rM, rV);

    // 2. Diferenca de gols: vencedor correto + diferenca correta, nao exato
    if (
      vencedorPalpite === vencedorReal &&
      vencedorPalpite !== 'empate' &&
      (pM - pV) === (rM - rV)
    ) {
      return { pontos: 7, categoria: 'diferenca_gols' };
    }

    // 3. Vencedor: vencedor correto, diferenca incorreta
    if (vencedorPalpite === vencedorReal && vencedorPalpite !== 'empate') {
      return { pontos: 5, categoria: 'vencedor' };
    }

    // 4. Empate: ambos empate, placar diferente (ja excluimos exato acima)
    if (vencedorPalpite === 'empate' && vencedorReal === 'empate') {
      return { pontos: 5, categoria: 'empate' };
    }

    // 5. Gols parcial: acerta gols de exatamente um time
    const acertouMandante = pM === rM;
    const acertouVisitante = pV === rV;
    if ((acertouMandante && !acertouVisitante) || (!acertouMandante && acertouVisitante)) {
      return { pontos: 3, categoria: 'gols_parcial' };
    }

    // 6. Erro: caso contrario
    return { pontos: 0, categoria: 'erro' };
  }

  /**
   * Determina o vencedor de um placar.
   */
  private determinarVencedor(golsMandante: number, golsVisitante: number): 'mandante' | 'visitante' | 'empate' {
    if (golsMandante > golsVisitante) return 'mandante';
    if (golsMandante < golsVisitante) return 'visitante';
    return 'empate';
  }
}
