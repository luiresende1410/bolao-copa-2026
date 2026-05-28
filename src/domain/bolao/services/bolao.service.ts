/**
 * BolaoService - Gestao de grupos de bolao e participantes
 *
 * Implementa IBolaoService conforme design:
 * - Criacao/atualizacao/exclusao de grupos
 * - Registro de participantes com validacoes de negocio
 * - Entrada via convite WhatsApp
 */

import type { GrupoBolao, CriarGrupoDTO, AtualizarGrupoDTO, FiltroGrupos, Participante, RegistrarParticipanteDTO, StatusGrupoBolao } from '../entities';
import type { IGrupoBolaoRepository } from '../repositories/grupo-bolao.repository';
import type { IParticipanteRepository } from '../repositories/participante.repository';
import type { PaginatedResult } from '../repositories';
import type { Result } from '../../../shared/types/result';
import { ok, err } from '../../../shared/types/result';
import {
  BolaoValidationError,
  GrupoFechadoError,
  GrupoLotadoError,
  ParticipanteDuplicadoError,
  NomeDuplicadoError,
  GrupoComParticipantesError,
} from '../errors/bolao.errors';
import type { BolaoError } from '../errors/bolao.errors';

/** Limite maximo de participantes por grupo */
const MAX_PARTICIPANTES_POR_GRUPO = 200;

/** Regex para validacao de telefone no formato E.164 */
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/** Transicoes de status validas (somente avanca, nunca retrocede) */
const TRANSICOES_VALIDAS: Record<StatusGrupoBolao, StatusGrupoBolao[]> = {
  aberto: ['fechado'],
  fechado: ['finalizado'],
  finalizado: [],
};

export interface IBolaoService {
  criarGrupo(dados: CriarGrupoDTO, criadoPor: string): Promise<Result<GrupoBolao, BolaoError>>;
  atualizarGrupo(id: string, dados: AtualizarGrupoDTO): Promise<Result<GrupoBolao, BolaoError>>;
  excluirGrupo(id: string): Promise<Result<void, BolaoError>>;
  listarGrupos(filtros: FiltroGrupos): Promise<PaginatedResult<GrupoBolao>>;
  registrarParticipante(grupoId: string, dados: RegistrarParticipanteDTO): Promise<Result<Participante, BolaoError>>;
  entrarViaConvite(telefone: string, codigo: string): Promise<Result<Participante, BolaoError>>;
}

export class BolaoService implements IBolaoService {
  constructor(
    private readonly grupoRepository: IGrupoBolaoRepository,
    private readonly participanteRepository: IParticipanteRepository,
  ) {}

  async criarGrupo(dados: CriarGrupoDTO, criadoPor: string): Promise<Result<GrupoBolao, BolaoError>> {
    // Validar nome (1-100 chars)
    const nomeValidation = this.validarNome(dados.nome);
    if (!nomeValidation.ok) return nomeValidation;

    // Validar descricao (max 500 chars)
    if (dados.descricao !== undefined) {
      const descValidation = this.validarDescricao(dados.descricao);
      if (!descValidation.ok) return descValidation;
    }

    // Verificar unicidade do nome
    const existente = await this.grupoRepository.findByNome(dados.nome.trim());
    if (existente) {
      return err(new NomeDuplicadoError(dados.nome.trim()));
    }

    const grupo = await this.grupoRepository.create({
      nome: dados.nome.trim(),
      descricao: dados.descricao?.trim(),
      criadoPor,
    });

    return ok(grupo);
  }

  async atualizarGrupo(id: string, dados: AtualizarGrupoDTO): Promise<Result<GrupoBolao, BolaoError>> {
    const grupo = await this.grupoRepository.findById(id);
    if (!grupo) {
      return err(new BolaoValidationError(`Grupo com id ${id} nao encontrado`));
    }

    // Validar nome se fornecido
    if (dados.nome !== undefined) {
      const nomeValidation = this.validarNome(dados.nome);
      if (!nomeValidation.ok) return nomeValidation;

      // Verificar unicidade do nome (exceto o proprio grupo)
      const existente = await this.grupoRepository.findByNome(dados.nome.trim());
      if (existente && existente.id !== id) {
        return err(new NomeDuplicadoError(dados.nome.trim()));
      }
    }

    // Validar descricao se fornecida
    if (dados.descricao !== undefined) {
      const descValidation = this.validarDescricao(dados.descricao);
      if (!descValidation.ok) return descValidation;
    }

    // Validar transicao de status se fornecido
    if (dados.status !== undefined) {
      const statusValidation = this.validarTransicaoStatus(grupo.status, dados.status);
      if (!statusValidation.ok) return statusValidation;
    }

    const dadosAtualizacao: AtualizarGrupoDTO = {
      ...(dados.nome !== undefined && { nome: dados.nome.trim() }),
      ...(dados.descricao !== undefined && { descricao: dados.descricao.trim() }),
      ...(dados.status !== undefined && { status: dados.status }),
    };

    const atualizado = await this.grupoRepository.update(id, dadosAtualizacao);
    if (!atualizado) {
      return err(new BolaoValidationError(`Falha ao atualizar grupo ${id}`));
    }

    return ok(atualizado);
  }

