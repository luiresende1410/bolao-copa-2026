# Requirements Document

## Introduction

Este documento especifica os requisitos para um Painel Multiatendente integrado a WhatsApp Cloud API da Meta. O sistema permite que multiplos atendentes gerenciem conversas de clientes via WhatsApp em tempo real, com logica de ownership que garante que apenas um atendente atenda cada conversa simultaneamente. O backend e construido em Node.js, utilizando Webhooks para receber mensagens do WhatsApp e WebSockets para atualizar os atendentes em tempo real.

## Glossary

- **Sistema**: O Painel Multiatendente como um todo (backend + frontend)
- **Backend**: Servidor Node.js responsavel pelo processamento de Webhooks, WebSockets e logica de negocio
- **Webhook_Handler**: Modulo do Backend responsavel por receber e processar notificacoes da WhatsApp Cloud API
- **WebSocket_Server**: Modulo do Backend responsavel por manter conexoes em tempo real com os atendentes
- **Banco_de_Dados**: Banco de dados relacional que armazena atendentes, conversas e mensagens
- **Atendente**: Usuario do sistema que atende clientes via WhatsApp
- **Conversa**: Sessao de comunicacao entre um cliente WhatsApp e o sistema
- **Ownership**: Relacao exclusiva entre um Atendente e uma Conversa ativa, garantindo que apenas um atendente atenda cada conversa
- **Fila_de_Espera**: Conjunto de conversas que ainda nao possuem um Atendente atribuido
- **Cliente**: Pessoa que envia mensagens via WhatsApp e e atendida pelo sistema
- **WhatsApp_Cloud_API**: API oficial da Meta para envio e recebimento de mensagens WhatsApp
- **Frontend**: Aplicacao web que fornece a interface do painel de atendimento aos Atendentes
- **Cloudscape_Design_System**: Sistema de design open-source da AWS usado para construir a interface do Frontend
- **Numero_WhatsApp**: Numero de telefone registrado na WhatsApp_Cloud_API, representando um canal de atendimento
- **Departamento**: Agrupamento logico de Atendentes que compartilham acesso a um ou mais Numeros_WhatsApp (ex: Comercial, Suporte, Financeiro)

## Requirements

### Requirement 1: Recebimento de Mensagens via Webhook

**User Story:** Como operador do sistema, eu quero que o Backend receba mensagens do WhatsApp via Webhook, para que as conversas dos clientes sejam processadas em tempo real.

#### Acceptance Criteria

1. WHEN a WhatsApp_Cloud_API envia uma notificacao de mensagem, THE Webhook_Handler SHALL validar a assinatura do payload usando o App Secret configurado e responder com codigo HTTP 200 em ate 5 segundos
2. WHEN uma notificacao com assinatura valida e recebida, THE Webhook_Handler SHALL extrair o identificador do remetente, o conteudo, o tipo (texto, imagem, documento, audio) e o timestamp da mensagem, e persistir no Banco_de_Dados
3. IF uma notificacao com assinatura invalida e recebida, THEN THE Webhook_Handler SHALL rejeitar a requisicao com codigo HTTP 401 e registrar o evento em log
4. WHEN a WhatsApp_Cloud_API envia uma requisicao de verificacao (GET com hub.verify_token) e o token corresponde ao configurado, THE Webhook_Handler SHALL responder com o valor de hub.challenge e codigo HTTP 200
5. IF a WhatsApp_Cloud_API envia uma requisicao de verificacao com token que nao corresponde ao configurado, THEN THE Webhook_Handler SHALL responder com codigo HTTP 403
6. IF o Webhook_Handler receber um payload que nao contenha a estrutura esperada de mensagem (campos obrigatorios ausentes ou tipo de conteudo nao reconhecido), THEN THE Webhook_Handler SHALL registrar o erro em log e responder com codigo HTTP 200 para evitar reenvios
7. IF o Webhook_Handler receber uma notificacao com message_id ja existente no Banco_de_Dados, THEN THE Webhook_Handler SHALL ignorar a mensagem duplicada e responder com codigo HTTP 200

