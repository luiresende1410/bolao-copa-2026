/**
 * Middleware de tratamento de erros para a API REST.
 * Mapeia erros de dominio para HTTP status codes.
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/**
 * Interface para erros de dominio com statusCode e code.
 */
interface DomainError extends Error {
  statusCode?: number;
  code?: string;
}

/**
 * Formato padrao de resposta de erro da API.
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Middleware global de tratamento de erros.
 * Converte erros de dominio e validacao em respostas HTTP padronizadas.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Erros de validacao Zod
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados de entrada invalidos',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    };
    res.status(400).json(response);
    return;
  }

  // Erros de dominio com statusCode
  const domainError = err as DomainError;
  if (domainError.statusCode && domainError.code) {
    const response: ErrorResponse = {
      error: {
        code: domainError.code,
        message: domainError.message,
      },
    };
    res.status(domainError.statusCode).json(response);
    return;
  }

  // Erro generico (500)
  const response: ErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
    },
  };
  res.status(500).json(response);
}
