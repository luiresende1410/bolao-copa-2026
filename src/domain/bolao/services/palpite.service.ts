/**
 * PalpiteService - Servico de dominio para registro e consulta de palpites.
 *
 * Responsabilidades:
 * - Registrar palpites com verificacao de janela temporal
 * - UPSERT semantics (ultimo palpite prevalece)
 * - Validacao de gols (inteiro 0-99)
 * - Consulta de palpites por participante e partida
 */

import type { Palpite } from '../entities';
import type { IPartidaRepository } from '../repositories/partida.repository';
import type { IPalpiteRepository } from '../repositories/palpite.repository';
import { type Result, ok, err } from '../../../shared/types/result';
import {
  BolaoValidationError,
  JanelaFechadaError,
  PartidaNaoEncontradaError,
  type PalpiteError,
} from '../errors';

export interface IPalpiteService {
  registrarPalpite(
    participanteId: string,
    partidaId: string,
    golsMandante: number,
    golsVisitante: number,
  ): Promise<Result<Palpite, PalpiteError>>;

  listarPalpitesParticipante(participanteId: string, limite: number): Promise<Palpite[]>;

  listarPalpitesPartida(partidaId: string): Promise<Palpite[]>;

  verificarJanelaAberta(partidaId: string): Promise<boolean>;
}

/**
 * Funcao que retorna o timestamp atual.
 * Injetavel para facilitar testes deterministicos.
 */
export type NowFn = () => Date;

export class PalpiteService implements IPalpiteService {
  constructor(
    private readonly partidaRepository: IPartidaRepository,
    private readonly palpiteRepository: IPalpiteRepository,
    private readonly now: NowFn = () => new Date(),
  ) {}

  /**
   * Registra ou atualiza um palpite para um participante em uma partida.
   *
   * Regras:
   * - Partida deve existir
   * - Janela temporal deve estar aberta (now < partida.dataHorario)
   * - Gols devem ser inteiros no intervalo [0, 99]
   * - UPSERT: ultimo palpite prevalece para mesma combinacao participante+partida
   */
  async registrarPalpite(
    participanteId: string,
    partidaId: string,
    golsMandante: number,
    golsVisitante: number,
  ): Promise<Result<Palpite, PalpiteError>> {
    // Validar gols
    const validacaoGols = this.validarGols(golsMandante, golsVisitante);
    if (!validacaoGols.ok) {
      return validacaoGols;
    }

    // Buscar partida
    const partida = await this.partidaRepository.findById(partidaId);
    if (!partida) {
      return err(new PartidaNaoEncontradaError(partidaId));
    }

    // Verificar janela temporal
    const agora = this.now();
    if (agora >= partida.dataHorario) {
      return err(new JanelaFechadaError(partidaId));
    }

    // UPSERT - ultimo palpite prevalece
    const palpite = await this.palpiteRepository.upsert(
      participanteId,
      partidaId,
      golsMandante,
      golsVisitante,
    );

    return ok(palpite);
  }

  /**
   * Lista palpites de um participante, ordenados por data desc.
   */
  async listarPalpitesParticipante(participanteId: string, limite: number): Promise<Palpite[]> {
    return this.palpiteRepository.findByParticipante(participanteId, limite);
  }

  /**
   * Lista todos os palpites de uma partida.
   */
  async listarPalpitesPartida(partidaId: string): Promise<Palpite[]> {
    return this.palpiteRepository.findByPartida(partidaId);
  }

  /**
   * Verifica se a janela de palpite esta aberta para uma partida.
   * Retorna true se now < partida.dataHorario, false caso contrario.
   * Retorna false se a partida nao existir.
   */
  async verificarJanelaAberta(partidaId: string): Promise<boolean> {
    const partida = await this.partidaRepository.findById(partidaId);
    if (!partida) {
      return false;
    }

    const agora = this.now();
    return agora < partida.dataHorario;
  }

  /**
   * Valida que os valores de gols sao inteiros no intervalo [0, 99].
   */
  private validarGols(
    golsMandante: number,
    golsVisitante: number,
  ): Result<void, BolaoValidationError> {
    if (!this.isGolValido(golsMandante)) {
      return err(
        new BolaoValidationError(
          `Gols do mandante invalido: ${golsMandante}. Deve ser inteiro entre 0 e 99.`,
        ),
      );
    }

    if (!this.isGolValido(golsVisitante)) {
      return err(
        new BolaoValidationError(
          `Gols do visitante invalido: ${golsVisitante}. Deve ser inteiro entre 0 e 99.`,
        ),
      );
    }

    return ok(undefined);
  }

  /**
   * Verifica se um valor de gol e valido: inteiro no intervalo [0, 99].
   */
  private isGolValido(gols: number): boolean {
    return Number.isInteger(gols) && gols >= 0 && gols <= 99;
  }
}