### Requirement 2: Envio de Mensagens via WhatsApp Cloud API

**User Story:** Como atendente, eu quero enviar mensagens para clientes via WhatsApp, para que eu possa responder as solicitacoes dos clientes.

#### Acceptance Criteria

1. WHEN um Atendente envia uma mensagem de texto atraves do painel com ate 4096 caracteres, THE Backend SHALL encaminhar a mensagem para a WhatsApp_Cloud_API usando o endpoint de envio de mensagens dentro de no maximo 30 segundos
2. WHEN a WhatsApp_Cloud_API confirma o envio com sucesso, THE Backend SHALL persistir a mensagem no Banco_de_Dados com status "enviada" em ate 2 segundos apos a confirmacao
3. IF a WhatsApp_Cloud_API retornar erro no envio ou nao responder dentro de 30 segundos, THEN THE Backend SHALL persistir a mensagem com status "falha", registrar o erro em log e notificar o Atendente via WebSocket com indicacao do motivo da falha
4. WHILE uma Conversa estiver fora da janela de 24 horas da WhatsApp_Cloud_API, THE Backend SHALL permitir apenas o envio de mensagens de template pre-aprovadas
5. IF um Atendente tentar enviar uma mensagem que nao seja template enquanto a Conversa estiver fora da janela de 24 horas, THEN THE Backend SHALL rejeitar o envio e notificar o Atendente via WebSocket com mensagem indicando que apenas templates sao permitidos fora da janela de 24 horas
6. IF um Atendente tentar enviar uma mensagem com mais de 4096 caracteres, THEN THE Backend SHALL rejeitar o envio e notificar o Atendente via WebSocket com mensagem indicando que o limite de caracteres foi excedido

### Requirement 3: Comunicacao em Tempo Real via WebSocket

**User Story:** Como atendente, eu quero receber atualizacoes em tempo real sobre novas mensagens e eventos, para que eu possa atender clientes sem atrasos.

#### Acceptance Criteria

1. WHEN um Atendente se conecta ao WebSocket_Server, THE WebSocket_Server SHALL autenticar a conexao validando a assinatura, expiracao e issuer do token JWT em ate 2 segundos
2. IF um Atendente tentar conectar com token invalido ou expirado, THEN THE WebSocket_Server SHALL rejeitar a conexao com codigo de erro 4001 e encerrar o handshake sem estabelecer a sessao
3. WHEN uma nova mensagem de Cliente e recebida pelo Webhook_Handler, THE WebSocket_Server SHALL notificar o Atendente responsavel pela Conversa em ate 500ms, incluindo o identificador da Conversa, identificador da mensagem, tipo da mensagem e timestamp
4. WHEN uma nova Conversa entra na Fila_de_Espera, THE WebSocket_Server SHALL notificar em ate 500ms todos os Atendentes com status "online" pertencentes ao Departamento associado ao Numero_WhatsApp da Conversa
5. IF a conexao WebSocket de um Atendente for interrompida, THEN THE WebSocket_Server SHALL manter as mensagens em buffer por ate 30 segundos e entrega-las na reconexao, limitando o buffer a no maximo 100 mensagens por Atendente
6. IF um Atendente nao reconectar dentro de 30 segundos apos interrupcao da conexao, THEN THE WebSocket_Server SHALL descartar o buffer de mensagens pendentes e atualizar o status do Atendente para "offline"
7. WHEN um Atendente reconecta ao WebSocket_Server dentro do periodo de buffer, THE WebSocket_Server SHALL entregar todas as mensagens acumuladas em ordem cronologica antes de enviar novas notificacoes em tempo real

### Requirement 4: Gestao de Atendentes

**User Story:** Como administrador do sistema, eu quero gerenciar os atendentes cadastrados, para que eu possa controlar quem tem acesso ao painel de atendimento.

