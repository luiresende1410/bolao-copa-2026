# Requirements Document

## Introduction

Este documento especifica os requisitos para o modulo "Bolao Copa 2026", um sistema de palpites para a Copa do Mundo FIFA 2026 integrado ao Painel Multiatendente WhatsApp. O Bolao permite que participantes registrem palpites de placares para jogos da Copa, acumulem pontos com base na precisao dos palpites e acompanhem um ranking em tempo real. A administracao do Bolao e feita pelo painel web existente, enquanto participantes podem interagir via mensagens WhatsApp ou diretamente pelo painel.

## Glossary

- **Sistema_Bolao**: Modulo do Backend responsavel pela logica de negocio do Bolao Copa 2026
- **Grupo_Bolao**: Grupo de participantes que competem entre si em um bolao especifico
- **Participante**: Pessoa registrada em um Grupo_Bolao que realiza palpites sobre os jogos
- **Palpite**: Previsao de placar (gols de cada selecao) feita por um Participante para uma Partida especifica
- **Partida**: Jogo oficial da Copa do Mundo FIFA 2026 com duas selecoes, data, horario e local
- **Placar_Real**: Resultado oficial de uma Partida apos seu encerramento
- **Regra_Pontuacao**: Conjunto de criterios que define quantos pontos um Participante recebe com base na precisao do Palpite em relacao ao Placar_Real
- **Ranking**: Classificacao ordenada dos Participantes de um Grupo_Bolao com base na pontuacao acumulada
- **Administrador_Bolao**: Usuario com papel "admin" no sistema que gerencia Grupos_Bolao, Partidas e resultados
- **Notificador_WhatsApp**: Modulo do Backend responsavel por enviar notificacoes automaticas aos Participantes via WhatsApp_Cloud_API
- **Fase_Torneio**: Etapa da Copa do Mundo (fase_de_grupos, oitavas, quartas, semifinal, terceiro_lugar, final)
- **Janela_Palpite**: Periodo durante o qual um Participante pode registrar ou alterar seu Palpite para uma Partida (encerra no horario de inicio da Partida)
- **Bandeira_Selecao**: Emoji de bandeira do pais (formato Unicode flag emoji) associado a cada selecao para exibicao visual
- **Fonte_Resultados**: API externa confiavel (ex: Football-Data.org, API-Football) utilizada para obter resultados oficiais das Partidas automaticamente
- **Sincronizador_Resultados**: Modulo do Backend responsavel por consultar a Fonte_Resultados periodicamente e atualizar os Placares_Reais das Partidas

## Requirements

### Requirement 1: Criacao e Gestao de Grupos de Bolao

**User Story:** Como administrador, eu quero criar e gerenciar grupos de bolao, para que eu possa organizar diferentes pools de palpites para a Copa 2026.

#### Acceptance Criteria

1. WHEN um Administrador_Bolao cria um novo Grupo_Bolao com dados validos, THE Sistema_Bolao SHALL persistir no Banco_de_Dados: identificador unico, nome (1 a 100 caracteres), descricao (ate 500 caracteres), data de criacao, status (aberto, fechado, finalizado) e identificador do Administrador_Bolao criador
2. THE Sistema_Bolao SHALL limitar a criacao de no maximo 50 Grupos_Bolao ativos por instancia do sistema
3. IF um Administrador_Bolao tentar criar um Grupo_Bolao com nome ja existente, THEN THE Sistema_Bolao SHALL rejeitar a operacao com erro indicando que o nome ja esta em uso
4. WHEN um Administrador_Bolao altera o status de um Grupo_Bolao para "fechado", THE Sistema_Bolao SHALL impedir o registro de novos Participantes nesse grupo, mantendo os Participantes existentes e seus Palpites
5. WHEN um Administrador_Bolao altera o status de um Grupo_Bolao para "finalizado", THE Sistema_Bolao SHALL impedir qualquer novo Palpite, congelar o Ranking final e notificar todos os Participantes via Notificador_WhatsApp com a classificacao final
6. IF um Administrador_Bolao tentar excluir um Grupo_Bolao que possui Participantes registrados, THEN THE Sistema_Bolao SHALL rejeitar a operacao com erro indicando que o grupo possui participantes ativos

