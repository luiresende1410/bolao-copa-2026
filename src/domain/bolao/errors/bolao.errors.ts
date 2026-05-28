/**
 * Classes de erro do modulo Bolao
 */

export type BolaoError =
  | BolaoValidationError
  | GrupoFechadoError
  | GrupoLotadoError
  | ParticipanteDuplicadoError
  | NomeDuplicadoError
  | GrupoComParticipantesError;

export class BolaoValidationError extends Error {
  readonly code = 'BOLAO_VALIDATION_ERROR' as const;
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'BolaoValidationError';
  }
}

export class GrupoFechadoError extends Error {
  readonly code = 'BOLAO_GRUPO_FECHADO' as const;
  readonly statusCode = 400;

  constructor(grupoId: string) {
    super(`Grupo ${grupoId} nao esta aberto para novos participantes`);
    this.name = 'GrupoFechadoError';
  }
}

export class GrupoLotadoError extends Error {
  readonly code = 'BOLAO_GRUPO_LOTADO' as const;
  readonly statusCode = 400;

  constructor(grupoId: string) {
    super(`Grupo ${grupoId} atingiu o limite maximo de 200 participantes`);
    this.name = 'GrupoLotadoError';
  }
}

export class ParticipanteDuplicadoError extends Error {
  readonly code = 'BOLAO_PARTICIPANTE_DUPLICADO' as const;
  readonly statusCode = 409;

  constructor(telefone: string, grupoId: string) {
    super(`Participante com telefone ${telefone} ja esta registrado no grupo ${grupoId}`);
    this.name = 'ParticipanteDuplicadoError';
  }
}

export class NomeDuplicadoError extends Error {
  readonly code = 'BOLAO_NOME_DUPLICADO' as const;
  readonly statusCode = 409;

  constructor(nome: string) {
    super(`Ja existe um grupo com o nome "${nome}"`);
    this.name = 'NomeDuplicadoError';
  }
}

export class GrupoComParticipantesError extends Error {
  readonly code = 'BOLAO_GRUPO_COM_PARTICIPANTES' as const;
  readonly statusCode = 400;

  constructor(grupoId: string, count: number) {
    super(`Grupo ${grupoId} possui ${count} participante(s) vinculado(s) e nao pode ser excluido`);
    this.name = 'GrupoComParticipantesError';
  }
}
