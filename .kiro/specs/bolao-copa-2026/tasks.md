# Implementation Plan: Bolao Copa 2026

## Overview

Implementacao do modulo Bolao Copa 2026 como extensao do monolito existente (Express API + Worker + PostgreSQL + Redis + SQS). O plano segue uma abordagem incremental: primeiro a camada de dados e entidades, depois os servicos de dominio com logica de negocio, seguido pela camada de API REST, integracao com o Worker para comandos WhatsApp, e finalmente os componentes de infraestrutura (sincronizador e notificador).

## Tasks

- [x] 1. Database schema e entidades do dominio
  - [x] 1.1 Criar migration SQL com todas as tabelas do modulo Bolao
    - Criar arquivo `src/infra/database/migrations/XXX_create_bolao_tables.sql`
    - Incluir tabelas: grupo_bolao, participante, partida, palpite, pontuacao, ranking_historico, notificacao_log, auditoria_bolao
    - Incluir todos os indexes de performance definidos no design
    - Incluir constraints CHECK e UNIQUE conforme DDL do design
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 8.1_

  - [x] 1.2 Criar entidades TypeScript do dominio Bolao
    - Criar `src/domain/bolao/entities/grupo-bolao.entity.ts`
    - Criar `src/domain/bolao/entities/participante.entity.ts`
    - Criar `src/domain/bolao/entities/partida.entity.ts`
    - Criar `src/domain/bolao/entities/palpite.entity.ts`
    - Criar `src/domain/bolao/entities/pontuacao.entity.ts`
    - Criar `src/domain/bolao/entities/ranking-entry.entity.ts`
    - Definir tipos, enums (StatusGrupoBolao, StatusPartida, FaseTorneio, CategoriaPontuacao) e DTOs conforme design
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1_

  - [x] 1.3 Criar interfaces de repositorio do modulo Bolao
    - Criar `src/domain/bolao/repositories/grupo-bolao.repository.ts`
    - Criar `src/domain/bolao/repositories/participante.repository.ts`
    - Criar `src/domain/bolao/repositories/partida.repository.ts`
    - Criar `src/domain/bolao/repositories/palpite.repository.ts`
    - Criar `src/domain/bolao/repositories/pontuacao.repository.ts`
    - Criar `src/domain/bolao/repositories/ranking.repository.ts`
    - Definir interfaces com metodos CRUD e queries especificas
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1_

  - [x] 1.4 Implementar repositorios PostgreSQL do modulo Bolao
    - Implementar cada repositorio com queries SQL parametrizadas usando `pg`
    - Incluir paginacao, filtros e ordenacao conforme endpoints do design
    - Implementar UPSERT para palpites (ON CONFLICT DO UPDATE)
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1_

