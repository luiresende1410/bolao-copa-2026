/**
 * Middleware de autorizacao por role (admin vs participante).
 *
 * Deve ser usado APOS o middleware requireAuth, pois depende de req.user.
 * Verifica se o usuario autenticado possui a role necessaria para acessar o recurso.
 */

import type { Request, Response, NextFunction } from 'express';
import type { JwtPayload } from './auth.middleware';

/**
 * Roles disponiveis no sistema.
 */
export type Role = 'admin' | 'participante';

/**
 * Factory de middleware que exige uma ou mais roles.
 * Rejeita com 403 se o usuario nao possui nenhuma das roles permitidas.
 *
 * @param roles - Roles permitidas para acessar o recurso
 * @returns Middleware Express
 *
 * @example
 * // Somente admin
 * router.get('/grupos', requireAuth, requireRole('admin'), controller.listar);
 *
 * // Admin ou participante
 * router.get('/ranking', requireAuth, requireRole('admin', 'participante'), controller.obterRanking);
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user as JwtPayload | undefined;

    if (!user) {
      res.status(401).json({
        error: 'Usuario nao autenticado',
        code: 'AUTH_NOT_AUTHENTICATED',
      });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({
        error: `Acesso negado. Role necessaria: ${roles.join(' ou ')}`,
        code: 'AUTH_FORBIDDEN',
      });
      return;
    }

    next();
  };
}
