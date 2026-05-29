import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static('public'));

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'whatsapp_panel',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  min: parseInt(process.env.DB_POOL_MIN || '2'),
  max: parseInt(process.env.DB_POOL_MAX || '10'),
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-min-32-chars-here!!';

// Admin login
app.post('/api/v1/bolao/admin/login', (req: any, res: any) => {
  const { senha } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'bolao2026admin';
  if (senha !== adminPassword) return res.status(401).json({ code: 'AUTH_ERROR', message: 'Senha de administrador incorreta' });
  res.json({ authenticated: true, token: 'admin-' + Date.now() });
});

// 1. Health check
app.get('/health', async (_req: any, res: any) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', mode: 'postgresql', timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.status(503).json({ status: 'error', message: e.message });
  }
});

// 2. List all groups
app.get('/api/v1/bolao/grupos', async (_req: any, res: any) => {
  try {
    const r = await pool.query('SELECT * FROM grupo_bolao ORDER BY created_at DESC');
    res.json({ data: r.rows, total: r.rowCount });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// 3. Create group
app.post('/api/v1/bolao/grupos', async (req: any, res: any) => {
  const { nome, descricao } = req.body;
  if (!nome) return res.status(400).json({ code: 'BOLAO_VALIDATION_ERROR', message: 'Nome obrigatorio' });
  try {
    const r = await pool.query(
      'INSERT INTO grupo_bolao (nome, descricao, criado_por) VALUES ($1, $2, $3) RETURNING *',
      [nome.trim(), descricao || null, 'a0000000-0000-0000-0000-000000000001']
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ code: 'BOLAO_NOME_DUPLICADO', message: 'Nome ja existe' });
    res.status(500).json({ message: e.message });
  }
});

// 4. Delete group (check no participants)
app.delete('/api/v1/bolao/grupos/:id', async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT COUNT(*) FROM participante WHERE grupo_bolao_id = $1', [id]);
    if (parseInt(check.rows[0].count) > 0) {
      return res.status(409).json({ code: 'BOLAO_GRUPO_COM_PARTICIPANTES', message: 'Grupo possui participantes. Remova-os antes de excluir.' });
    }
    const r = await pool.query('DELETE FROM grupo_bolao WHERE id = $1 RETURNING *', [id]);
    if (r.rowCount === 0) return res.status(404).json({ code: 'BOLAO_NOT_FOUND', message: 'Grupo nao encontrado' });
    res.json({ message: 'Grupo excluido com sucesso', data: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// 5. List participants of a group
app.get('/api/v1/bolao/grupos/:id/participantes', async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const r = await pool.query('SELECT * FROM participante WHERE grupo_bolao_id = $1 ORDER BY nome ASC', [id]);
    res.json({ data: r.rows, total: r.rowCount });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// 6. Add participant to group
app.post('/api/v1/bolao/grupos/:id/participantes', async (req: any, res: any) => {
  const { id } = req.params;
  const { nome, telefone, login, senha } = req.body;
  if (!nome || !login) return res.status(400).json({ code: 'BOLAO_VALIDATION_ERROR', message: 'Nome e login obrigatorios' });
  try {
    let senhaParaSalvar = senha;
    let senhaGerada: string | null = null;
    if (!senhaParaSalvar) {
      senhaGerada = Math.random().toString(36).slice(-6);
      senhaParaSalvar = senhaGerada;
    }
    const senhaHash = await bcrypt.hash(senhaParaSalvar, 10);
    const r = await pool.query(
      'INSERT INTO participante (grupo_bolao_id, nome, telefone, login, senha_hash) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, nome.trim(), telefone ? telefone.trim() : null, login.trim(), senhaHash]
    );
    const response: any = r.rows[0];
    if (senhaGerada) response.senha_gerada = senhaGerada;
    res.status(201).json(response);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ code: 'BOLAO_PARTICIPANTE_DUPLICADO', message: 'Participante ja cadastrado neste grupo' });
    if (e.code === '23503') return res.status(404).json({ code: 'BOLAO_NOT_FOUND', message: 'Grupo nao encontrado' });
    res.status(500).json({ message: e.message });
  }
});

// 6b. Admin - Set participant password
app.post('/api/v1/bolao/participantes/:id/senha', async (req: any, res: any) => {
  const { id } = req.params;
  const { senha } = req.body;
  if (!senha || senha.length < 4) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Senha deve ter no minimo 4 caracteres' });
  try {
    const hash = await bcrypt.hash(senha, 10);
    const r = await pool.query('UPDATE participante SET senha_hash = $1 WHERE id = $2 RETURNING id, nome, telefone', [hash, id]);
    if (r.rowCount === 0) return res.status(404).json({ code: 'NOT_FOUND', message: 'Participante nao encontrado' });
    res.json({ message: 'Senha definida com sucesso', participante: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// 7. Ranking of a group
app.get('/api/v1/bolao/grupos/:id/ranking', async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const r = await pool.query(
      'SELECT * FROM participante WHERE grupo_bolao_id = $1 ORDER BY pontuacao_acumulada DESC, acertos_exatos DESC, acertos_vencedor DESC',
      [id]
    );
    res.json({ data: r.rows, total: r.rowCount });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});
// 8. List all matches
app.get('/api/v1/bolao/partidas', async (_req: any, res: any) => {
  try {
    const r = await pool.query('SELECT * FROM partida ORDER BY data_horario ASC');
    res.json({ data: r.rows, total: r.rowCount });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// 9. Create match
app.post('/api/v1/bolao/partidas', async (req: any, res: any) => {
  const { selecaoMandante, selecaoVisitante, dataHorario, local, faseTorneio } = req.body;
  if (!selecaoMandante || !selecaoVisitante || !dataHorario) {
    return res.status(400).json({ code: 'BOLAO_VALIDATION_ERROR', message: 'selecaoMandante, selecaoVisitante e dataHorario obrigatorios' });
  }
  try {
    const r = await pool.query(
      'INSERT INTO partida (selecao_mandante, bandeira_mandante, selecao_visitante, bandeira_visitante, data_horario, local, fase_torneio) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [selecaoMandante.trim(), '', selecaoVisitante.trim(), '', dataHorario, local || '', faseTorneio || 'fase_de_grupos']
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// 10. Register result and calculate scores
app.post('/api/v1/bolao/partidas/:id/resultado', async (req: any, res: any) => {
  const { id } = req.params;
  const { golsMandante, golsVisitante } = req.body;
  if (golsMandante === undefined || golsVisitante === undefined) {
    return res.status(400).json({ code: 'BOLAO_VALIDATION_ERROR', message: 'golsMandante e golsVisitante obrigatorios' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update match with result
    const matchResult = await client.query(
      'UPDATE partida SET gols_mandante = $1, gols_visitante = $2, status = $3 WHERE id = $4 RETURNING *',
      [golsMandante, golsVisitante, 'finalizada', id]
    );
    if (matchResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ code: 'BOLAO_NOT_FOUND', message: 'Partida nao encontrada' });
    }

    // Get all palpites for this match
    const palpites = await client.query('SELECT * FROM palpite WHERE partida_id = $1', [id]);

    // Calculate score for each palpite
    for (const palpite of palpites.rows) {
      const gM = golsMandante;
      const gV = golsVisitante;
      const pM = palpite.gols_mandante;
      const pV = palpite.gols_visitante;

      let classificacao = 'erro';
      let pontuacao = 0;

      if (pM === gM && pV === gV) {
        classificacao = 'exato';
        pontuacao = 10;
      } else {
        const realDiff = gM - gV;
        const palpDiff = pM - pV;
        const realWinner = gM > gV ? 'mandante' : gM < gV ? 'visitante' : 'empate';
        const palpWinner = pM > pV ? 'mandante' : pM < pV ? 'visitante' : 'empate';

        if (realWinner === palpWinner && realWinner !== 'empate' && realDiff === palpDiff) {
          classificacao = 'diferenca_gols';
          pontuacao = 7;
        } else if (realWinner === palpWinner && realWinner !== 'empate') {
          classificacao = 'vencedor';
          pontuacao = 5;
        } else if (realWinner === 'empate' && palpWinner === 'empate') {
          classificacao = 'empate';
          pontuacao = 5;
        } else if (pM === gM || pV === gV) {
          classificacao = 'gols_parcial';
          pontuacao = 3;
        }
      }

      // Update palpite with score
      await client.query(
        'UPDATE palpite SET pontuacao = $1, classificacao = $2 WHERE id = $3',
        [pontuacao, classificacao, palpite.id]
      );

      // Update participant accumulators
      let acertoField = '';
      if (classificacao === 'exato') acertoField = 'acertos_exatos';
      else if (classificacao === 'vencedor' || classificacao === 'diferenca_gols') acertoField = 'acertos_vencedor';

      let updateSql = 'UPDATE participante SET pontuacao_acumulada = pontuacao_acumulada + $1';
      const params: any[] = [pontuacao];

      if (acertoField) {
        updateSql += ', ' + acertoField + ' = ' + acertoField + ' + 1';
      }
      updateSql += ' WHERE id = $' + (params.length + 1).toString();
      params.push(palpite.participante_id);

      await client.query(updateSql, params);
    }

    await client.query('COMMIT');
    res.json({ message: 'Resultado registrado e pontuacoes calculadas', partida: matchResult.rows[0], palpitesProcessados: palpites.rowCount });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
});
// 11. Register/update palpite with UPSERT and time window check
app.post('/api/v1/bolao/partidas/:id/palpite', async (req: any, res: any) => {
  const { id } = req.params;
  const { participanteId, golsMandante, golsVisitante } = req.body;
  if (!participanteId || golsMandante === undefined || golsVisitante === undefined) {
    return res.status(400).json({ code: 'BOLAO_VALIDATION_ERROR', message: 'participanteId, golsMandante e golsVisitante obrigatorios' });
  }
  try {
    // Check time window - palpite must be before match start
    const match = await pool.query('SELECT * FROM partida WHERE id = $1', [id]);
    if (match.rowCount === 0) return res.status(404).json({ code: 'BOLAO_NOT_FOUND', message: 'Partida nao encontrada' });

    const matchTime = new Date(match.rows[0].data_horario);
    if (new Date() >= matchTime) {
      return res.status(400).json({ code: 'BOLAO_PALPITE_FECHADO', message: 'Palpites encerrados para esta partida' });
    }

    // UPSERT palpite
    const upsertSql = 'INSERT INTO palpite (partida_id, participante_id, gols_mandante, gols_visitante) VALUES ($1, $2, $3, $4) ON CONFLICT (participante_id, partida_id) DO UPDATE SET gols_mandante = $3, gols_visitante = $4, updated_at = NOW() RETURNING *';
    const r = await pool.query(upsertSql, [id, participanteId, golsMandante, golsVisitante]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23503') return res.status(404).json({ code: 'BOLAO_NOT_FOUND', message: 'Partida ou participante nao encontrado' });
    res.status(500).json({ message: e.message });
  }
});

// 12. List palpites for a match
app.get('/api/v1/bolao/partidas/:id/palpites', async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const r = await pool.query(
      'SELECT p.*, par.nome as participante_nome FROM palpite p LEFT JOIN participante par ON p.participante_id = par.id WHERE p.partida_id = $1 ORDER BY par.nome ASC',
      [id]
    );
    res.json({ data: r.rows, total: r.rowCount });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// 13. Dashboard metrics
app.get('/api/v1/bolao/dashboard', async (_req: any, res: any) => {
  try {
    const g = await pool.query('SELECT COUNT(*) FROM grupo_bolao');
    const p = await pool.query('SELECT COUNT(*) FROM participante');
    const m = await pool.query('SELECT COUNT(*) FROM partida');
    const pa = await pool.query('SELECT COUNT(*) FROM palpite');
    res.json({
      totalGrupos: +g.rows[0].count,
      totalParticipantes: +p.rows[0].count,
      totalPartidas: +m.rows[0].count,
      totalPalpites: +pa.rows[0].count
    });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// 14. Delete participant
app.delete('/api/v1/bolao/participantes/:id', async (req: any, res: any) => {
  const { id } = req.params;
  try {
    // Delete palpites first (FK constraint)
    await pool.query('DELETE FROM palpite WHERE participante_id = $1', [id]);
    const r = await pool.query('DELETE FROM participante WHERE id = $1 RETURNING *', [id]);
    if (r.rowCount === 0) return res.status(404).json({ code: 'NOT_FOUND', message: 'Participante nao encontrado' });
    res.json({ message: 'Participante excluido' });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// 15. Participant login by phone
app.get('/api/v1/bolao/participante/login', async (req: any, res: any) => {
  const telefone = req.query.telefone;
  if (!telefone) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Telefone obrigatorio' });
  try {
    const r = await pool.query('SELECT p.*, g.nome as grupo_nome FROM participante p JOIN grupo_bolao g ON g.id = p.grupo_bolao_id WHERE p.telefone = $1', [telefone]);
    if (r.rows.length === 0) return res.status(404).json({ code: 'NOT_FOUND', message: 'Participante nao encontrado. Peca ao admin para te cadastrar.' });
    res.json(r.rows[0]);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// 16. Find participant by phone (path param)
app.get('/api/v1/bolao/participante/telefone/:telefone', async (req: any, res: any) => {
  const { telefone } = req.params;
  try {
    const r = await pool.query('SELECT p.*, g.nome as grupo_nome, g.id as grupo_id FROM participante p JOIN grupo_bolao g ON g.id = p.grupo_bolao_id WHERE p.telefone = $1', [telefone]);
    if (r.rows.length === 0) return res.status(404).json({ code: 'NOT_FOUND', message: 'Telefone nao encontrado. Peca ao admin para te cadastrar.' });
    res.json(r.rows[0]);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// 17. Get participant's predictions
app.get('/api/v1/bolao/participante/:id/palpites', async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const r = await pool.query(
      'SELECT p.*, pa.selecao_mandante, pa.selecao_visitante, pa.data_horario, pa.status as partida_status, pa.gols_mandante as resultado_mandante, pa.gols_visitante as resultado_visitante FROM palpite p JOIN partida pa ON pa.id = p.partida_id WHERE p.participante_id = $1 ORDER BY pa.data_horario DESC',
      [id]
    );
    res.json({ data: r.rows, total: r.rowCount });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// === AUTH MIDDLEWARE ===
function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Token obrigatorio' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.participante = decoded;
    next();
  } catch { return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Token invalido' }); }
}

// 18. Auth login (phone + password)
app.post('/api/v1/bolao/auth/login', async (req: any, res: any) => {
  const { login, senha } = req.body;
  if (!login || !senha) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Login e senha obrigatorios' });
  try {
    const r = await pool.query(
      'SELECT p.*, g.nome as grupo_nome FROM participante p JOIN grupo_bolao g ON g.id = p.grupo_bolao_id WHERE p.login = $1',
      [login]
    );
    if (r.rows.length === 0) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Login ou senha incorretos' });
    const participante = r.rows[0];
    if (!participante.senha_hash) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Senha nao configurada. Peca ao admin para redefinir.' });
    const match = await bcrypt.compare(senha, participante.senha_hash);
    if (!match) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Login ou senha incorretos' });
    const payload = { id: participante.id, nome: participante.nome, grupo_bolao_id: participante.grupo_bolao_id, grupo_nome: participante.grupo_nome };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, participante: payload });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// 19. Auth me (protected)
app.get('/api/v1/bolao/auth/me', authMiddleware, (req: any, res: any) => {
  res.json(req.participante);
});
const PORT = parseInt(process.env.PORT_API || '3000');
app.listen(PORT, '0.0.0.0', () => {
  console.log('Bolao API on port ' + PORT);
});