#### Acceptance Criteria

1. THE Backend SHALL armazenar para cada Atendente: identificador unico, nome (1 a 100 caracteres), e-mail (maximo 254 caracteres, formato valido conforme RFC 5322), senha (hash), papel (admin ou atendente) e status (online, offline, pausado)
2. WHEN um administrador cria um novo Atendente com dados validos, THE Backend SHALL validar unicidade do e-mail, exigir senha com minimo de 8 caracteres, e armazenar a senha com hash bcrypt de custo minimo 10
3. IF um administrador tentar criar um Atendente com e-mail ja cadastrado, THEN THE Backend SHALL rejeitar a operacao com erro indicando que o e-mail ja esta em uso, sem criar o registro
4. WHEN um Atendente realiza login com credenciais validas, THE Backend SHALL gerar um token JWT com expiracao de 8 horas
5. IF um Atendente tentar login com credenciais invalidas, THEN THE Backend SHALL retornar erro generico indicando credenciais invalidas sem revelar qual campo esta incorreto, e bloquear novas tentativas de login para o mesmo e-mail por 15 minutos apos 5 tentativas consecutivas falhas
6. WHEN um Atendente altera seu status para "pausado", THE Backend SHALL impedir a atribuicao de novas conversas a esse Atendente
7. WHEN um administrador solicita a lista de Atendentes, THE Backend SHALL retornar todos os Atendentes cadastrados com nome, e-mail, papel, status e Departamentos associados, paginados com no maximo 50 registros por pagina
8. WHEN um administrador desativa um Atendente, THE Backend SHALL alterar o status do Atendente para "offline", revogar tokens JWT ativos desse Atendente e impedir novos logins ate reativacao por um administrador

### Requirement 5: Gestao de Conversas e Ownership

**User Story:** Como atendente, eu quero assumir conversas da fila de espera com garantia de exclusividade, para que dois atendentes nao atendam o mesmo cliente simultaneamente.

#### Acceptance Criteria

1. THE Banco_de_Dados SHALL manter para cada Conversa: identificador unico, numero do Cliente, identificador do Atendente responsavel (nullable), status (aguardando, em_atendimento, finalizada) e timestamps de criacao e atualizacao
2. WHEN um Atendente solicita assumir uma Conversa da Fila_de_Espera, THE Backend SHALL utilizar uma operacao atomica (lock otimista ou transacao) para atribuir o Ownership ao Atendente, alterar o status da Conversa de "aguardando" para "em_atendimento" e registrar o timestamp de atualizacao
3. IF dois Atendentes tentarem assumir a mesma Conversa simultaneamente, THEN THE Backend SHALL atribuir a Conversa ao primeiro Atendente que completar a operacao atomica e retornar erro de conflito (HTTP 409) ao segundo
4. WHILE uma Conversa estiver com status "em_atendimento", IF um Atendente sem Ownership tentar enviar mensagem nessa Conversa, THEN THE Backend SHALL rejeitar a requisicao com erro de permissao (HTTP 403)
5. WHEN um Atendente finaliza uma Conversa, THE Backend SHALL alterar o status para "finalizada", remover o Ownership e registrar o timestamp de encerramento
6. IF um Atendente ficar offline por mais de 5 minutos com Conversas ativas, THEN THE Backend SHALL alterar o status dessas Conversas para "aguardando", remover o Ownership e notificar os demais Atendentes online via WebSocket sobre o retorno das Conversas a Fila_de_Espera
7. IF um Atendente com status "pausado" tentar assumir uma Conversa da Fila_de_Espera, THEN THE Backend SHALL rejeitar a solicitacao com erro indicando que o Atendente deve alterar seu status antes de assumir novas conversas

### Requirement 6: Modelo de Dados Relacional

**User Story:** Como desenvolvedor, eu quero um modelo de dados bem estruturado, para que as relacoes entre atendentes, conversas e mensagens sejam consistentes e performaticas.

