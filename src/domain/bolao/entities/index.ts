/**
 * Barrel export para todas as entidades do modulo Bolao
 */

export type { GrupoBolao, CriarGrupoDTO, AtualizarGrupoDTO, FiltroGrupos } from './grupo-bolao.entity';
export type { StatusGrupoBolao } from './grupo-bolao.entity';

export type { Participante, RegistrarParticipanteDTO } from './participante.entity';

export type { Partida, CriarPartidaDTO, RegistrarResultadoDTO } from './partida.entity';
export type { StatusPartida, FaseTorneio } from './partida.entity';

export type { Palpite, PlacarReal } from './palpite.entity';

export type { Pontuacao, PontuacaoCalculo } from './pontuacao.entity';
export type { CategoriaPontuacao } from './pontuacao.entity';

export type { RankingEntry } from './ranking-entry.entity';

export type { NotificacaoLog, StatusNotificacao } from './notificacao-log.entity';

export type { ComandoPalpite, TipoComando, RespostaComando } from './comando.types';
