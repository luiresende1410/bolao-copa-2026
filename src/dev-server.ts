/**
 * Servidor de desenvolvimento in-memory para teste rapido.
 * Nao precisa de PostgreSQL, Redis ou SQS.
 * 
 * Uso: npx ts-node -r tsconfig-paths/register src/dev-server.ts
 */

import express from 'express';
import { randomUUID } from 'crypto';
import type {
  GrupoBolao, Participante, Partida, Palpite, Pontuacao,
  CriarGrupoDTO, AtualizarGrupoDTO, RegistrarParticipanteDTO,
  CriarPartidaDTO, RegistrarResultadoDTO,
  StatusGrupoBolao, StatusPartida, FaseTorneio, CategoriaPontuacao,
} from '@domain/bolao/entities';

const app = express();
app.use(express.json());

// === In-Memory Storage ===
const grupos: GrupoBolao[] = [];
const participantes: Participante[] = [];
const partidas: Partida[] = [];
const palpites: Palpite[] = [];
const pontuacoes: Pontuacao[] = [];

// === Helpers ===
function now() { return new Date(); }

function calcularPontuacao(pM: number, pV: number, rM: number, rV: number): { pontos: number; categoria: CategoriaPontuacao } {
  if (pM === rM && pV === rV) return { pontos: 10, categoria: 'exato' };
  const vP = pM > pV ? 'M' : pM < pV ? 'V' : 'E';
  const vR = rM > rV ? 'M' : rM < rV ? 'V' : 'E';
  if (vP === vR && vP !== 'E' && (pM - pV) === (rM - rV)) return { pontos: 7, categoria: 'diferenca_gols' };
  if (vP === vR && vP !== 'E') return { pontos: 5, categoria: 'vencedor' };
  if (vP === 'E' && vR === 'E') return { pontos: 5, categoria: 'empate' };
  const acM = pM === rM;
  const acV = pV === rV;
  if ((acM && !acV) || (!acM && acV)) return { pontos: 3, categoria: 'gols_parcial' };
  return { pontos: 0, categoria: 'erro' };
}

// === Health ===
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'in-memory', timestamp: new Date().toISOString() });
});

// === GRUPOS ===
app.get('/api/v1/bolao/grupos', (_req, res) => {
  res.json({ data: grupos, total: grupos.length, pagina: 1, tamanhoPagina: 50, totalPaginas: 1 });
});

app.post('/api/v1/bolao/grupos', (req, res) => {
  const { nome, descricao } = req.body as CriarGrupoDTO;
  if (!nome || nome.trim().length === 0) return res.status(400).json({ code: 'BOLAO_VALIDATION_ERROR', message: 'Nome obrigatorio' });
  if (grupos.find(g => g.nome === nome.trim())) return res.status(409).json({ code: 'BOLAO_NOME_DUPLICADO', message: 'Nome ja existe' });
  const grupo: GrupoBolao = { id: randomUUID(), nome: nome.trim(), descricao: descricao ?? null, status: 'aberto', criadoPor: 'admin', createdAt: now(), updatedAt: now() };
  grupos.push(grupo);
  res.status(201).json(grupo);
});

app.patch('/api/v1/bolao/grupos/:id', (req, res) => {
  const grupo = grupos.find(g => g.id === req.params.id);
  if (!grupo) return res.status(404).json({ code: 'NOT_FOUND', message: 'Grupo nao encontrado' });
  const { nome, descricao, status } = req.body as AtualizarGrupoDTO;
  if (nome) grupo.nome = nome.trim();
  if (descricao !== undefined) grupo.descricao = descricao;
  if (status) grupo.status = status;
  grupo.updatedAt = now();
  res.json(grupo);
});

app.delete('/api/v1/bolao/grupos/:id', (req, res) => {
  const idx = grupos.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ code: 'NOT_FOUND', message: 'Grupo nao encontrado' });
  if (participantes.some(p => p.grupoBolaoId === req.params.id)) return res.status(400).json({ code: 'BOLAO_GRUPO_COM_PARTICIPANTES', message: 'Grupo tem participantes' });
  grupos.splice(idx, 1);
  res.status(204).send();
});

// === PARTICIPANTES ===
app.get('/api/v1/bolao/grupos/:id/participantes', (req, res) => {
  const lista = participantes.filter(p => p.grupoBolaoId === req.params.id);
  res.json({ data: lista, total: lista.length, pagina: 1, tamanhoPagina: 50, totalPaginas: 1 });
});