- [x] 2. Servicos de dominio - Grupo e Participante
  - [x] 2.1 Implementar BolaoService (gestao de grupos e participantes)
    - Criar `src/domain/bolao/services/bolao.service.ts`
    - Implementar criarGrupo com validacao de nome unico e limite de caracteres
    - Implementar atualizarGrupo com transicoes de status validas
    - Implementar excluirGrupo com verificacao de participantes vinculados
    - Implementar registrarParticipante com validacao de grupo aberto, limite 200, telefone E.164
    - Implementar entrarViaConvite para registro via WhatsApp
    - Implementar classes de erro: BolaoValidationError, GrupoFechadoError, GrupoLotadoError, ParticipanteDuplicadoError, NomeDuplicadoError, GrupoComParticipantesError
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.2 Write property test: Status do Grupo Controla Registro
    - **Property 8: Status do Grupo Controla Registro**
    - Usar fast-check para gerar grupos com status aleatorio e dados de participante validos
    - Verificar que somente grupos com status "aberto" aceitam novos participantes
    - **Validates: Requirements 1.4, 2.4**

  - [ ]* 2.3 Write unit tests para BolaoService
    - Testar criacao de grupo com nome valido e invalido
    - Testar exclusao de grupo com e sem participantes
    - Testar registro de participante em grupo aberto, fechado e lotado
    - Testar duplicidade de telefone no mesmo grupo
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 3. Servicos de dominio - Partida e Palpite
  - [x] 3.1 Implementar PalpiteService (registro e consulta de palpites)
    - Criar `src/domain/bolao/services/palpite.service.ts`
    - Implementar registrarPalpite com verificacao de janela temporal (timestamp < data_horario)
    - Implementar UPSERT semantics (ultimo palpite prevalece)
    - Implementar validacao de gols (inteiro 0-99)
    - Implementar verificarJanelaAberta
    - Implementar listarPalpitesParticipante e listarPalpitesPartida
    - Implementar classes de erro: JanelaFechadaError, BolaoValidationError
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 3.2 Write property test: Enforcement da Janela de Palpite
    - **Property 4: Enforcement da Janela de Palpite**
    - Usar fast-check para gerar timestamps de submissao e data_horario de partida
    - Verificar que palpite e aceito sse timestamp < data_horario
    - **Validates: Requirements 4.1, 4.4, 4.5**

  - [ ]* 3.3 Write property test: Unicidade e Idempotencia de Palpite
    - **Property 5: Unicidade e Idempotencia de Palpite**
    - Usar fast-check para gerar sequencias de palpites do mesmo participante para mesma partida
    - Verificar que apenas um registro ativo existe apos multiplas submissoes
    - **Validates: Requirements 4.3, 4.7, 10.2**

  - [ ]* 3.4 Write property test: Validacao de Valores de Gols
    - **Property 9: Validacao de Valores de Gols**
    - Usar fast-check para gerar valores de gols (negativos, decimais, >99, validos)
    - Verificar que somente inteiros [0, 99] sao aceitos
    - **Validates: Requirements 11.4, 12.6**

  - [ ]* 3.5 Write unit tests para PalpiteService
    - Testar registro de palpite dentro e fora da janela
    - Testar atualizacao de palpite existente (UPSERT)
    - Testar validacao de formato de gols
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 4. Checkpoint - Validar camada de dominio base
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Servico de Pontuacao
  - [x] 5.1 Implementar PontuacaoService (calculo automatico de pontos)
    - Criar `src/domain/bolao/services/pontuacao.service.ts`
    - Implementar calcularPontuacaoPalpite com regras mutuamente exclusivas:
      - exato (10pts): ambos gols corretos
      - diferenca_gols (7pts): vencedor correto + diferenca correta, nao exato
      - vencedor (5pts): vencedor correto, diferenca incorreta
      - empate (5pts): ambos empate, placar diferente
      - gols_parcial (3pts): acerta gols de exatamente um time, sem enquadrar acima
      - erro (0pts): caso contrario
    - Implementar calcularPontuacao(partidaId) que processa todos os palpites de uma partida
    - Atualizar pontuacao_acumulada, acertos_exatos e acertos_vencedor do participante
    - Usar distributed lock Redis para evitar calculo duplicado
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [ ]* 5.2 Write property test: Corretude da Funcao de Pontuacao
    - **Property 1: Corretude da Funcao de Pontuacao**
    - Usar fast-check para gerar pares (palpite, placarReal) com gols 0-99
    - Verificar que exatamente uma categoria e retornada e pontuacao corresponde
    - Verificar exclusividade mutua das categorias
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8**

  - [ ]* 5.3 Write property test: Invariante da Pontuacao Acumulada
    - **Property 2: Invariante da Pontuacao Acumulada**
    - Usar fast-check para gerar sequencias de palpites pontuados
    - Verificar que pontuacao_acumulada == soma dos pontos individuais
    - Verificar que acertos_exatos == count(categoria "exato")
    - Verificar que acertos_vencedor == count(categoria "vencedor" ou "diferenca_gols")
    - **Validates: Requirements 5.9**

  - [ ]* 5.4 Write unit tests para PontuacaoService
    - Testar cada categoria de pontuacao com exemplos concretos
    - Testar calculo em lote para uma partida
    - Testar idempotencia (recalculo nao duplica pontos)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

- [x] 6. Servico de Ranking
  - [x] 6.1 Implementar RankingService (ranking com desempate e cache)
    - Criar `src/domain/bolao/services/ranking.service.ts`
    - Implementar obterRanking com paginacao e criterios de desempate:
      1. Maior pontuacao_acumulada
      2. Maior acertos_exatos
      3. Maior acertos_vencedor
    - Implementar cache Redis com TTL 60s e invalidacao apos calculo de pontuacao
    - Implementar atualizarRanking que recalcula posicoes e salva historico
    - Implementar obterRankingTop para consultas rapidas (top N)
    - Implementar exportarRankingCSV com cabecalho e todas as colunas
    - Implementar obterPosicaoParticipante para consulta individual
    - Definir constantes Redis conforme design (REDIS_BOLAO_KEYS)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 8.5_

  - [ ]* 6.2 Write property test: Consistencia do Ranking
    - **Property 3: Consistencia do Ranking**
    - Usar fast-check para gerar listas de participantes com pontuacoes aleatorias
    - Verificar ordenacao correta com criterios de desempate
    - **Validates: Requirements 6.1, 6.2**

  - [ ]* 6.3 Write property test: Completude da Exportacao CSV
    - **Property 10: Completude da Exportacao CSV**
    - Usar fast-check para gerar rankings com N participantes
    - Verificar que CSV tem exatamente N linhas de dados + cabecalho
    - Verificar que cada linha contem: posicao, nome, telefone, pontuacao, acertos
    - **Validates: Requirements 8.5**

  - [ ]* 6.4 Write unit tests para RankingService
    - Testar ordenacao com empates em diferentes niveis
    - Testar invalidacao de cache Redis
    - Testar exportacao CSV com dados variados
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 8.5_