### Requirement 2: Registro de Participantes

**User Story:** Como participante, eu quero me registrar em um grupo de bolao via WhatsApp ou painel, para que eu possa fazer meus palpites nos jogos da Copa.

#### Acceptance Criteria

1. WHEN um Cliente envia uma mensagem via WhatsApp contendo o comando de adesao e o codigo do Grupo_Bolao, THE Sistema_Bolao SHALL registrar o Cliente como Participante no Grupo_Bolao correspondente, associando o numero de telefone WhatsApp como identificador
2. WHEN um Administrador_Bolao cadastra um Participante manualmente pelo painel, THE Sistema_Bolao SHALL registrar o Participante com nome (1 a 100 caracteres) e numero de telefone WhatsApp (formato E.164, maximo 15 digitos) no Grupo_Bolao selecionado
3. THE Sistema_Bolao SHALL armazenar para cada Participante: identificador unico, nome, numero de telefone WhatsApp, Grupo_Bolao associado, data de registro e pontuacao acumulada (inicializada em zero)
4. IF um Cliente tentar se registrar em um Grupo_Bolao com status "fechado" ou "finalizado", THEN THE Sistema_Bolao SHALL rejeitar o registro e enviar mensagem via WhatsApp informando que o grupo nao aceita novos participantes
5. IF um Cliente tentar se registrar em um Grupo_Bolao no qual ja esta registrado, THEN THE Sistema_Bolao SHALL informar via WhatsApp que o participante ja esta cadastrado no grupo, sem criar registro duplicado
6. THE Sistema_Bolao SHALL limitar a no maximo 200 Participantes por Grupo_Bolao
7. IF um Cliente tentar se registrar em um Grupo_Bolao que atingiu o limite de 200 Participantes, THEN THE Sistema_Bolao SHALL rejeitar o registro e enviar mensagem via WhatsApp informando que o grupo esta lotado
8. WHEN um Participante e registrado com sucesso, THE Notificador_WhatsApp SHALL enviar mensagem de boas-vindas ao Participante contendo o nome do Grupo_Bolao e instrucoes basicas de uso

### Requirement 3: Gestao de Partidas da Copa 2026

**User Story:** Como administrador, eu quero cadastrar e gerenciar as partidas da Copa 2026, para que os participantes possam fazer palpites nos jogos corretos.

#### Acceptance Criteria

1. WHEN um Administrador_Bolao cadastra uma nova Partida, THE Sistema_Bolao SHALL persistir no Banco_de_Dados: identificador unico, selecao mandante (1 a 50 caracteres), Bandeira_Selecao mandante, selecao visitante (1 a 50 caracteres), Bandeira_Selecao visitante, data e horario (formato ISO 8601 com timezone), local (1 a 100 caracteres), Fase_Torneio e status (agendada, em_andamento, finalizada, cancelada)
2. THE Sistema_Bolao SHALL impedir o cadastro de Partidas com data e horario no passado
3. IF um Administrador_Bolao tentar cadastrar uma Partida com as mesmas selecoes, data e Fase_Torneio de uma Partida ja existente, THEN THE Sistema_Bolao SHALL rejeitar a operacao com erro indicando duplicidade
4. WHEN um Administrador_Bolao atualiza os dados de uma Partida com status "agendada", THE Sistema_Bolao SHALL permitir a alteracao de data, horario, local e selecoes
5. IF um Administrador_Bolao tentar alterar dados de uma Partida com status "finalizada" ou "em_andamento", THEN THE Sistema_Bolao SHALL rejeitar a alteracao com erro indicando que a partida nao pode ser modificada nesse status
6. WHEN um Administrador_Bolao altera o status de uma Partida para "cancelada", THE Sistema_Bolao SHALL invalidar todos os Palpites associados a essa Partida e nao contabiliza-los no Ranking
7. THE Sistema_Bolao SHALL permitir a importacao em lote de ate 64 Partidas por operacao, validando cada registro individualmente e reportando erros por linha
8. THE Sistema_Bolao SHALL associar automaticamente a Bandeira_Selecao (emoji Unicode) a cada selecao cadastrada, utilizando um mapeamento interno de nome de pais para emoji de bandeira
9. WHEN uma Partida e exibida no Frontend ou em mensagens WhatsApp, THE Sistema_Bolao SHALL incluir a Bandeira_Selecao ao lado do nome de cada selecao para identificacao visual

