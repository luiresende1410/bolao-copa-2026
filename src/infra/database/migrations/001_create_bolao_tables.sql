-- Migration: 001_create_bolao_tables
-- Descricao: Cria todas as tabelas do modulo Bolao Copa 2026
-- Data: 2025-01-01
-- Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 8.1

BEGIN;

-- ============================================================
-- Tabela de Grupos de Bolao
-- ============================================================
CREATE TABLE grupo_bolao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(100) NOT NULL UNIQUE,
    descricao VARCHAR(500),
    status VARCHAR(15) NOT NULL DEFAULT 'aberto'
        CHECK (status IN ('aberto', 'fechado', 'finalizado')),
    criado_por UUID NOT NULL REFERENCES atendente(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Tabela de Participantes
-- ============================================================
CREATE TABLE participante (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(100) NOT NULL,
    telefone VARCHAR(15) NOT NULL,
    grupo_bolao_id UUID NOT NULL REFERENCES grupo_bolao(id) ON DELETE RESTRICT,
    pontuacao_acumulada INTEGER NOT NULL DEFAULT 0,
    acertos_exatos INTEGER NOT NULL DEFAULT 0,
    acertos_vencedor INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(telefone, grupo_bolao_id)
);

-- ============================================================
-- Tabela de Partidas
-- ============================================================
CREATE TABLE partida (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    selecao_mandante VARCHAR(50) NOT NULL,
    bandeira_mandante VARCHAR(10) NOT NULL,
    selecao_visitante VARCHAR(50) NOT NULL,
    bandeira_visitante VARCHAR(10) NOT NULL,
    data_horario TIMESTAMPTZ NOT NULL,
    local VARCHAR(100) NOT NULL,
    fase_torneio VARCHAR(20) NOT NULL
        CHECK (fase_torneio IN ('fase_de_grupos', 'oitavas', 'quartas', 'semifinal', 'terceiro_lugar', 'final')),
    status VARCHAR(15) NOT NULL DEFAULT 'agendada'
        CHECK (status IN ('agendada', 'em_andamento', 'finalizada', 'cancelada')),
    gols_mandante INTEGER CHECK (gols_mandante >= 0 AND gols_mandante <= 99),
    gols_visitante INTEGER CHECK (gols_visitante >= 0 AND gols_visitante <= 99),
    sync_automatico BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Tabela de Palpites (unicidade por participante + partida)
-- ============================================================
CREATE TABLE palpite (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participante_id UUID NOT NULL REFERENCES participante(id) ON DELETE RESTRICT,
    partida_id UUID NOT NULL REFERENCES partida(id) ON DELETE RESTRICT,
    gols_mandante INTEGER NOT NULL CHECK (gols_mandante >= 0 AND gols_mandante <= 99),
    gols_visitante INTEGER NOT NULL CHECK (gols_visitante >= 0 AND gols_visitante <= 99),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(participante_id, partida_id)
);

-- ============================================================
-- Tabela de Pontuacoes
-- ============================================================
CREATE TABLE pontuacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    palpite_id UUID NOT NULL REFERENCES palpite(id) ON DELETE CASCADE UNIQUE,
    pontos INTEGER NOT NULL CHECK (pontos >= 0),
    categoria VARCHAR(20) NOT NULL
        CHECK (categoria IN ('exato', 'diferenca_gols', 'vencedor', 'empate', 'gols_parcial', 'erro')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Tabela de Historico de Ranking
-- ============================================================
CREATE TABLE ranking_historico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participante_id UUID NOT NULL REFERENCES participante(id) ON DELETE RESTRICT,
    grupo_bolao_id UUID NOT NULL REFERENCES grupo_bolao(id) ON DELETE RESTRICT,
    posicao INTEGER NOT NULL,
    pontuacao_total INTEGER NOT NULL,
    acertos_exatos INTEGER NOT NULL,
    acertos_vencedor INTEGER NOT NULL,
    partida_referencia UUID REFERENCES partida(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Tabela de Log de Notificacoes
-- ============================================================
CREATE TABLE notificacao_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participante_id UUID NOT NULL REFERENCES participante(id) ON DELETE RESTRICT,
    tipo VARCHAR(30) NOT NULL,
    status VARCHAR(15) NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'enviada', 'falha')),
    conteudo TEXT,
    whatsapp_message_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Tabela de Auditoria do Bolao
-- ============================================================
CREATE TABLE auditoria_bolao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES atendente(id),
    acao VARCHAR(50) NOT NULL,
    detalhes JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes de Performance
-- ============================================================

-- Participante: busca por grupo, telefone e ranking
CREATE INDEX idx_participante_grupo ON participante(grupo_bolao_id);
CREATE INDEX idx_participante_telefone ON participante(telefone);
CREATE INDEX idx_participante_pontuacao ON participante(grupo_bolao_id, pontuacao_acumulada DESC, acertos_exatos DESC, acertos_vencedor DESC);

-- Partida: busca por status/data e fase
CREATE INDEX idx_partida_status_data ON partida(status, data_horario);
CREATE INDEX idx_partida_fase ON partida(fase_torneio, data_horario);

-- Palpite: busca por participante e partida
CREATE INDEX idx_palpite_participante ON palpite(participante_id, created_at DESC);
CREATE INDEX idx_palpite_partida ON palpite(partida_id);

-- Pontuacao: busca por palpite
CREATE INDEX idx_pontuacao_palpite ON pontuacao(palpite_id);

-- Ranking Historico: busca por grupo
CREATE INDEX idx_ranking_historico_grupo ON ranking_historico(grupo_bolao_id, created_at DESC);

-- Notificacao Log: busca por participante e status pendente
CREATE INDEX idx_notificacao_log_participante ON notificacao_log(participante_id, created_at DESC);
CREATE INDEX idx_notificacao_log_status ON notificacao_log(status) WHERE status = 'pendente';

COMMIT;