- [x] 7. Checkpoint - Validar servicos de pontuacao e ranking
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Servico de Comandos WhatsApp
  - [ ] 8.1 Implementar ComandoBolaoService (parser e processamento de comandos)
    - Criar `src/domain/bolao/services/comando-bolao.service.ts`
    - Implementar identificarComando com case-insensitive matching para: JOGOS, RANKING, MEUS PALPITES, AJUDA, ENTRAR
    - Implementar parsearComandoPalpite com regex para formato "[Selecao] [N] x [N] [Selecao]"
    - Implementar processarMensagem que roteia para o handler correto
    - Implementar rate limiting via Redis (max comandos invalidos por telefone, silencio 15 min)
    - Implementar respostas formatadas para cada comando
    - Implementar handler ENTRAR para registro via codigo de convite
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ]* 8.2 Write property test: Case-Insensitivity de Comandos
    - **Property 6: Case-Insensitivity de Comandos**
    - Usar fast-check para gerar variacoes de caixa dos comandos validos
    - Verificar que o parser identifica o mesmo tipo de comando independente da caixa
    - **Validates: Requirements 9.6**

  - [ ]* 8.3 Write property test: Validacao de Formato de Palpite
    - **Property 7: Validacao de Formato de Palpite**
    - Usar fast-check para gerar strings validas e invalidas no formato de palpite
    - Verificar extracao correta de selecoes e gols para formatos validos
    - Verificar retorno de erro para formatos invalidos
    - **Validates: Requirements 4.1, 4.6**

  - [ ]* 8.4 Write unit tests para ComandoBolaoService
    - Testar cada comando (JOGOS, RANKING, MEUS PALPITES, AJUDA, ENTRAR)
    - Testar parse de palpite com formatos validos e invalidos
    - Testar rate limiting e silenciamento
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [ ] 9. Integracao Worker - Handler de Comandos Bolao
  - [ ] 9.1 Implementar bolao-comando.handler no Worker
    - Criar `src/worker/handlers/bolao-comando.handler.ts`
    - Implementar deteccao de mensagens bolao no pipeline existente do Worker
    - Integrar com ComandoBolaoService para processamento
    - Enviar resposta via WhatsApp Cloud API usando servico existente
    - Tratar erros com mensagens amigaveis ao participante
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2_

  - [ ]* 9.2 Write unit tests para bolao-comando.handler
    - Testar roteamento de mensagens para o handler correto
    - Testar tratamento de erros com respostas amigaveis
    - _Requirements: 9.1, 10.1_