### Requirement 4: Registro e Gestao de Palpites

**User Story:** Como participante, eu quero registrar meus palpites de placar para os jogos, para que eu possa competir no bolao.

#### Acceptance Criteria

1. WHEN um Participante envia um Palpite via WhatsApp no formato "[Selecao A] [X] x [Y] [Selecao B]" durante a Janela_Palpite, THE Sistema_Bolao SHALL registrar o Palpite com os gols da selecao mandante e visitante (valores inteiros de 0 a 99) associado a Partida correspondente
2. WHEN um Participante registra um Palpite pelo painel web durante a Janela_Palpite, THE Sistema_Bolao SHALL persistir o Palpite com identificador unico, identificador do Participante, identificador da Partida, gols mandante, gols visitante e timestamp de registro
3. WHILE a Janela_Palpite estiver aberta para uma Partida, THE Sistema_Bolao SHALL permitir que o Participante altere seu Palpite quantas vezes desejar, mantendo apenas o ultimo Palpite registrado
4. WHEN o horario de inicio de uma Partida e atingido, THE Sistema_Bolao SHALL fechar a Janela_Palpite e impedir qualquer novo registro ou alteracao de Palpite para essa Partida
5. IF um Participante tentar registrar um Palpite apos o fechamento da Janela_Palpite, THEN THE Sistema_Bolao SHALL rejeitar o Palpite e informar via WhatsApp que o prazo para palpites dessa partida encerrou
6. IF um Participante enviar um Palpite via WhatsApp em formato invalido, THEN THE Sistema_Bolao SHALL responder com mensagem indicando o formato correto e um exemplo de uso
7. THE Sistema_Bolao SHALL garantir unicidade de Palpite por combinacao de Participante e Partida, armazenando apenas um Palpite ativo por Participante por Partida
8. WHEN um Participante registra um Palpite com sucesso, THE Sistema_Bolao SHALL confirmar o registro via WhatsApp com resumo do palpite (selecoes e placar)

### Requirement 5: Regras de Pontuacao

**User Story:** Como participante, eu quero entender como os pontos sao calculados, para que eu saiba o que preciso acertar para subir no ranking.

#### Acceptance Criteria

1. WHEN o Placar_Real de uma Partida e registrado, THE Sistema_Bolao SHALL calcular a pontuacao de cada Palpite associado a essa Partida aplicando as Regras_Pontuacao em ate 30 segundos
2. THE Regra_Pontuacao SHALL atribuir 10 pontos quando o Palpite acerta o placar exato (gols mandante e gols visitante identicos ao Placar_Real)
3. THE Regra_Pontuacao SHALL atribuir 7 pontos quando o Palpite acerta o vencedor e a diferenca de gols, sem acertar o placar exato
4. THE Regra_Pontuacao SHALL atribuir 5 pontos quando o Palpite acerta o vencedor da Partida sem acertar a diferenca de gols nem o placar exato
5. THE Regra_Pontuacao SHALL atribuir 5 pontos quando o Palpite acerta que a Partida terminou em empate sem acertar o placar exato
6. THE Regra_Pontuacao SHALL atribuir 3 pontos quando o Palpite acerta o numero de gols de apenas uma das selecoes sem se enquadrar em nenhuma das categorias anteriores
7. THE Regra_Pontuacao SHALL atribuir 0 pontos quando o Palpite nao se enquadra em nenhuma das categorias anteriores
8. THE Sistema_Bolao SHALL aplicar as Regras_Pontuacao de forma mutuamente exclusiva, atribuindo apenas a pontuacao da categoria de maior valor na qual o Palpite se enquadra
9. WHEN a pontuacao de um Palpite e calculada, THE Sistema_Bolao SHALL atualizar a pontuacao acumulada do Participante no Grupo_Bolao correspondente

### Requirement 6: Ranking e Classificacao