#### Acceptance Criteria

1. THE Banco_de_Dados SHALL manter integridade referencial entre as tabelas de Atendentes, Conversas e Mensagens usando chaves estrangeiras, com politica ON DELETE RESTRICT para Atendentes e Clientes referenciados por Conversas, e ON DELETE CASCADE para Mensagens ao excluir uma Conversa
2. THE Banco_de_Dados SHALL indexar a coluna de status das Conversas para otimizar consultas de Fila_de_Espera
3. THE Banco_de_Dados SHALL armazenar para cada Mensagem: identificador unico, identificador da Conversa, remetente (atendente ou cliente), conteudo (texto com limite maximo de 65536 caracteres), tipo (texto, imagem, documento, audio), timestamp e status de entrega (enviada, entregue, lida, falha)
4. THE Banco_de_Dados SHALL utilizar uma constraint UNIQUE condicional (partial unique index) na relacao Conversa-Atendente, aplicavel apenas a Conversas com status "em_atendimento", para garantir Ownership exclusivo a nivel de banco de dados
5. WHEN uma Conversa e criada a partir de um numero de Cliente ja existente com Conversa finalizada, THE Backend SHALL criar uma nova Conversa vinculada ao mesmo registro de Cliente, mantendo o historico de Conversas anteriores acessivel atraves do identificador do Cliente
6. IF uma operacao de exclusao violar a integridade referencial (RESTRICT), THEN THE Banco_de_Dados SHALL rejeitar a operacao e preservar todos os registros dependentes

### Requirement 7: Fila de Espera e Distribuicao

**User Story:** Como atendente, eu quero visualizar as conversas aguardando atendimento ordenadas por tempo de espera, para que eu possa priorizar clientes que esperam ha mais tempo.

#### Acceptance Criteria

1. THE Backend SHALL ordenar a Fila_de_Espera por timestamp de criacao da Conversa em ordem crescente (mais antiga primeiro)
2. WHEN um Atendente solicita a lista da Fila_de_Espera, THE Backend SHALL retornar no maximo 50 Conversas por pagina, incluindo para cada Conversa: identificador, numero do Cliente, timestamp de criacao, tempo de espera em segundos e quantidade de mensagens nao lidas, filtrando apenas Conversas com status "aguardando" que nao possuem Ownership atribuido
3. WHEN uma nova mensagem de um Cliente sem Conversa com status "aguardando" ou "em_atendimento" e recebida, THE Backend SHALL criar uma nova Conversa com status "aguardando" e adiciona-la a Fila_de_Espera
4. WHEN uma Conversa entrar ou sair da Fila_de_Espera, THE WebSocket_Server SHALL enviar a contagem atualizada da Fila_de_Espera para todos os Atendentes online em ate 500ms
5. WHEN um Cliente envia uma nova mensagem em uma Conversa com status "aguardando", THE Backend SHALL manter a posicao original da Conversa na Fila_de_Espera (baseada no timestamp de criacao) e incrementar a contagem de mensagens nao lidas

### Requirement 8: Historico e Persistencia de Mensagens

**User Story:** Como atendente, eu quero acessar o historico completo de mensagens de uma conversa, para que eu tenha contexto ao atender um cliente recorrente.

#### Acceptance Criteria

1. WHEN um Atendente abre uma Conversa, THE Backend SHALL retornar as mensagens paginadas com no maximo 50 mensagens por pagina, ordenadas por timestamp decrescente, utilizando paginacao baseada em cursor (timestamp da ultima mensagem retornada) para navegacao entre paginas
2. THE Banco_de_Dados SHALL reter todas as mensagens por no minimo 90 dias, apos os quais as mensagens podem ser removidas por processos de limpeza automatica
3. WHEN um Atendente busca o historico de um Cliente, THE Backend SHALL retornar as Conversas anteriores desse Cliente paginadas com no maximo 20 conversas por pagina, ordenadas por data de criacao decrescente, incluindo resumo com data, atendente responsavel e quantidade de mensagens
4. WHEN a WhatsApp_Cloud_API envia um callback de status de mensagem, THE Backend SHALL atualizar o metadado de entrega da mensagem correspondente para o status recebido (enviada, entregue ou lida)
5. IF um Atendente solicitar uma pagina de mensagens alem do historico disponivel, THEN THE Backend SHALL retornar uma lista vazia de mensagens com indicador de que nao ha mais paginas

