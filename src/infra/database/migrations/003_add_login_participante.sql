BEGIN;
ALTER TABLE participante ADD COLUMN IF NOT EXISTS login VARCHAR(50);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participante_login ON participante(login) WHERE login IS NOT NULL;
COMMIT;