**User Story:** Como participante, eu quero acompanhar minha posicao no ranking, para que eu saiba como estou em relacao aos outros participantes.

#### Acceptance Criteria

1. THE Sistema_Bolao SHALL manter o Ranking de cada Grupo_Bolao ordenado por pontuacao acumulada decrescente
2. WHEN dois ou mais Participantes possuem a mesma pontuacao acumulada, THE Sistema_Bolao SHALL desempatar pela quantidade de acertos de placar exato (maior quantidade primeiro) e, persistindo o empate, pela quantidade de acertos de vencedor
3. WHEN um Participante solicita o Ranking via WhatsApp, THE Sistema_Bolao SHALL responder com as 10 primeiras posicoes do Ranking do Grupo_Bolao, incluindo posicao, nome do Participante e pontuacao acumulada
4. WHEN um Participante solicita o Ranking pelo painel web, THE Sistema_Bolao SHALL exibir o Ranking completo paginado com no maximo 50 Participantes por pagina, incluindo posicao, nome, pontuacao acumulada, quantidade de acertos exatos e variacao de posicao em relacao a rodada anterior
5. WHEN o Placar_Real de uma Partida e registrado e as pontuacoes sao calculadas, THE Sistema_Bolao SHALL atualizar o Ranking de todos os Grupos_Bolao afetados em ate 60 segundos
6. THE Sistema_Bolao SHALL armazenar o historico de posicoes do Ranking apos cada rodada de atualizacao para permitir consulta de evolucao

### Requirement 7: Notificacoes via WhatsApp

**User Story:** Como participante, eu quero receber notificacoes automaticas sobre jogos e resultados, para que eu nao perca prazos de palpites e saiba meus resultados.

#### Acceptance Criteria

1. WHEN faltam 24 horas para o inicio de uma Partida, THE Notificador_WhatsApp SHALL enviar lembrete a todos os Participantes dos Grupos_Bolao que ainda nao registraram Palpite para essa Partida, incluindo selecoes, data, horario e instrucoes para envio do palpite
2. WHEN faltam 2 horas para o inicio de uma Partida, THE Notificador_WhatsApp SHALL enviar lembrete final aos Participantes que ainda nao registraram Palpite para essa Partida
3. WHEN o Placar_Real de uma Partida e registrado, THE Notificador_WhatsApp SHALL enviar a todos os Participantes dos Grupos_Bolao associados: o resultado da Partida, a pontuacao obtida pelo Participante nessa Partida e a posicao atualizada no Ranking
4. WHEN o Ranking de um Grupo_Bolao e atualizado, THE Notificador_WhatsApp SHALL enviar o top 5 do Ranking aos Participantes que subiram de posicao
5. THE Notificador_WhatsApp SHALL respeitar o limite de rate da WhatsApp_Cloud_API, enviando no maximo 80 mensagens por segundo e implementando backoff exponencial em caso de erro 429
6. IF o envio de uma notificacao falhar apos 3 tentativas com backoff exponencial, THEN THE Notificador_WhatsApp SHALL registrar a falha em log e marcar a notificacao como "falha" sem bloquear o envio das demais notificacoes
7. THE Notificador_WhatsApp SHALL utilizar templates de mensagem pre-aprovados pela WhatsApp_Cloud_API para todas as notificacoes proativas enviadas fora da janela de 24 horas

### Requirement 8: Administracao pelo Painel Web

**User Story:** Como administrador, eu quero gerenciar todo o bolao pelo painel web existente, para que eu tenha controle centralizado sobre grupos, partidas e resultados.

#### Acceptance Criteria