- [ ] 10. Camada API REST - Controllers e Rotas
  - [ ] 10.1 Implementar controllers do modulo Bolao
    - Criar `src/api/controllers/bolao/grupo-bolao.controller.ts` - CRUD de grupos
    - Criar `src/api/controllers/bolao/participante.controller.ts` - gestao de participantes
    - Criar `src/api/controllers/bolao/partida.controller.ts` - CRUD de partidas, importacao em lote, resultado manual
    - Criar `src/api/controllers/bolao/palpite.controller.ts` - registro e listagem de palpites
    - Criar `src/api/controllers/bolao/ranking.controller.ts` - ranking paginado e exportacao CSV
    - Implementar validacao de input com Zod em cada controller
    - Implementar tratamento de erros com mapeamento para HTTP status codes
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 3.1, 3.2, 3.3, 4.1, 6.1, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 10.2 Implementar rotas e middleware do modulo Bolao
    - Criar `src/api/routes/bolao.routes.ts` com todos os endpoints definidos no design
    - Aplicar middleware de autenticacao JWT existente nas rotas admin
    - Aplicar middleware de autorizacao (admin vs participante)
    - Registrar rotas no Express app existente
    - _Requirements: 8.1, 8.2, 8.3, 11.1, 11.2, 11.3_

  - [ ] 10.3 Implementar controller de Dashboard admin
    - Adicionar endpoint GET /api/v1/bolao/dashboard com metricas gerais
    - Adicionar endpoint GET /api/v1/bolao/notificacoes com log paginado
    - Metricas: total grupos, participantes, partidas, palpites, taxa de acerto
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 10.4 Write unit tests para controllers
    - Testar validacao de input (Zod schemas)
    - Testar mapeamento de erros para HTTP status
    - Testar paginacao e filtros
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 11. Checkpoint - Validar API REST completa
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Sincronizador de Resultados
  - [ ] 12.1 Implementar cliente da fonte externa de resultados
    - Criar `src/infra/bolao/fonte-resultados.client.ts`
    - Implementar consulta a API externa com timeout de 10s
    - Implementar retry com backoff exponencial
    - Implementar mapeamento de dados externos para formato interno
    - Tratar erros: FonteIndisponivelError, ResultadoInconsistenteError
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [ ] 12.2 Implementar SincronizadorResultados como ECS Scheduled Task
    - Criar `src/infra/bolao/sincronizador.task.ts`
    - Implementar logica de sincronizacao: consultar partidas em_andamento, buscar resultados, atualizar DB
    - Disparar calculo de pontuacao via PontuacaoService quando partida finalizada
    - Implementar logging estruturado para monitoramento
    - Configurar execucao a cada 5 minutos durante jogos
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 12.3 Write unit tests para SincronizadorResultados
    - Testar fluxo completo de sincronizacao com mock da API externa
    - Testar tratamento de erros (timeout, dados inconsistentes)
    - Testar que pontuacao e disparada apos finalizacao
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 13. Notificador Bolao
  - [ ] 13.1 Implementar NotificadorBolao (consumer SQS + envio WhatsApp)
    - Criar `src/infra/bolao/notificador.consumer.ts`
    - Criar `src/domain/bolao/services/notificador-bolao.service.ts`
    - Implementar consumer SQS para fila dedicada de notificacoes bolao
    - Implementar notificarResultado: envia placar + pontuacao individual
    - Implementar notificarLembrete24h e notificarLembrete2h
    - Implementar notificarRankingAtualizado: envia top 5 do ranking
    - Respeitar rate limit WhatsApp (80 msg/s) com backoff
    - Registrar log de notificacoes na tabela notificacao_log
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ]* 13.2 Write unit tests para NotificadorBolao
    - Testar formatacao de mensagens de notificacao
    - Testar rate limiting e backoff
    - Testar registro no log de notificacoes
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [ ] 14. Integracao final e wiring
  - [ ] 14.1 Wiring de dependencias e registro do modulo
    - Registrar todos os repositorios e servicos no container de DI existente
    - Registrar rotas bolao no Express app principal
    - Registrar handler de comandos bolao no pipeline do Worker
    - Configurar fila SQS dedicada para notificacoes bolao
    - Adicionar variaveis de ambiente necessarias ao .env.example
    - _Requirements: 1.1, 8.1, 9.1, 10.1_

  - [ ]* 14.2 Write integration tests para fluxos completos
    - Testar fluxo completo: registro de palpite via WhatsApp -> confirmacao
    - Testar fluxo completo: resultado registrado -> pontuacao calculada -> ranking atualizado
    - Testar fluxo completo: CRUD de grupo via API -> participantes -> palpites
    - _Requirements: 4.1, 5.1, 6.1, 9.1, 10.1_

- [ ] 15. Final checkpoint - Validar integracao completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design document
- Unit tests validate specific examples and edge cases
- The module integrates into the existing monolith - no new ECS services needed
- All TypeScript code uses the existing project conventions (Zod validation, Result pattern, pg for DB)
- fast-check is already available in the project for property-based testing
- Vitest is the test runner (use `vitest run` for single execution)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["2.1", "3.1"] },
    { "id": 4, "tasks": ["2.2", "2.3", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 5, "tasks": ["5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3", "5.4"] },
    { "id": 7, "tasks": ["6.1"] },
    { "id": 8, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 9, "tasks": ["8.1"] },
    { "id": 10, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 11, "tasks": ["9.1", "10.1", "10.2", "10.3"] },
    { "id": 12, "tasks": ["9.2", "10.4"] },
    { "id": 13, "tasks": ["12.1", "13.1"] },
    { "id": 14, "tasks": ["12.2"] },
    { "id": 15, "tasks": ["12.3", "13.2"] },
    { "id": 16, "tasks": ["14.1"] },
    { "id": 17, "tasks": ["14.2"] }
  ]
}
```