  async excluirGrupo(id: string): Promise<Result<void, BolaoError>> {
    const grupo = await this.grupoRepository.findById(id);
    if (!grupo) {
      return err(new BolaoValidationError(`Grupo com id ${id} nao encontrado`));
    }

    // Verificar se ha participantes vinculados
    const countParticipantes = await this.grupoRepository.countParticipantes(id);
    if (countParticipantes > 0) {
      return err(new GrupoComParticipantesError(id, countParticipantes));
    }

    await this.grupoRepository.delete(id);
    return ok(undefined);
  }

  async listarGrupos(filtros: FiltroGrupos): Promise<PaginatedResult<GrupoBolao>> {
    return this.grupoRepository.findAll(filtros);
  }

  async registrarParticipante(grupoId: string, dados: RegistrarParticipanteDTO): Promise<Result<Participante, BolaoError>> {
    // Validar nome do participante (1-100 chars)
    const nomeValidation = this.validarNome(dados.nome);
    if (!nomeValidation.ok) return nomeValidation;

    // Validar telefone E.164
    const telefoneValidation = this.validarTelefone(dados.telefone);
    if (!telefoneValidation.ok) return telefoneValidation;

    // Buscar grupo
    const grupo = await this.grupoRepository.findById(grupoId);
    if (!grupo) {
      return err(new BolaoValidationError(`Grupo com id ${grupoId} nao encontrado`));
    }

    // Verificar se grupo esta aberto
    if (grupo.status !== 'aberto') {
      return err(new GrupoFechadoError(grupoId));
    }

    // Verificar limite de participantes
    const count = await this.participanteRepository.countByGrupo(grupoId);
    if (count >= MAX_PARTICIPANTES_POR_GRUPO) {
      return err(new GrupoLotadoError(grupoId));
    }

    // Verificar duplicidade de telefone no grupo
    const existente = await this.participanteRepository.findByTelefoneEGrupo(dados.telefone, grupoId);
    if (existente) {
      return err(new ParticipanteDuplicadoError(dados.telefone, grupoId));
    }

    const participante = await this.participanteRepository.create(grupoId, {
      nome: dados.nome.trim(),
      telefone: dados.telefone,
    });

    return ok(participante);
  }

  async entrarViaConvite(telefone: string, codigo: string): Promise<Result<Participante, BolaoError>> {
    // Validar telefone E.164
    const telefoneValidation = this.validarTelefone(telefone);
    if (!telefoneValidation.ok) return telefoneValidation;

    // O codigo de convite e o ID do grupo (simplificacao para MVP)
    const grupo = await this.grupoRepository.findById(codigo);
    if (!grupo) {
      return err(new BolaoValidationError(`Codigo de convite invalido: ${codigo}`));
    }

    // Verificar se grupo esta aberto
    if (grupo.status !== 'aberto') {
      return err(new GrupoFechadoError(codigo));
    }

    // Verificar limite de participantes
    const count = await this.participanteRepository.countByGrupo(codigo);
    if (count >= MAX_PARTICIPANTES_POR_GRUPO) {
      return err(new GrupoLotadoError(codigo));
    }

    // Verificar se ja esta registrado
    const existente = await this.participanteRepository.findByTelefoneEGrupo(telefone, codigo);
    if (existente) {
      return err(new ParticipanteDuplicadoError(telefone, codigo));
    }

    // Usar parte do telefone como nome padrao (participante pode atualizar depois)
    const nomeDefault = `Participante ${telefone.slice(-4)}`;

    const participante = await this.participanteRepository.create(codigo, {
      nome: nomeDefault,
      telefone,
    });

    return ok(participante);
  }

  // === Metodos privados de validacao ===

  private validarNome(nome: string): Result<void, BolaoError> {
    const trimmed = nome.trim();
    if (trimmed.length === 0) {
      return err(new BolaoValidationError('Nome nao pode ser vazio'));
    }
    if (trimmed.length > 100) {
      return err(new BolaoValidationError('Nome nao pode ter mais de 100 caracteres'));
    }
    return ok(undefined);
  }

  private validarDescricao(descricao: string): Result<void, BolaoError> {
    if (descricao.length > 500) {
      return err(new BolaoValidationError('Descricao nao pode ter mais de 500 caracteres'));
    }
    return ok(undefined);
  }

  private validarTelefone(telefone: string): Result<void, BolaoError> {
    if (!E164_REGEX.test(telefone)) {
      return err(new BolaoValidationError(`Telefone "${telefone}" nao esta no formato E.164 (ex: +5511999998888)`));
    }
    return ok(undefined);
  }

  private validarTransicaoStatus(statusAtual: StatusGrupoBolao, novoStatus: StatusGrupoBolao): Result<void, BolaoError> {
    const transicoesPermitidas = TRANSICOES_VALIDAS[statusAtual];
    if (!transicoesPermitidas.includes(novoStatus)) {
      return err(
        new BolaoValidationError(
          `Transicao de status invalida: "${statusAtual}" -> "${novoStatus}". Transicoes permitidas: ${transicoesPermitidas.length > 0 ? transicoesPermitidas.join(', ') : 'nenhuma (status final)'}`,
        ),
      );
    }
    return ok(undefined);
  }
}