app.post('/api/v1/bolao/grupos/:id/participantes', (req, res) => {
  const grupo = grupos.find(g => g.id === req.params.id);
  if (!grupo) return res.status(404).json({ code: 'NOT_FOUND', message: 'Grupo nao encontrado' });
  if (grupo.status !== 'aberto') return res.status(400).json({ code: 'BOLAO_GRUPO_FECHADO', message: 'Grupo nao esta aberto' });
  const count = participantes.filter(p => p.grupoBolaoId === req.params.id).length;
  if (count >= 200) return res.status(400).json({ code: 'BOLAO_GRUPO_LOTADO', message: 'Limite de 200 participantes' });
  const { nome, telefone } = req.body as RegistrarParticipanteDTO;
  if (!nome || !telefone) return res.status(400).json({ code: 'BOLAO_VALIDATION_ERROR', message: 'Nome e telefone obrigatorios' });
  if (participantes.find(p => p.telefone === telefone && p.grupoBolaoId === req.params.id)) return res.status(409).json({ code: 'BOLAO_PARTICIPANTE_DUPLICADO', message: 'Telefone ja registrado' });
  const part: Participante = { id: randomUUID(), nome: nome.trim(), telefone, grupoBolaoId: req.params.id, pontuacaoAcumulada: 0, acertosExatos: 0, acertosVencedor: 0, createdAt: now() };
  participantes.push(part);
  res.status(201).json(part);
});

// === PARTIDAS ===
app.get('/api/v1/bolao/partidas', (_req, res) => {
  res.json({ data: partidas, total: partidas.length, pagina: 1, tamanhoPagina: 50, totalPaginas: 1 });
});

app.post('/api/v1/bolao/partidas', (req, res) => {
  const dto = req.body as CriarPartidaDTO;
  if (!dto.selecaoMandante || !dto.selecaoVisitante || !dto.dataHorario || !dto.local || !dto.faseTorneio) {
    return res.status(400).json({ code: 'BOLAO_VALIDATION_ERROR', message: 'Campos obrigatorios: selecaoMandante, selecaoVisitante, dataHorario, local, faseTorneio' });
  }
  const partida: Partida = {
    id: randomUUID(), selecaoMandante: dto.selecaoMandante, bandeiraMandante: '', selecaoVisitante: dto.selecaoVisitante, bandeiraVisitante: '',
    dataHorario: new Date(dto.dataHorario), local: dto.local, faseTorneio: dto.faseTorneio, status: 'agendada',
    golsMandante: null, golsVisitante: null, syncAutomatico: true, createdAt: now(), updatedAt: now(),
  };
  partidas.push(partida);
  res.status(201).json(partida);
});

app.post('/api/v1/bolao/partidas/:id/resultado', (req, res) => {
  const partida = partidas.find(p => p.id === req.params.id);
  if (!partida) return res.status(404).json({ code: 'NOT_FOUND', message: 'Partida nao encontrada' });
  const { golsMandante, golsVisitante } = req.body as RegistrarResultadoDTO;
  if (golsMandante == null || golsVisitante == null) return res.status(400).json({ code: 'BOLAO_VALIDATION_ERROR', message: 'golsMandante e golsVisitante obrigatorios' });
  partida.golsMandante = golsMandante;
  partida.golsVisitante = golsVisitante;
  partida.status = 'finalizada';
  partida.updatedAt = now();

  // Calcular pontuacao automaticamente
  const palpitesPartida = palpites.filter(p => p.partidaId === partida.id);
  for (const palpite of palpitesPartida) {
    const calc = calcularPontuacao(palpite.golsMandante, palpite.golsVisitante, golsMandante, golsVisitante);
    pontuacoes.push({ id: randomUUID(), palpiteId: palpite.id, pontos: calc.pontos, categoria: calc.categoria, createdAt: now() });
    const part = participantes.find(p => p.id === palpite.participanteId);
    if (part) {
      part.pontuacaoAcumulada += calc.pontos;
      if (calc.categoria === 'exato') part.acertosExatos++;
      if (calc.categoria === 'vencedor' || calc.categoria === 'diferenca_gols') part.acertosVencedor++;
    }
  }
  res.json({ partida, pontuacoesCalculadas: palpitesPartida.length });
});