1. THE Frontend SHALL exibir uma secao dedicada ao Bolao Copa 2026 no menu de navegacao do painel, acessivel apenas a usuarios com papel "admin"
2. WHEN um Administrador_Bolao acessa a secao de Bolao, THE Frontend SHALL exibir dashboard com: quantidade de Grupos_Bolao ativos, total de Participantes, proximas Partidas e Partidas aguardando resultado
3. WHEN um Administrador_Bolao registra o Placar_Real de uma Partida finalizada, THE Sistema_Bolao SHALL validar que os gols sao valores inteiros de 0 a 99, persistir o resultado, disparar o calculo de pontuacao e atualizar o Ranking
4. THE Frontend SHALL permitir que o Administrador_Bolao visualize a lista de Participantes de cada Grupo_Bolao com nome, telefone, pontuacao acumulada e posicao no Ranking
5. WHEN um Administrador_Bolao exporta o Ranking de um Grupo_Bolao, THE Sistema_Bolao SHALL gerar um arquivo CSV contendo posicao, nome, telefone, pontuacao acumulada e quantidade de acertos por categoria
6. THE Frontend SHALL exibir log de notificacoes enviadas pelo Notificador_WhatsApp com status (enviada, falha) e timestamp, paginado com no maximo 100 registros por pagina
7. WHEN um Administrador_Bolao busca Participantes por nome ou telefone, THE Sistema_Bolao SHALL retornar resultados parciais (busca por substring) em ate 2 segundos

### Requirement 9: Interacao via WhatsApp (Comandos)

**User Story:** Como participante, eu quero interagir com o bolao enviando comandos simples via WhatsApp, para que eu possa fazer palpites e consultar informacoes sem acessar outro sistema.

#### Acceptance Criteria

1. WHEN um Participante envia "JOGOS" via WhatsApp, THE Sistema_Bolao SHALL responder com a lista das proximas 5 Partidas agendadas com selecoes, data, horario e status do Palpite do Participante (registrado ou pendente)
2. WHEN um Participante envia "RANKING" via WhatsApp, THE Sistema_Bolao SHALL responder com as 10 primeiras posicoes do Ranking do Grupo_Bolao do Participante e a posicao atual do Participante caso nao esteja no top 10
3. WHEN um Participante envia "MEUS PALPITES" via WhatsApp, THE Sistema_Bolao SHALL responder com os ultimos 10 Palpites registrados pelo Participante, incluindo selecoes, placar palpitado e pontuacao obtida (quando disponivel)
4. WHEN um Participante envia "AJUDA" via WhatsApp, THE Sistema_Bolao SHALL responder com a lista de comandos disponiveis e formato para registro de palpites
5. IF um Participante enviar um comando nao reconhecido via WhatsApp, THEN THE Sistema_Bolao SHALL responder com mensagem indicando que o comando nao foi reconhecido e sugerir o envio de "AJUDA" para ver os comandos disponiveis
6. THE Sistema_Bolao SHALL processar comandos via WhatsApp de forma case-insensitive, aceitando variações como "jogos", "Jogos" ou "JOGOS"
7. WHEN um Participante envia "ENTRAR [codigo]" via WhatsApp, THE Sistema_Bolao SHALL processar a adesao ao Grupo_Bolao correspondente ao codigo informado

### Requirement 10: Modelo de Dados do Bolao

**User Story:** Como desenvolvedor, eu quero um modelo de dados bem estruturado para o bolao, para que as relacoes entre grupos, participantes, partidas e palpites sejam consistentes.

#### Acceptance Criteria

1. THE Banco_de_Dados SHALL manter integridade referencial entre as tabelas de Grupos_Bolao, Participantes, Partidas, Palpites e Pontuacoes usando chaves estrangeiras com politica ON DELETE RESTRICT para Grupos_Bolao e Participantes referenciados por Palpites
2. THE Banco_de_Dados SHALL garantir unicidade de Palpite por combinacao de Participante e Partida atraves de constraint UNIQUE composta
3. THE Banco_de_Dados SHALL indexar as colunas de status das Partidas e data/horario para otimizar consultas de Partidas agendadas e Janela_Palpite
4. THE Banco_de_Dados SHALL indexar a coluna de pontuacao acumulada dos Participantes para otimizar consultas de Ranking
5. THE Banco_de_Dados SHALL armazenar para cada registro de Pontuacao: identificador unico, identificador do Palpite, pontos atribuidos, categoria de acerto (exato, diferenca_gols, vencedor, empate, gols_parcial, erro) e timestamp de calculo
6. IF uma operacao de exclusao violar a integridade referencial (RESTRICT), THEN THE Banco_de_Dados SHALL rejeitar a operacao e preservar todos os registros dependentes
7. THE Banco_de_Dados SHALL utilizar tipo TIMESTAMPTZ para todas as colunas de data/horario, garantindo consistencia com fusos horarios dos locais das Partidas