### Requirement 9: Seguranca e Autenticacao

**User Story:** Como administrador, eu quero que o sistema seja seguro contra acessos nao autorizados, para que dados de clientes e conversas estejam protegidos.

#### Acceptance Criteria

1. WHEN uma requisicao sem token JWT valido e recebida em uma rota protegida, THE Backend SHALL rejeitar a requisicao com status de nao autorizado e retornar uma mensagem de erro indicando falha de autenticacao, sem revelar detalhes internos do sistema
2. THE Backend SHALL validar e sanitizar todos os inputs recebidos via API para prevenir injecao de SQL e XSS
3. IF um input recebido via API contem conteudo identificado como malicioso ou invalido, THEN THE Backend SHALL rejeitar a requisicao com status de requisicao invalida e retornar uma mensagem de erro indicando qual campo falhou na validacao
4. WHEN um token JWT expira durante uma sessao WebSocket ativa, THE WebSocket_Server SHALL notificar o Atendente e encerrar a conexao apos 60 segundos sem renovacao
5. THE Backend SHALL registrar em log de auditoria todas as acoes de atribuicao e transferencia de Ownership de Conversas, incluindo no minimo: timestamp, identificador do usuario que executou a acao, tipo de acao, e identificador da Conversa afetada
6. THE Backend SHALL armazenar o WhatsApp Access Token e App Secret em variaveis de ambiente, sem expo-los em logs ou respostas de API
7. THE Backend SHALL emitir tokens JWT com tempo de expiracao maximo de 8 horas, exigindo re-autenticacao apos esse periodo

### Requirement 10: Interface do Frontend com Cloudscape Design System

**User Story:** Como atendente, eu quero uma interface web moderna e consistente, para que eu possa atender clientes de forma eficiente e intuitiva.

#### Acceptance Criteria

1. THE Frontend SHALL ser construido utilizando o Cloudscape_Design_System como biblioteca de componentes de interface
2. THE Frontend SHALL exibir a Fila_de_Espera, as Conversas ativas do Atendente e o painel de mensagens em um layout responsivo que suporte viewports a partir de 1024px de largura
3. WHEN um Atendente seleciona uma Conversa, THE Frontend SHALL exibir o historico de mensagens paginado e um campo de entrada para novas mensagens
4. THE Frontend SHALL utilizar componentes nativos do Cloudscape_Design_System para tabelas, formularios, notificacoes e navegacao
5. WHEN o WebSocket_Server envia uma notificacao de nova mensagem, THE Frontend SHALL atualizar a interface sem necessidade de recarregar a pagina e exibir um indicador de mensagem nao lida na Conversa correspondente caso ela nao esteja selecionada
6. THE Frontend SHALL exibir indicadores visuais de status do Atendente (online, offline, pausado) e contagem de conversas na Fila_de_Espera
7. WHILE o Atendente estiver com status "pausado", THE Frontend SHALL desabilitar o botao de assumir novas conversas da Fila_de_Espera
8. IF a conexao WebSocket for perdida, THEN THE Frontend SHALL exibir um indicador visivel de desconexao e tentar reconexao automatica a cada 5 segundos por no maximo 6 tentativas
9. WHEN a Fila_de_Espera ou a lista de Conversas ativas estiver vazia, THE Frontend SHALL exibir uma mensagem informativa indicando a ausencia de itens

### Requirement 11: Gestao de Multiplos Numeros WhatsApp

