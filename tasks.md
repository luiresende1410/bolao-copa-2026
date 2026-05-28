# Implementation Plan: WhatsApp Multi-Agent Panel

## Overview

Implementacao incremental do Painel Multiatendente integrado a WhatsApp Cloud API. O plano segue a arquitetura de 3 servicos ECS (API, Webhook, Worker) com PostgreSQL, Redis e SQS. Cada tarefa constroi sobre as anteriores, comecando pela infraestrutura compartilhada e progredindo ate a integracao completa.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["5", "6", "7"] },
    { "wave": 6, "tasks": ["8"] },
    { "wave": 7, "tasks": ["9"] },
    { "wave": 8, "tasks": ["10"] },
    { "wave": 9, "tasks": ["11"] },
    { "wave": 10, "tasks": ["12"] },
    { "wave": 11, "tasks": ["13"] },
    { "wave": 12, "tasks": ["14"] },
    { "wave": 13, "tasks": ["15"] },
    { "wave": 14, "tasks": ["16"] },
    { "wave": 15, "tasks": ["17"] },
    { "wave": 16, "tasks": ["18"] }
  ]
}
```

## Tasks

- [ ] 1. Setup do projeto e infraestrutura base
  - [x] 1.1 Inicializar monorepo Node.js + TypeScript
    - Criar `package.json`, `tsconfig.json`, `.env.example`
    - Configurar ESLint, Prettier, paths aliases
    - Instalar dependencias: express, ws, pg, ioredis, aws-sdk, bcrypt, jsonwebtoken, zod
    - Criar estrutura de diretorios conforme design (`src/api`, `src/webhook`, `src/worker`, `src/domain`, `src/infra`, `src/shared`)
    - _Requirements: 6.1_

  - [-] 1.2 Configurar infraestrutura de banco de dados
    - Criar `src/infra/database/connection.ts` com pool de conexoes PostgreSQL
    - Criar `src/infra/config/env.ts` com validacao de variaveis de ambiente via zod
    - Configurar `docker-compose.yml` com PostgreSQL 15, Redis e LocalStack (SQS)
    - _Requirements: 6.1, 9.6_

  - [ ] 1.3 Criar migrations do banco de dados
    - Criar tabelas: `departamento`, `numero_whatsapp`, `atendente`, `atendente_departamento`, `conversa`, `mensagem`, `login_tentativa`, `auditoria_ownership`
    - Criar partial unique index `idx_conversa_ownership_exclusivo`
    - Criar indexes: `idx_conversa_fila_espera`, `idx_conversa_cliente`, `idx_mensagem_conversa_cursor`, `idx_mensagem_whatsapp_id`
    - Criar constraints de integridade referencial (ON DELETE RESTRICT/CASCADE)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_

  - [ ] 1.4 Configurar cliente Redis e SQS
    - Criar `src/infra/redis/client.ts` com conexao ElastiCache Redis
    - Criar `src/infra/redis/pubsub.ts` com publish/subscribe por canal de departamento
    - Criar `src/infra/sqs/producer.ts` e `src/infra/sqs/consumer.ts`
    - Definir chaves Redis conforme estrategia do design (buffer, sessao, canais, rate limiting)
    - _Requirements: 3.5, 7.4_

  - [ ] 1.5 Criar shared types, errors e logger
    - Criar `src/shared/types/` com todos os enums e interfaces TypeScript do design (StatusConversa, StatusAtendente, PapelAtendente, TipoMensagem, etc.)
    - Criar `src/shared/errors/` com classes de erro customizadas (OwnershipError, AuthError, WhatsAppError, ValidationError)
    - Criar `src/shared/logger.ts` com logger estruturado (pino ou winston)
    - _Requirements: 9.1, 9.5_

- [ ] 2. Camada de dominio - Entidades e Repositorios
  - [ ] 2.1 Implementar entidades de dominio
    - Criar `src/domain/entities/atendente.entity.ts` com validacoes de negocio
    - Criar `src/domain/entities/conversa.entity.ts` com maquina de estados (aguardando -> em_atendimento -> finalizada)
    - Criar `src/domain/entities/mensagem.entity.ts` com validacao de tipo e conteudo
    - Criar `src/domain/entities/departamento.entity.ts`
    - Criar `src/domain/entities/numero-whatsapp.entity.ts`
    - _Requirements: 4.1, 5.1, 6.3, 11.4_

  - [ ] 2.2 Implementar repositorios
    - Criar `src/domain/repositories/atendente.repository.ts` com CRUD, busca por email, listagem paginada
    - Criar `src/domain/repositories/conversa.repository.ts` com busca por status, fila de espera, ownership
    - Criar `src/domain/repositories/mensagem.repository.ts` com paginacao por cursor (timestamp)
    - Criar `src/domain/repositories/departamento.repository.ts` com associacoes N:N
    - _Requirements: 4.7, 5.1, 7.2, 8.1_

  - [ ]* 2.3 Escrever testes unitarios para entidades de dominio
    - Testar transicoes de estado da Conversa (aguardando -> em_atendimento -> finalizada)
    - Testar validacoes de Atendente (email RFC 5322, senha minimo 8 chars)
    - Testar validacao de Mensagem (limite 4096 chars texto, tipos validos)
    - _Requirements: 4.1, 5.1, 6.3_

- [ ] 3. Servicos de dominio - Auth e Ownership
  - [ ] 3.1 Implementar servico de autenticacao
    - Criar `src/domain/services/auth.service.ts` implementando IAuthService
    - Login com bcrypt compare, geracao JWT (expiracao 8h), refresh token
    - Bloqueio de login apos 5 tentativas falhas (15 min) usando Redis
    - Registro de tentativas na tabela `login_tentativa`
    - Revogacao de tokens (blacklist em Redis com TTL)
    - _Requirements: 4.2, 4.4, 4.5, 9.7_

  - [ ] 3.2 Implementar servico de ownership
    - Criar `src/domain/services/ownership.service.ts` implementando IOwnershipService
    - `assumirConversa`: transacao com SELECT FOR UPDATE, verificacao de status, atribuicao atomica
    - `finalizarConversa`: alterar status para "finalizada", remover ownership
    - `liberarConversasOffline`: liberar conversas de atendentes offline > 5 min
    - `verificarOwnership`: checar se atendente e dono da conversa
    - Registrar acoes na tabela `auditoria_ownership`
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 9.5_

  - [ ] 3.3 Implementar servico de fila de espera
    - Criar `src/domain/services/fila-espera.service.ts` implementando IFilaEsperaService
    - Listagem paginada filtrada por departamentos do atendente
    - Ordenacao por timestamp de criacao (mais antiga primeiro)
    - Contagem com cache Redis (TTL 5s)
    - _Requirements: 7.1, 7.2, 7.5_

  - [ ] 3.4 Implementar servico WhatsApp API
    - Criar `src/domain/services/whatsapp-api.service.ts` implementando IWhatsAppApiService
    - `enviarMensagemTexto`: POST para WhatsApp Cloud API com timeout 30s
    - `enviarTemplate`: envio de templates pre-aprovados
    - `validarConectividade`: verificacao de Phone Number ID com timeout 10s
    - Tratamento de janela de 24h (rejeitar mensagens nao-template fora da janela)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 11.2, 11.3_

  - [ ]* 3.5 Escrever testes unitarios para servicos de dominio
    - Testar fluxo de ownership com concorrencia simulada
    - Testar bloqueio de login apos 5 tentativas
    - Testar rejeicao de mensagem fora da janela 24h
    - Testar liberacao de conversas de atendente offline
    - _Requirements: 4.5, 5.2, 5.3, 5.6_

- [ ] 4. Checkpoint - Validar camada de dominio
  - Executar migrations no banco local via docker-compose
  - Executar todos os testes unitarios
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Webhook Service - Recebimento de mensagens
  - [ ] 5.1 Implementar handler de verificacao do webhook
    - Criar `src/webhook/webhook.handler.ts` com rota GET /webhook
    - Validar `hub.verify_token` contra token configurado
    - Responder com `hub.challenge` (200) ou rejeitar (403)
    - _Requirements: 1.4, 1.5_

  - [ ] 5.2 Implementar validacao de assinatura
    - Criar `src/webhook/signature.validator.ts`
    - Validar X-Hub-Signature-256 usando App Secret (HMAC SHA-256)
    - Rejeitar com 401 se assinatura invalida, registrar em log
    - _Requirements: 1.1, 1.3_

  - [ ] 5.3 Implementar parser de payload e publicacao na fila
    - Criar `src/webhook/payload.parser.ts` para extrair mensagens do payload WhatsApp
    - Extrair: remetente, conteudo, tipo (texto/imagem/documento/audio), timestamp, message_id, phone_number_id
    - Validar estrutura do payload (campos obrigatorios)
    - Publicar mensagem valida no SQS
    - Responder HTTP 200 em todos os casos (evitar reenvios)
    - Registrar payloads invalidos em log
    - _Requirements: 1.1, 1.2, 1.6, 1.7, 11.6_

  - [ ] 5.4 Criar entrypoint do Webhook Service
    - Criar servidor Express dedicado para o webhook
    - Configurar health check endpoint
    - Configurar graceful shutdown
    - _Requirements: 1.1_

  - [ ]* 5.5 Escrever testes unitarios para Webhook Service
    - Testar validacao de assinatura (valida/invalida)
    - Testar parsing de diferentes tipos de payload (texto, imagem, documento, audio)
    - Testar rejeicao de payloads malformados
    - Testar verificacao de webhook (token correto/incorreto)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] 6. Worker Service - Processamento assincrono
  - [ ] 6.1 Implementar processador de mensagens
    - Criar `src/worker/message.processor.ts`
    - Consumir mensagens do SQS com long polling
    - Verificar duplicata por `whatsapp_message_id` antes de persistir
    - Persistir mensagem no banco de dados
    - _Requirements: 1.2, 1.7, 8.4_

  - [ ] 6.2 Implementar gerenciador de conversas
    - Criar `src/worker/conversation.manager.ts`
    - Criar nova Conversa (status "aguardando") se nao existir conversa ativa para o cliente
    - Atualizar `ultima_mensagem_at` e `mensagens_nao_lidas` em conversas existentes
    - Identificar Numero_WhatsApp pelo phone_number_id e vincular ao Departamento correto
    - Ignorar mensagens para numeros inativos ou nao cadastrados (log + descarte)
    - _Requirements: 5.1, 6.5, 7.3, 7.5, 11.6, 11.7_

  - [ ] 6.3 Implementar publicador de notificacoes
    - Criar `src/worker/notification.publisher.ts`
    - Publicar evento no canal Redis do departamento correspondente
    - Incluir dados: conversa_id, mensagem_id, tipo, timestamp
    - _Requirements: 3.3, 3.4, 7.4_

  - [ ] 6.4 Criar entrypoint do Worker Service
    - Criar consumer SQS com graceful shutdown
    - Configurar concorrencia (max messages in flight)
    - Configurar health check endpoint
    - _Requirements: 1.2_

  - [ ]* 6.5 Escrever testes unitarios para Worker Service
    - Testar deduplicacao de mensagens
    - Testar criacao de nova conversa vs atualizacao de existente
    - Testar roteamento por departamento
    - Testar descarte de mensagens para numeros inativos
    - _Requirements: 1.7, 7.3, 11.6, 11.7_

- [ ] 7. API Service - Autenticacao e Atendentes
  - [ ] 7.1 Implementar middlewares base
    - Criar `src/api/middlewares/auth.middleware.ts` com validacao JWT (assinatura, expiracao, issuer)
    - Criar `src/api/middlewares/validation.middleware.ts` com schemas zod para cada rota
    - Criar `src/api/middlewares/rate-limit.middleware.ts` usando Redis (sliding window)
    - Criar `src/api/middlewares/department-access.middleware.ts` para filtrar acesso por departamento
    - _Requirements: 9.1, 9.2, 9.3, 12.3_

  - [ ] 7.2 Implementar controller de autenticacao
    - Criar `src/api/controllers/auth.controller.ts`
    - POST /api/v1/auth/login: validar credenciais, gerar JWT, registrar tentativa
    - POST /api/v1/auth/logout: revogar token, atualizar status para offline
    - Mensagens de erro genericas (nao revelar qual campo esta incorreto)
    - _Requirements: 4.4, 4.5, 9.1, 9.7_

  - [ ] 7.3 Implementar controller de atendentes
    - Criar `src/api/controllers/atendente.controller.ts`
    - GET /api/v1/atendentes: listagem paginada (max 50/pagina), apenas admin
    - POST /api/v1/atendentes: criar com validacao de email unico, senha bcrypt custo 10, associar departamentos (min 1, max 10)
    - PATCH /api/v1/atendentes/:id: atualizar dados, apenas admin
    - PATCH /api/v1/atendentes/:id/status: alterar status (proprio atendente)
    - DELETE /api/v1/atendentes/:id: desativar, revogar tokens, status offline
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.7, 4.8, 12.1, 12.7_

  - [ ] 7.4 Implementar controller de departamentos
    - Criar `src/api/controllers/departamento.controller.ts`
    - GET /api/v1/departamentos: listar todos (admin)
    - POST /api/v1/departamentos: criar com associacao de numeros WhatsApp
    - PATCH /api/v1/departamentos/:id: atualizar, tratar transferencia de atendentes (devolver conversas)
    - _Requirements: 12.4, 12.5, 12.6_

  - [ ] 7.5 Implementar controller de numeros WhatsApp
    - Criar `src/api/controllers/numero-whatsapp.controller.ts`
    - GET /api/v1/numeros-whatsapp: listar (admin)
    - POST /api/v1/numeros-whatsapp: cadastrar com validacao de conectividade (timeout 10s)
    - PATCH /api/v1/numeros-whatsapp/:id: atualizar, tratar desativacao (devolver conversas)
    - POST /api/v1/numeros-whatsapp/:id/validar: re-validar conectividade
    - Limite de 20 numeros por departamento
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.8_

  - [ ]* 7.6 Escrever testes unitarios para controllers de auth e atendentes
    - Testar login com credenciais validas/invalidas
    - Testar bloqueio apos 5 tentativas
    - Testar CRUD de atendentes com validacoes
    - Testar controle de acesso (admin vs atendente)
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 9.1_

- [ ] 8. Checkpoint - Validar API REST base
  - Executar todos os testes unitarios e de integracao
  - Testar fluxo completo: login -> criar atendente -> criar departamento -> cadastrar numero
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. API Service - Conversas e Mensagens
  - [ ] 9.1 Implementar controller de conversas
    - Criar `src/api/controllers/conversa.controller.ts`
    - GET /api/v1/conversas: conversas ativas do atendente logado (filtradas por departamento)
    - GET /api/v1/conversas/fila: fila de espera paginada (max 50/pagina), filtrada por departamentos do atendente
    - POST /api/v1/conversas/:id/assumir: ownership atomico com transacao, rejeitar se pausado
    - POST /api/v1/conversas/:id/finalizar: finalizar conversa, remover ownership
    - Retornar 409 Conflict em caso de race condition no ownership
    - Retornar 403 se conversa fora do departamento do atendente
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.7, 7.1, 7.2, 12.2, 12.3_

  - [ ] 9.2 Implementar controller de mensagens
    - Criar `src/api/controllers/mensagem.controller.ts`
    - GET /api/v1/conversas/:id/mensagens: historico paginado por cursor (max 50/pagina, ordenado por timestamp DESC)
    - POST /api/v1/conversas/:id/mensagens: enviar mensagem (verificar ownership, limite 4096 chars, janela 24h)
    - Retornar lista vazia com indicador `has_more: false` quando nao ha mais paginas
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 5.4, 8.1, 8.5_

  - [ ] 9.3 Implementar busca de historico por cliente
    - Endpoint para buscar conversas anteriores de um cliente (max 20/pagina)
    - Incluir resumo: data, atendente responsavel, quantidade de mensagens
    - Ordenar por data de criacao decrescente
    - _Requirements: 8.3_

  - [ ]* 9.4 Escrever testes unitarios para conversas e mensagens
    - Testar ownership atomico (simulacao de concorrencia)
    - Testar paginacao por cursor
    - Testar rejeicao de mensagem sem ownership
    - Testar rejeicao de mensagem fora da janela 24h
    - Testar filtro por departamento
    - _Requirements: 5.2, 5.3, 5.4, 8.1, 12.2_

- [ ] 10. WebSocket Server - Comunicacao em tempo real
  - [ ] 10.1 Implementar servidor WebSocket com autenticacao
    - Criar `src/api/websocket/ws-server.ts` com servidor ws integrado ao Express
    - Criar `src/api/websocket/ws-auth.ts` com validacao JWT no handshake (< 2s)
    - Rejeitar conexao com codigo 4001 se token invalido/expirado
    - Registrar sessao ativa no Redis
    - _Requirements: 3.1, 3.2_

  - [ ] 10.2 Implementar handlers de eventos WebSocket
    - Criar `src/api/websocket/ws-handlers.ts`
    - Evento `nova_mensagem`: notificar atendente responsavel pela conversa
    - Evento `fila_atualizada`: notificar atendentes online do departamento
    - Evento `conversa_atribuida`: notificar todos sobre remocao da fila
    - Evento `status_mensagem`: atualizar status de entrega
    - Evento `sessao_expirando`: notificar 60s antes da expiracao do JWT
    - Subscrever canais Redis por departamento do atendente
    - _Requirements: 3.3, 3.4, 7.4, 9.4_

  - [ ] 10.3 Implementar buffer de reconexao
    - Criar `src/api/websocket/ws-buffer.ts`
    - Armazenar mensagens em Redis (TTL 30s, max 100 mensagens por atendente)
    - Na reconexao: entregar buffer em ordem cronologica antes de novas mensagens
    - Apos 30s sem reconexao: descartar buffer, atualizar status para offline
    - _Requirements: 3.5, 3.6, 3.7_

  - [ ] 10.4 Implementar heartbeat e deteccao de offline
    - Receber heartbeat do cliente, atualizar Redis (TTL 5min)
    - Detectar atendentes offline (sem heartbeat > 5min)
    - Liberar conversas de atendentes offline (chamar ownership.service)
    - Notificar demais atendentes sobre conversas retornadas a fila
    - _Requirements: 5.6_

  - [ ] 10.5 Implementar filtro de notificacoes por departamento
    - Garantir que notificacoes WebSocket respeitem departamentos do atendente
    - Atendente so recebe eventos de conversas/fila dos seus departamentos
    - _Requirements: 12.2_

  - [ ]* 10.6 Escrever testes unitarios para WebSocket
    - Testar autenticacao no handshake (token valido/invalido/expirado)
    - Testar buffer de reconexao (armazenamento, entrega, descarte)
    - Testar filtro de notificacoes por departamento
    - Testar deteccao de offline e liberacao de conversas
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7, 5.6_

- [ ] 11. Checkpoint - Validar backend completo
  - Executar todos os testes
  - Testar fluxo end-to-end: webhook recebe mensagem -> worker processa -> redis notifica -> websocket entrega
  - Testar fluxo de ownership com concorrencia
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. API Service - Rotas e entrypoint
  - [ ] 12.1 Configurar roteamento Express
    - Criar `src/api/routes/index.ts` com todas as rotas versionadas (/api/v1/*)
    - Aplicar middlewares: auth, validation, rate-limit, department-access
    - Configurar CORS para o frontend
    - Configurar helmet para headers de seguranca
    - _Requirements: 9.1, 9.2_

  - [ ] 12.2 Criar entrypoint do API Service
    - Criar servidor Express + WebSocket integrado
    - Configurar health check endpoint
    - Configurar graceful shutdown (fechar conexoes WS, pool DB, Redis)
    - _Requirements: 3.1_

  - [ ] 12.3 Criar Dockerfile multi-stage
    - Build stage com TypeScript compilation
    - Production stage com Node.js slim
    - Configurar para os 3 servicos (API, Webhook, Worker) com entrypoints diferentes
    - _Requirements: N/A (infraestrutura)_

- [ ] 13. Frontend - Setup e estrutura base
  - [ ] 13.1 Inicializar projeto React + TypeScript + Cloudscape
    - Criar projeto com Vite + React + TypeScript
    - Instalar Cloudscape Design System (@cloudscape-design/components, @cloudscape-design/global-styles)
    - Configurar roteamento (react-router-dom)
    - Configurar cliente HTTP (axios) e WebSocket nativo
    - _Requirements: 10.1, 10.4_

  - [ ] 13.2 Implementar autenticacao no frontend
    - Criar pagina de login com componentes Cloudscape (Form, Input, Button)
    - Implementar contexto de autenticacao (AuthContext) com JWT storage
    - Implementar interceptor axios para injetar token e tratar 401
    - Implementar rota protegida (redirect para login se nao autenticado)
    - _Requirements: 4.4, 9.1, 10.1_

  - [ ] 13.3 Implementar layout principal
    - Criar layout com AppLayout do Cloudscape (navigation, content, tools)
    - Sidebar com: fila de espera, conversas ativas, status do atendente
    - Header com: nome do atendente, seletor de status, botao logout
    - Indicador de contagem da fila de espera
    - _Requirements: 10.2, 10.6_

- [ ] 14. Frontend - Fila de espera e conversas
  - [ ] 14.1 Implementar componente de fila de espera
    - Usar Table do Cloudscape com colunas: numero cliente, tempo de espera, mensagens nao lidas
    - Botao "Assumir" por conversa (desabilitado se status pausado)
    - Paginacao com max 50 itens por pagina
    - Atualizacao em tempo real via WebSocket (evento `fila_atualizada`)
    - Mensagem informativa quando fila vazia (Empty state do Cloudscape)
    - _Requirements: 7.2, 10.2, 10.7, 10.9_

  - [ ] 14.2 Implementar lista de conversas ativas
    - Usar Table/Cards do Cloudscape com conversas do atendente logado
    - Indicador de mensagens nao lidas por conversa
    - Atualizacao em tempo real via WebSocket (evento `nova_mensagem`)
    - Mensagem informativa quando lista vazia
    - _Requirements: 10.2, 10.5, 10.9_

  - [ ] 14.3 Implementar painel de mensagens
    - Exibir historico de mensagens com scroll infinito (paginacao por cursor)
    - Diferenciar visualmente mensagens do cliente vs atendente
    - Exibir timestamp e status de entrega por mensagem
    - Campo de entrada de texto com botao enviar (limite 4096 chars)
    - Suporte a tipos: texto, imagem (preview), documento (link), audio (player)
    - _Requirements: 2.1, 8.1, 10.3_

  - [ ] 14.4 Implementar gerenciamento de WebSocket no frontend
    - Criar hook useWebSocket com conexao autenticada (JWT no handshake)
    - Implementar reconexao automatica (a cada 5s, max 6 tentativas)
    - Exibir indicador de desconexao (Flashbar do Cloudscape)
    - Processar eventos: nova_mensagem, fila_atualizada, conversa_atribuida, status_mensagem, erro
    - _Requirements: 3.1, 10.5, 10.8_

  - [ ]* 14.5 Escrever testes unitarios para componentes frontend
    - Testar renderizacao da fila de espera com dados mockados
    - Testar botao assumir desabilitado quando pausado
    - Testar indicador de desconexao WebSocket
    - _Requirements: 10.2, 10.7, 10.8_

- [ ] 15. Frontend - Administracao
  - [ ] 15.1 Implementar pagina de gestao de atendentes
    - Tabela paginada com Cloudscape Table (nome, email, papel, status, departamentos)
    - Modal de criacao/edicao com Form do Cloudscape
    - Validacao de campos no frontend (email, senha min 8 chars, min 1 departamento)
    - Botao desativar com confirmacao (Modal do Cloudscape)
    - _Requirements: 4.1, 4.2, 4.7, 12.1, 12.7_

  - [ ] 15.2 Implementar pagina de gestao de departamentos
    - CRUD de departamentos com associacao de numeros WhatsApp
    - Visualizacao de atendentes por departamento
    - _Requirements: 12.4_

  - [ ] 15.3 Implementar pagina de gestao de numeros WhatsApp
    - Tabela com numeros cadastrados (telefone, nome exibicao, departamento, status)
    - Formulario de cadastro com validacao de conectividade
    - Indicador visual de status (ativo/inativo)
    - Botao re-validar conectividade
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 16. Checkpoint - Validar frontend completo
  - Testar fluxo completo no browser: login -> visualizar fila -> assumir conversa -> enviar mensagem
  - Testar reconexao WebSocket
  - Testar paginas administrativas
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Integracao e fluxos end-to-end
  - [ ] 17.1 Integrar callback de status de mensagem
    - Processar callbacks de status da WhatsApp Cloud API no Worker
    - Atualizar status de entrega da mensagem no banco (enviada -> entregue -> lida)
    - Notificar atendente via WebSocket (evento `status_mensagem`)
    - _Requirements: 8.4_

  - [ ] 17.2 Implementar transferencia de departamento
    - Ao remover atendente de departamento: devolver conversas ativas para fila
    - Ao desativar numero WhatsApp com conversas ativas: devolver para fila
    - Notificar atendentes afetados via WebSocket
    - _Requirements: 11.8, 12.5_

  - [ ] 17.3 Implementar retencao e limpeza de mensagens
    - Criar job/script para limpeza de mensagens com mais de 90 dias
    - Garantir que conversas e metadados sejam preservados
    - _Requirements: 8.2_

  - [ ]* 17.4 Escrever testes de integracao end-to-end
    - Testar fluxo completo: webhook -> SQS -> worker -> Redis -> WebSocket
    - Testar ownership com multiplos atendentes simultaneos
    - Testar reconexao e entrega de buffer
    - Testar controle de acesso por departamento
    - _Requirements: 1.1, 3.3, 5.2, 5.3, 12.2_

- [ ] 18. Final checkpoint - Validacao completa
  - Executar todos os testes (unitarios, integracao, e2e)
  - Verificar que todas as requirements estao cobertas
  - Validar seguranca: sanitizacao de inputs, tokens em variaveis de ambiente, audit log
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marcadas com `*` sao opcionais e podem ser puladas para um MVP mais rapido
- Cada task referencia requirements especificos para rastreabilidade
- Checkpoints garantem validacao incremental
- O docker-compose.yml permite desenvolvimento local completo sem dependencias AWS reais
- A ordem das tasks garante que cada etapa constroi sobre a anterior sem codigo orfao