// === PALPITES ===
app.post('/api/v1/bolao/partidas/:id/palpite', (req, res) => {
  const partida = partidas.find(p => p.id === req.params.id);
  if (!partida) return res.status(404).json({ code: 'NOT_FOUND', message: 'Partida nao encontrada' });
  if (new Date() >= partida.dataHorario) return res.status(400).json({ code: 'BOLAO_JANELA_FECHADA', message: 'Janela de palpite fechada' });
  const { participanteId, golsMandante, golsVisitante } = req.body;
  if (!participanteId || golsMandante == null || golsVisitante == null) return res.status(400).json({ code: 'BOLAO_VALIDATION_ERROR', message: 'participanteId, golsMandante e golsVisitante obrigatorios' });
  if (!Number.isInteger(golsMandante) || golsMandante < 0 || golsMandante > 99) return res.status(400).json({ code: 'BOLAO_VALIDATION_ERROR', message: 'golsMandante deve ser inteiro 0-99' });
  if (!Number.isInteger(golsVisitante) || golsVisitante < 0 || golsVisitante > 99) return res.status(400).json({ code: 'BOLAO_VALIDATION_ERROR', message: 'golsVisitante deve ser inteiro 0-99' });

  // UPSERT
  const existente = palpites.findIndex(p => p.participanteId === participanteId && p.partidaId === req.params.id);
  if (existente >= 0) {
    palpites[existente].golsMandante = golsMandante;
    palpites[existente].golsVisitante = golsVisitante;
    palpites[existente].updatedAt = now();
    return res.json(palpites[existente]);
  }
  const palpite: Palpite = { id: randomUUID(), participanteId, partidaId: req.params.id, golsMandante, golsVisitante, createdAt: now(), updatedAt: now() };
  palpites.push(palpite);
  res.status(201).json(palpite);
});

app.get('/api/v1/bolao/partidas/:id/palpites', (req, res) => {
  const lista = palpites.filter(p => p.partidaId === req.params.id);
  res.json({ data: lista, total: lista.length });
});

// === RANKING ===
app.get('/api/v1/bolao/grupos/:id/ranking', (req, res) => {
  const lista = participantes
    .filter(p => p.grupoBolaoId === req.params.id)
    .sort((a, b) => b.pontuacaoAcumulada - a.pontuacaoAcumulada || b.acertosExatos - a.acertosExatos || b.acertosVencedor - a.acertosVencedor)
    .map((p, i) => ({ posicao: i + 1, participanteId: p.id, nome: p.nome, pontuacaoTotal: p.pontuacaoAcumulada, acertosExatos: p.acertosExatos, acertosVencedor: p.acertosVencedor, variacaoPosicao: 0 }));
  res.json({ data: lista, total: lista.length, pagina: 1, tamanhoPagina: 50, totalPaginas: 1 });
});

// === DASHBOARD ===
app.get('/api/v1/bolao/dashboard', (_req, res) => {
  res.json({
    totalGrupos: grupos.length,
    totalParticipantes: participantes.length,
    totalPartidas: partidas.length,
    totalPalpites: palpites.length,
    partidasFinalizadas: partidas.filter(p => p.status === 'finalizada').length,
    proximaPartida: partidas.find(p => p.status === 'agendada') ?? null,
  });
});

// === START ===
const PORT = 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('===========================================');
  console.log('  BOLAO COPA 2026 - Dev Server (In-Memory)');
  console.log('===========================================');
  console.log('  Mode: In-Memory (sem PostgreSQL/Redis)');
  console.log('  Port: ' + PORT);
  console.log('  Health: http://localhost:' + PORT + '/health');
  console.log('');
  console.log('  Endpoints disponiveis:');
  console.log('    GET    /api/v1/bolao/grupos');
  console.log('    POST   /api/v1/bolao/grupos');
  console.log('    PATCH  /api/v1/bolao/grupos/:id');
  console.log('    DELETE /api/v1/bolao/grupos/:id');
  console.log('    GET    /api/v1/bolao/grupos/:id/participantes');
  console.log('    POST   /api/v1/bolao/grupos/:id/participantes');
  console.log('    GET    /api/v1/bolao/grupos/:id/ranking');
  console.log('    GET    /api/v1/bolao/partidas');
  console.log('    POST   /api/v1/bolao/partidas');
  console.log('    POST   /api/v1/bolao/partidas/:id/resultado');
  console.log('    POST   /api/v1/bolao/partidas/:id/palpite');
  console.log('    GET    /api/v1/bolao/partidas/:id/palpites');
  console.log('    GET    /api/v1/bolao/dashboard');
  console.log('');
  console.log('  Pronto para testar!');
  console.log('===========================================');
});
