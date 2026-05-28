# API Reference - WhatsApp Multi-Agent Panel

## Visao Geral

Esta documentacao descreve a API completa do Painel Multiatendente WhatsApp. A API e composta por:
- **REST API** (HTTPS) - Operacoes CRUD e acoes de negocio
- **WebSocket** (WSS) - Comunicacao em tempo real
- **Webhook** (HTTPS) - Recebimento de mensagens do WhatsApp

**Base URL:** `https://{domain}/api/v1`
**WebSocket URL:** `wss://{domain}/ws`
**Webhook URL:** `https://{domain}/webhook`

---

## Autenticacao

### Mecanismo

O sistema utiliza JSON Web Tokens (JWT) para autenticacao de todas as rotas protegidas.

**Caracteristicas do Token:**
- Algoritmo: HS256
- Expiracao: 8 horas
- Issuer: `whatsapp-panel`
- Payload: `{ sub: atendente_id, email, papel, departamentos[], iat, exp }`

**Uso em requisicoes REST:**
```
Authorization: Bearer <token>
```

**Uso em conexoes WebSocket:**
```
wss://{domain}/ws?token=<token>
```

### Fluxo de Autenticacao

1. Atendente envia credenciais via `POST /api/v1/auth/login`
2. Backend valida credenciais e verifica bloqueio
3. Se valido, retorna token JWT
4. Token e incluido em todas as requisicoes subsequentes
5. Apos 8 horas, token expira e atendente deve re-autenticar

### Bloqueio de Conta

- Apos 5 tentativas consecutivas de login falhas, a conta e bloqueada por 15 minutos
- O bloqueio e por email, independente do IP de origem
- Durante o bloqueio, todas as tentativas retornam erro generico

---

## Endpoints REST

### Auth

#### POST /api/v1/auth/login

Autentica um atendente e retorna token JWT.

**Autenticacao:** Nenhuma (rota publica)

**Request Body:**
```json
{
  "email": "atendente@empresa.com",
  "senha": "minhasenha123"
}
```

**Validacoes:**
- `email`: obrigatorio, formato RFC 5322, max 254 caracteres
- `senha`: obrigatorio, min 8 caracteres

**Response 200 - Sucesso:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "atendente": {
    "id": "uuid",
    "nome": "Maria Silva",
    "email": "atendente@empresa.com",
    "papel": "atendente",
    "status": "online",
    "departamentos": [
      { "id": "uuid", "nome": "Comercial" }
    ]
  }
}
```

**Response 401 - Credenciais invalidas:**
```json
{
  "error": {
    "code": "AUTHENTICATION_FAILED",
    "message": "Credenciais invalidas.",
    "request_id": "req_abc123"
  }
}
```

**Response 429 - Conta bloqueada:**
```json
{
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Conta bloqueada. Tente novamente em 15 minutos.",
    "request_id": "req_abc123"
  }
}
```

---

#### POST /api/v1/auth/logout

Encerra a sessao do atendente e revoga o token.

**Autenticacao:** Bearer Token (admin, atendente)

**Request Body:** Nenhum

**Response 200 - Sucesso:**
```json
{
  "message": "Logout realizado com sucesso."
}
```

---

### Atendentes

#### GET /api/v1/atendentes

Lista todos os atendentes cadastrados (paginado).

**Autenticacao:** Bearer Token (admin)

**Query Parameters:**
| Parametro | Tipo | Obrigatorio | Descricao |
|-----------|------|-------------|-----------|
| page | integer | Nao | Pagina (default: 1) |
| limit | integer | Nao | Registros por pagina (default: 50, max: 50) |
| status | string | Nao | Filtrar por status: online, offline, pausado |

**Response 200 - Sucesso:**
```json
{
  "data": [
    {
      "id": "uuid",
      "nome": "Maria Silva",
      "email": "maria@empresa.com",
      "papel": "atendente",
      "status": "online",
      "ativo": true,
      "departamentos": [
        { "id": "uuid", "nome": "Comercial" }
      ],
      "ultimo_login": "2024-01-15T10:30:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 120,
    "total_pages": 3
  }
}
```

**Response 403 - Sem permissao:**
```json
{
  "error": {
    "code": "DEPARTMENT_ACCESS_DENIED",
    "message": "Apenas administradores podem listar atendentes.",
    "request_id": "req_abc123"
  }
}
```

---

#### POST /api/v1/atendentes

Cria um novo atendente.

**Autenticacao:** Bearer Token (admin)

**Request Body:**
```json
{
  "nome": "Joao Santos",
  "email": "joao@empresa.com",
  "senha": "senhasegura123",
  "papel": "atendente",
  "departamento_ids": ["uuid-dept-1", "uuid-dept-2"]
}
```

**Validacoes:**
- `nome`: obrigatorio, 1-100 caracteres
- `email`: obrigatorio, formato RFC 5322, max 254 caracteres, unico
- `senha`: obrigatorio, min 8 caracteres
- `papel`: obrigatorio, enum: "admin" | "atendente"
- `departamento_ids`: obrigatorio, array com 1-10 UUIDs validos

**Response 201 - Criado:**
```json
{
  "id": "uuid",
  "nome": "Joao Santos",
  "email": "joao@empresa.com",
  "papel": "atendente",
  "status": "offline",
  "ativo": true,
  "departamentos": [
    { "id": "uuid-dept-1", "nome": "Comercial" },
    { "id": "uuid-dept-2", "nome": "Suporte" }
  ],
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Response 400 - Validacao:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados invalidos na requisicao.",
    "details": [
      { "field": "email", "constraint": "Formato de email invalido" },
      { "field": "departamento_ids", "constraint": "Ao menos um departamento e obrigatorio" }
    ],
    "request_id": "req_abc123"
  }
}
```

**Response 409 - Email duplicado:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "E-mail ja esta em uso.",
    "request_id": "req_abc123"
  }
}
```