### Requirement 11: Seguranca e Validacao do Bolao

**User Story:** Como administrador, eu quero que o modulo de bolao seja seguro e valide todas as entradas, para que os dados do bolao sejam confiaveis.

#### Acceptance Criteria

1. THE Sistema_Bolao SHALL validar e sanitizar todos os inputs recebidos via API e via mensagens WhatsApp antes de processar
2. WHEN uma requisicao a endpoints do Bolao e recebida sem token JWT valido com papel "admin", THE Sistema_Bolao SHALL rejeitar a requisicao com status HTTP 401 para endpoints administrativos
3. THE Sistema_Bolao SHALL permitir que Participantes autenticados via numero WhatsApp acessem apenas seus proprios Palpites e o Ranking do seu Grupo_Bolao
4. IF um Participante tentar registrar um Palpite com valores de gols negativos ou nao inteiros, THEN THE Sistema_Bolao SHALL rejeitar o Palpite com mensagem indicando que os valores devem ser numeros inteiros de 0 a 99
5. THE Sistema_Bolao SHALL registrar em log de auditoria todas as acoes administrativas (criacao de grupo, registro de resultado, alteracao de partida) incluindo timestamp, identificador do administrador e descricao da acao
6. IF o Sistema_Bolao detectar mais de 10 tentativas de comando invalido de um mesmo numero WhatsApp em 5 minutos, THEN THE Sistema_Bolao SHALL ignorar mensagens desse numero por 15 minutos e registrar o evento em log como possivel abuso

### Requirement 12: Sincronizacao Automatica de Resultados

**User Story:** Como administrador, eu quero que os resultados das partidas sejam populados automaticamente a partir de uma fonte confiavel, para que eu nao precise registrar manualmente cada placar e os participantes recebam resultados mais rapido.

#### Acceptance Criteria

1. THE Sincronizador_Resultados SHALL consultar a Fonte_Resultados a cada 5 minutos durante o horario de Partidas em andamento para verificar se ha novos resultados disponiveis
2. WHEN a Fonte_Resultados retorna o placar final de uma Partida com status "em_andamento", THE Sincronizador_Resultados SHALL atualizar o Placar_Real da Partida correspondente, alterar o status para "finalizada" e disparar o calculo de pontuacao automaticamente
3. THE Sincronizador_Resultados SHALL utilizar autenticacao via API key armazenada em variavel de ambiente para acessar a Fonte_Resultados, sem expor a chave em logs ou respostas
4. IF a Fonte_Resultados nao responder dentro de 10 segundos ou retornar erro, THEN THE Sincronizador_Resultados SHALL registrar o erro em log e tentar novamente na proxima execucao programada, sem interromper o funcionamento do sistema
5. WHEN o Sincronizador_Resultados atualiza um Placar_Real automaticamente, THE Sistema_Bolao SHALL registrar em log de auditoria que o resultado foi obtido via Fonte_Resultados (nao manual), incluindo timestamp e identificador da fonte
6. THE Sincronizador_Resultados SHALL validar que o placar recebido da Fonte_Resultados contem valores inteiros de 0 a 99 para ambas as selecoes antes de persistir o resultado
7. IF o Sincronizador_Resultados receber um resultado inconsistente (selecoes nao correspondem a Partida cadastrada), THEN THE Sincronizador_Resultados SHALL descartar o resultado, registrar alerta em log e notificar o Administrador_Bolao via painel para revisao manual
8. THE Sistema_Bolao SHALL permitir que o Administrador_Bolao desative a sincronizacao automatica para Partidas especificas, exigindo registro manual do resultado
9. WHEN o Sincronizador_Resultados nao encontra resultado para uma Partida cuja data e horario ja passaram ha mais de 4 horas, THE Sincronizador_Resultados SHALL notificar o Administrador_Bolao via painel para que registre o resultado manualmente
10. THE Sincronizador_Resultados SHALL suportar configuracao de multiplas Fontes_Resultados com prioridade, utilizando a fonte secundaria caso a primaria esteja indisponivel por mais de 3 consultas consecutivas