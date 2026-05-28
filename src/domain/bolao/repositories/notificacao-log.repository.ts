/**
 * Interface de repositorio para NotificacaoLog
 */

import type { NotificacaoLog } from '../entities';
import type { PaginatedResult } from './index';

export interface FiltroNotificacoes {
  tipo?: string;
  status?: 'pendente' | 'enviada' | 'falha';
  pagina?: number;
  tamanhoPagina?: number;
}

export interface INotificacaoLogRepository {
  /** Busca notificacao por ID */
  findById(id: string): Promise<NotificacaoLog | null>;

  /** Lista notificacoes com filtros e paginacao */
  findAll(filtros: FiltroNotificacoes): Promise<PaginatedResult<NotificacaoLog>>;

  /** Lista notificacoes de um participante */
  findByParticipante(participanteId: string, pagina: number, tamanhoPagina: number): Promise<PaginatedResult<NotificacaoLog>>;

  /** Cria um novo registro de notificacao */
  create(dados: { participanteId: string; tipo: string; conteudo?: string }): Promise<NotificacaoLog>;

  /** Atualiza status de uma notificacao */
  atualizarStatus(id: string, status: 'pendente' | 'enviada' | 'falha', whatsappMessageId?: string): Promise<NotificacaoLog | null>;

  /** Conta total de notificacoes */
  count(): Promise<number>;

  /** Conta notificacoes por status */
  countByStatus(status: 'pendente' | 'enviada' | 'falha'): Promise<number>;
}