---

#### PATCH /api/v1/atendentes/:id

Atualiza dados de um atendente.

**Autenticacao:** Bearer Token (admin)

**Path Parameters:**
- `id`: UUID do atendente

**Request Body (parcial):**
```json
{
  "nome": "Joao Santos Jr",
  "papel": "admin",
  "departamento_ids": ["uuid-dept-1", "uuid-dept-3"]
}
```

**Validacoes:**
- `nome`: opcional, 1-100 caracteres
- `papel`: opcional, enum: "admin" | "atendente"
- `departamento_ids`: opcional, array com 1-10 UUIDs validos

**Response 200 - Atualizado:**
```json
{
  "id": "uuid",
  "nome": "Joao Santos Jr",
  "email": "joao@empresa.com",
  "papel": "admin",
  "status": "online",
  "ativo": true,
  "departamentos": [
    { "id": "uuid-dept-1", "nome": "Comercial" },
    { "id": "uuid-dept-3", "nome": "Financeiro" }
  ],
  "updated_at": "2024-01-15T11:00:00Z"
}
```

**Nota:** Se `departamento_ids` for alterado e o atendente possuir conversas ativas em departamentos removidos, essas conversas serao devolvidas a fila de espera automaticamente.

---

#### PATCH /api/v1/atendentes/:id/status

Altera o status do atendente (proprio atendente ou admin).

**Autenticacao:** Bearer Token (admin, atendente - apenas proprio)

**Path Parameters:**
- `id`: UUID do atendente

**Request Body:**
```json
{
  "status": "pausado"
}
```

**Validacoes:**
- `status`: obrigatorio, enum: "online" | "pausado"

**Response 200 - Atualizado:**
```json
{
  "id": "uuid",
  "status": "pausado",
  "updated_at": "2024-01-15T11:00:00Z"
}
```

**Nota:** Ao alterar para "pausado", o atendente nao podera assumir novas conversas. Conversas ja em atendimento permanecem com o atendente.

---

#### DELETE /api/v1/atendentes/:id

Desativa um atendente (soft delete).

**Autenticacao:** Bearer Token (admin)

**Path Parameters:**
- `id`: UUID do atendente

**Response 200 - Desativado:**
```json
{
  "id": "uuid",
  "ativo": false,
  "status": "offline",
  "message": "Atendente desativado. Tokens revogados."
}
```

**Efeitos colaterais:**
- Status alterado para "offline"
- Todos os tokens JWT ativos sao revogados
- Conversas ativas sao devolvidas a fila de espera
- Novos logins sao impedidos ate reativacao

---

### Conversas

#### GET /api/v1/conversas

Lista conversas ativas do atendente logado.

**Autenticacao:** Bearer Token (admin, atendente)