**User Story:** Como administrador, eu quero cadastrar multiplos numeros de WhatsApp no sistema, para que diferentes departamentos possam operar com numeros dedicados.

#### Acceptance Criteria

1. THE Backend SHALL permitir o cadastro de multiplos Numeros_WhatsApp, cada um com seu proprio Phone Number ID, Access Token e configuracao de webhook, limitado a no maximo 20 Numeros_WhatsApp por Departamento
2. WHEN um administrador cadastra um novo Numero_WhatsApp, THE Backend SHALL validar a conectividade com a WhatsApp_Cloud_API enviando uma requisicao de verificacao com timeout de 10 segundos, e somente ativar o numero se a API responder com sucesso
3. IF a validacao de conectividade com a WhatsApp_Cloud_API falhar ou exceder o timeout de 10 segundos, THEN THE Backend SHALL manter o Numero_WhatsApp com status "inativo", notificar o administrador com mensagem de erro indicando o motivo da falha e permitir nova tentativa de validacao
4. THE Banco_de_Dados SHALL armazenar para cada Numero_WhatsApp: identificador unico, numero de telefone (formato E.164, maximo 15 digitos), Phone Number ID, nome de exibicao (maximo 100 caracteres), Departamento associado, status (ativo, inativo) e timestamps de criacao e atualizacao
5. THE Banco_de_Dados SHALL garantir unicidade do numero de telefone e do Phone Number ID, impedindo o cadastro duplicado de um mesmo Numero_WhatsApp
6. WHEN uma mensagem e recebida via Webhook, THE Webhook_Handler SHALL identificar o Numero_WhatsApp destinatario pelo Phone Number ID e rotear a Conversa para o Departamento correto
7. IF uma mensagem e recebida via Webhook para um Numero_WhatsApp com status "inativo" ou nao cadastrado no sistema, THEN THE Webhook_Handler SHALL registrar o evento em log, descartar a mensagem e responder com codigo HTTP 200
8. WHEN um administrador desativa um Numero_WhatsApp que possui Conversas com status "em_atendimento", THE Backend SHALL devolver essas Conversas para a Fila_de_Espera antes de alterar o status do numero para "inativo", preservando o historico de conversas associado

### Requirement 12: Controle de Acesso por Departamento

**User Story:** Como administrador, eu quero restringir o acesso dos atendentes apenas aos numeros do seu departamento, para que cada equipe opere exclusivamente nos canais designados.

#### Acceptance Criteria

1. THE Backend SHALL associar cada Atendente a no minimo 1 e no maximo 10 Departamentos no momento do cadastro
2. WHILE um Atendente estiver logado, THE Backend SHALL retornar apenas Conversas e Fila_de_Espera dos Numeros_WhatsApp vinculados aos Departamentos do Atendente, tanto em consultas REST quanto em notificacoes via WebSocket_Server
3. IF um Atendente tentar acessar uma Conversa de um Numero_WhatsApp fora do seu Departamento, THEN THE Backend SHALL retornar erro de permissao (HTTP 403)
4. WHEN um administrador cria um novo Departamento, THE Backend SHALL permitir associar um ou mais Numeros_WhatsApp a esse Departamento, sendo que cada Numero_WhatsApp pode estar associado a apenas um Departamento
5. WHEN um administrador transfere um Atendente de um Departamento, THE Backend SHALL devolver para a Fila_de_Espera todas as Conversas ativas desse Atendente que pertencem ao Departamento removido e preservar o historico de atendimentos anteriores
6. WHEN uma Conversa e criada a partir de um Numero_WhatsApp, THE Backend SHALL vincular automaticamente a Conversa ao Departamento associado a esse numero
7. IF um administrador tentar cadastrar ou atualizar um Atendente sem associa-lo a pelo menos 1 Departamento, THEN THE Backend SHALL rejeitar a operacao com erro de validacao indicando que ao menos um Departamento e obrigatorio
