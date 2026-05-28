-- Migration: 000_create_base_tables
-- Descricao: Cria tabelas base do sistema (atendente)

BEGIN;

CREATE TABLE IF NOT EXISTS atendente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'atendente'
        CHECK (role IN ('admin', 'atendente', 'supervisor')),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO atendente (id, nome, email, senha_hash, role)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Admin Dev',
    'admin@dev.local',
    'placeholder_hash_for_dev',
    'admin'
) ON CONFLICT (email) DO NOTHING;

COMMIT;