**Query Parameters:**
| Parametro | Tipo | Obrigatorio | Descricao |
|-----------|------|-------------|-----------|
| page | integer | Nao | Pagina (default: 1) |
| limit | integer | Nao | Registros por pagina (default: 50, max: 50) |
| status | string | Nao | Filtrar: em_atendimento, finalizada |

**Response 200 - Sucesso:**
```json
{
  "data": [
    {
      "id": "uuid",
      "numero_cliente": "+5511999998888",
      "atendente_id": "uuid",
      "numero_whatsapp_id": "uuid",
      "departamento": { "id": "uuid", "nome": "Comercial" },
      "status": "em_atendimento",
      "mensagens_nao_lidas": 3,
      "ultima_mensagem_at": "2024-01-15T10:30:00Z",
      "created_at": "2024-01-15T09:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 5,
    "total_pages": 1
  }
}
```

**Nota:** Retorna apenas conversas dos departamentos do atendente logado.

---

#### GET /api/v1/conversas/fila

Lista a fila de espera (conversas aguardando atendimento).

**Autenticacao:** Bearer Token (admin, atendente)

**Query Parameters:**
| Parametro | Tipo | Obrigatorio | Descricao |
|-----------|------|-------------|-----------|
| page | integer | Nao | Pagina (default: 1) |
| limit | integer | Nao | Registros por pagina (default: 50, max: 50) |
| departamento_id | uuid | Nao | Filtrar por departamento especifico |

**Response 200 - Sucesso:**
```json
{
  "data": [
    {
      "id": "uuid",
      "numero_cliente": "+5511999997777",
      "numero_whatsapp": {
        "id": "uuid",
        "telefone": "+5511988887777",
        "nome_exibicao": "Comercial Principal"
      },
      "departamento": { "id": "uuid", "nome": "Comercial" },
      "mensagens_nao_lidas": 2,
      "tempo_espera_segundos": 345,
      "created_at": "2024-01-15T09:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 12,
    "total_pages": 1
  }
}
```

**Nota:** Ordenado por `created_at ASC` (mais antiga primeiro). Filtrado automaticamente pelos departamentos do atendente logado.

---

#### POST /api/v1/conversas/:id/assumir

Assume ownership de uma conversa da fila de espera.

**Autenticacao:** Bearer Token (atendente)

**Path Parameters:**
- `id`: UUID da conversa

**Request Body:** Nenhum

**Response 200 - Ownership atribuido:**
```json
{
  "id": "uuid",
  "numero_cliente": "+5511999997777",
  "atendente_id": "uuid-atendente",
  "status": "em_atendimento",
  "updated_at": "2024-01-15T10:35:00Z"
}
```

**Response 409 - Conflito de ownership:**
```json
{
  "error": {
    "code": "OWNERSHIP_CONFLICT",
    "message": "Esta conversa ja foi assumida por outro atendente.",
    "request_id": "req_abc123"
  }
}
```

**Response 403 - Atendente pausado:**
```json
{
  "error": {
    "code": "AGENT_PAUSED",
    "message": "Atendente pausado nao pode assumir conversas. Altere seu status primeiro.",
    "request_id": "req_abc123"
  }
}
```

**Response 403 - Departamento incorreto:**
```json
{
  "error": {
    "code": "DEPARTMENT_ACCESS_DENIED",
    "message": "Voce nao tem acesso a conversas deste departamento.",
    "request_id": "req_abc123"
  }
}
```

**Operacao atomica:** Utiliza `SELECT FOR UPDATE` + transacao PostgreSQL para garantir que apenas um atendente assuma a conversa.

---

#### POST /api/v1/conversas/:id/finalizar

Finaliza uma conversa ativa.

**Autenticacao:** Bearer Token (atendente - owner da conversa)

**Path Parameters:**
- `id`: UUID da conversa

**Request Body:** Nenhum

**Response 200 - Finalizada:**
```json
{
  "id": "uuid",
  "status": "finalizada",
  "atendente_id": null,
  "updated_at": "2024-01-15T11:00:00Z"
}
```

**Response 403 - Sem ownership:**
```json
{
  "error": {
    "code": "DEPARTMENT_ACCESS_DENIED",
    "message": "Voce nao possui ownership desta conversa.",
    "request_id": "req_abc123"
  }
}
```

---
