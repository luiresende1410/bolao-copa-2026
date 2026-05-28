/**
 * Middleware de autenticacao JWT.
 *
 * Verifica o token JWT no header Authorization (Bearer <token>).
 * Decodifica o payload e injeta req.user com os dados do usuario autenticado.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../infra/config/env';

/**
 * Payload decodificado do token JWT
 */
export interface JwtPayload {
  sub: string;
  role: 'admin' | 'participante';
  nome: string;
  iat?: number;
  exp?: number;
}

/**
 * Extensao do Request do Express para incluir dados do usuario autenticado
 */
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware que exige autenticacao JWT valida.
 * Rejeita com 401 se token ausente ou invalido.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Token de autenticacao ausente ou formato invalido',
      code: 'AUTH_TOKEN_MISSING',
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: env.JWT_ISSUER,
    }) as JwtPayload;

    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Token expirado',
        code: 'AUTH_TOKEN_EXPIRED',
      });
      return;
    }

    res.status(401).json({
      error: 'Token invalido',
      code: 'AUTH_TOKEN_INVALID',
    });
  }
}
