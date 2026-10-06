# Roadmap — Meu Treino

Plano de evolução do app: hoje ele atende uma pessoa, e o objetivo é que várias pessoas usem, cada uma com fichas personalizadas, montadas por ela mesma ou por um personal.

## Onde estamos

- PWA de arquivo único ([meu_treino_app.html](meu_treino_app.html), ~1.500 linhas), publicado no GitHub Pages; [sw.js](sw.js) guarda o app em cache para uso offline.
- Ficha de treinos (A/B/C/D) escrita direto no código, no objeto `treinos`.
- Dados no `localStorage`: últimos valores digitados, treino em andamento e histórico (limitado a 50 treinos).
- Registro de carga e reps por série, histórico de treinos, timer de descanso.
- Sugestão de carga por progressão dupla (`computeSuggestion`).
- Backup na nuvem com login Google (Firebase Auth + Firestore, projeto `treino-app-21fcd`): um documento por usuário em `users/{uid}`, sincronizado com `mergeCloudData`.
- Sem testes automáticos no repositório e sem ferramenta de build.

## Princípios

1. **O app funciona sem internet.** O celular é a fonte principal dos dados e a nuvem é backup/sincronização. Nenhuma tela pode impedir o registro de um treino por falta de conexão ou de login.
2. **Os dados são do aluno.** Fichas e histórico pertencem a quem treina. Um personal só tem acesso autorizado pelo aluno, e o aluno pode revogar esse acesso a qualquer momento.
3. **Nunca perder dados.** Toda mudança no formato dos dados vem com uma migração testada. Mudanças grandes são testadas primeiro no projeto Firebase de desenvolvimento.
4. **Simplicidade.** Sem build e sem framework até que um problema concreto justifique.

**Legenda:** 🧱 estrutura · ✨ funcionalidade

---

## Fase 1: rede de segurança

### 1. 🧱 Ambiente de desenvolvimento separado

**Por quê:** hoje qualquer teste com login mexe no mesmo Firebase onde estão os dados reais.

- [x] Instalar o Node.js (LTS) na máquina de desenvolvimento. (Node 24 + Java 21, que o emulador do Firestore exige.)
- [x] Criar um projeto Firebase de desenvolvimento (ex.: `treino-app-dev`), com login Google e Firestore. Criado como `treino-app-dev-306d2`, com as regras publicadas.
- [x] O app escolhe a configuração Firebase pelo endereço: `localhost` usa o projeto de dev e `ledu55.github.io` usa o de produção (`pickFirebaseEnv`; enquanto o dev não existir, `localhost` usa o emulador).
- [x] Versionar as regras do Firestore em `firestore.rules`, com `firebase.json` para publicar pela Firebase CLI. As regras publicadas em produção (lidas em 2026-10-06) são equivalentes às do arquivo.
- [x] Usar o Firebase Emulator para testes locais sem tocar em nenhum projeto real (`npm run emulators`, projeto `demo-treino`, ou `?emulator` na URL).

**Pronto quando:** dá para rodar o app em `localhost`, fazer login e sincronizar sem que nada chegue ao projeto de produção.

### 2. 🧱 Testes automáticos + verificação no GitHub

**Por quê:** é o que permite reestruturar o código (fases 2 e 3) sem quebrar o que funciona.

- [x] Testes de unidade (Vitest) para as regras de cálculo: `computeSuggestion`, `parseRepRange`, `parseNumber`, `mergeCloudData` e, depois, as migrações. Por enquanto carregam o HTML real no jsdom ([tests/unit/load-app.js](tests/unit/load-app.js)); no item 3 passam a importar os módulos.
- [x] Testes de ponta a ponta (Playwright) nos fluxos principais: marcar séries, digitar carga, finalizar treino, ver a sugestão, aplicar a sugestão com "Usar". Inclui login + backup no emulador, verificando que nada vai para os servidores reais.
- [x] Testes das regras do Firestore no emulador: usuário só acessa os próprios dados, acesso anônimo é negado (e, a partir do item 6, os casos do personal).
- [x] GitHub Actions rodando todos os testes a cada push e pull request ([.github/workflows/test.yml](.github/workflows/test.yml)).

**Pronto quando:** `npm test` roda tudo localmente e o GitHub mostra ✅/❌ em cada push.

> Observação: o Chrome headless com `--virtual-time-budget` trava o Firebase Auth (o IndexedDB não responde). O Playwright roda em tempo real e não tem esse problema.

---

## Fase 2: reorganizar o código

### 3. 🧱 Dividir o arquivo único em módulos

**Por quê:** 1.500 linhas num só arquivo dificultam manutenção, testes e o editor de treinos.

- [ ] Separar o CSS em `css/app.css`.
- [ ] Separar o JS em módulos nativos do navegador (`<script type="module">`), sem build. Sugestão de divisão:
  - `js/storage.js`: leitura/gravação local
  - `js/progression.js`: sugestão de carga
  - `js/cloud.js`: Firebase e sincronização
  - `js/timer.js`: descanso e alarme
  - `js/ui/*.js`: renderização das telas
- [ ] Trocar os `onclick="..."` do HTML por `addEventListener` (funções de módulo não são globais).
- [ ] Renomear `meu_treino_app.html` para `index.html`, mantendo um redirecionamento no nome antigo para quem já tem o app instalado.

**Pronto quando:** o app se comporta exatamente igual e todos os testes do item 2 passam.

### 4. 🧱 Atualização automática do app

**Por quê:** hoje é preciso lembrar de subir `CACHE_VERSION` em [sw.js](sw.js) a cada mudança; com vários arquivos, esquecer fica mais fácil e o celular fica com uma versão misturada.

- [ ] Gerar a versão do cache automaticamente (script ou GitHub Action que grava o hash do commit no `sw.js`).
- [ ] Gerar a lista de arquivos do cache automaticamente.
- [ ] Mostrar no app o aviso "Nova versão disponível — Atualizar" quando o service worker novo estiver pronto.

**Pronto quando:** um push no `main` chega ao celular sem edição manual de versão, e o usuário vê o aviso de atualização.

### 5. 🧱 Versão do formato dos dados + migrações

**Por quê:** a fase 3 muda o formato dos dados de quem já usa o app.

- [ ] Gravar `schemaVersion` nos dados locais e na nuvem (o documento da nuvem já tem `schema: 1`).
- [ ] Criar uma lista ordenada de migrações (`v1 → v2 → ...`), aplicadas ao abrir o app e ao receber dados da nuvem.
- [ ] Guardar uma cópia dos dados antigos antes de migrar, para poder desfazer.
- [ ] Testar cada migração com dados reais anonimizados.

**Pronto quando:** existe uma migração de exemplo testada e o app recusa com segurança dados de uma versão mais nova que ele não conhece.

---

## Fase 3: base para vários usuários

### 6. 🧱 Novo modelo de dados

**Por quê:** é a base para fichas personalizadas, para o modo personal e para histórico sem limite.

**Biblioteca de exercícios:** `data/exercises.json`, com id fixo, nome, GIF, instruções e incremento de carga. Hoje essas informações estão espalhadas no objeto `treinos`.

**Firestore:**

```
users/{uid}                    perfil: nome, isTrainer, trainers: { trainerUid: true }, schemaVersion
users/{uid}/plans/{planId}     ficha: nome, treinos[{ id, nome, exercícios[{ exerciseId, séries, reps, descanso, obs }] }],
                               createdBy, updatedBy, updatedAt, ativa
users/{uid}/sessions/{id}      treino finalizado: data, planId, workoutId, exercícios[{ exerciseId, séries[{ kg, reps, feita }] }], obs
users/{uid}/state/current      últimos valores digitados por exercício
invites/{codigo}               convite de personal: trainerUid, expiresAt
```

- [ ] Ids fixos para fichas, treinos e exercícios. Hoje o histórico usa `"A|Agachamento"`, e renomear um exercício quebra a ligação.
- [ ] Um documento por treino finalizado, o que elimina o limite de 50 treinos e o risco de passar de 1 MB num documento só.
- [ ] Regras do Firestore:
  - o aluno lê e escreve tudo que é dele;
  - um personal listado em `trainers` pode ler o perfil, ler o histórico e editar fichas, mas não pode apagar treinos nem alterar o perfil;
  - só o próprio aluno grava a lista `trainers`.
- [ ] Migração dos dados atuais: a ficha A/B/C/D vira a primeira ficha da usuária atual, e o histórico e os últimos valores passam para os novos ids. A sugestão de carga e o histórico devem continuar aparecendo iguais.
- [ ] Armazenamento local: avaliar trocar `localStorage` (limite ~5 MB) por IndexedDB, já que o histórico deixa de ter limite.
- [ ] Adaptar `computeSuggestion` e a sincronização ao novo formato.

**Pronto quando:** a usuária atual abre o app depois da atualização e tudo está igual, com os dados já no novo formato no celular e na nuvem.

### 7. ✨ Editor de treinos + modelos prontos

- [ ] Criar, renomear, duplicar e apagar fichas; escolher a ficha ativa.
- [ ] Dentro da ficha: criar treinos, reordenar e escolher exercícios da biblioteca com busca, além de definir séries, faixa de reps, descanso e observações.
- [ ] Modelos prontos (a ficha A/B/C/D atual vira o primeiro modelo).
- [ ] Componentes do editor reaproveitáveis pelo modo personal (item 12).
- [ ] **Decisão:** continuar em JS puro ou adotar uma biblioteca leve de interface (ex.: Preact + htm ou Lit, ambos sem build). Decidir ao começar este item, quando o tamanho do estado do editor estiver claro.

**Pronto quando:** uma pessoa nova consegue montar a própria ficha do zero no celular sem ajuda.

### 8. ✨ Primeiro acesso

- [ ] Tela de boas-vindas na primeira abertura: nome, "Entrar com Google" (recomendado, mas opcional) e a escolha entre um modelo e uma ficha do zero.
- [ ] Título e textos usando o nome da pessoa (sai "Treino do Meu Benzinho" do código).
- [ ] Ao entrar com uma conta que já tem dados na nuvem, restaurar os dados em vez de mostrar a configuração inicial.
- [ ] Depois do primeiro acesso, o app abre direto no treino, sem pedir login de novo.

**Pronto quando:** alguém que nunca viu o app instala, configura e registra um treino em poucos minutos.

---

## Fase 4: qualidade e abertura para outras pessoas

### 9. ✨ Editar treinos já finalizados

**Por quê:** um erro de digitação muda a sugestão de carga do próximo treino, e hoje a única saída é apagar o treino inteiro.

- [ ] Editar carga, reps, séries feitas e observações de um treino do histórico.
- [ ] Recalcular a sugestão de carga depois da edição.

### 10. 🧱 O mínimo antes de divulgar

- [ ] **Excluir conta:** apagar todos os dados da nuvem e a conta do Firebase Auth (LGPD).
- [ ] **Exportar dados:** baixar o histórico (LGPD: portabilidade).
- [ ] Texto curto de privacidade dentro do app: quais dados são guardados, onde e para quê.
- [ ] Restringir a chave da API (apiKey) no Google Cloud a `ledu55.github.io/*` e `localhost`.
- [ ] Alerta de orçamento no Firebase/Google Cloud.
- [ ] Monitoramento de erros (ex.: Sentry no plano gratuito), para saber quando algo falha no celular de outra pessoa.

**Pronto quando:** dá para indicar o app para alguém fora da família sem riscos legais ou de custo.

### 11. ✨ Gráficos e recordes pessoais

- [ ] Gráfico de carga (e volume) ao longo do tempo por exercício.
- [ ] Aviso de recorde pessoal ao finalizar um treino ("🏆 Novo recorde no Agachamento: 42,5 kg").
- [ ] Frequência semanal ("3 treinos esta semana").

### 12. ✨ Modo personal

**Depende de:** 6 (regras e modelo), 7 (editor) e 11 (gráficos).

- [ ] Ativar o perfil de personal numa conta.
- [ ] O personal gera um código de convite com validade; o aluno digita o código e confirma o acesso.
- [ ] Lista de alunos do personal, com o último treino de cada um.
- [ ] Editar a ficha de um aluno com o mesmo editor do item 7.
- [ ] Ver o histórico e os gráficos do aluno.
- [ ] Aviso para o aluno: "Ficha atualizada pelo seu personal".
- [ ] O aluno vê quem tem acesso e pode remover.
- [ ] Testes das regras: personal autorizado, personal removido e personal sem vínculo.
- [ ] **Decisão:** o aluno pode alterar uma ficha montada pelo personal ou só fazer uma cópia? (O modelo de dados funciona com qualquer uma das duas respostas, via `createdBy`.)

### 13. ✨ Refinamentos

- [ ] Alerta do timer com a tela desligada (vibração/notificação). Ela continua iniciando o timer manualmente; iniciar o timer automaticamente foi recusado.
- [ ] Outros ajustes conforme o uso.

---

## Decisões já tomadas

| Tema | Decisão |
|---|---|
| Progressão de carga | Progressão dupla; incremento por exercício (2,5 kg padrão, 1 kg em halteres/isolados); sugestão exibida com botão "Usar", sem preencher automaticamente |
| Backup | Firebase com login Google, sincronização automática |
| Página de login | Não bloqueia o app; o login entra no primeiro acesso (item 8) e continua opcional |
| Quem monta as fichas | Os dois: cada pessoa e, opcionalmente, um personal autorizado pelo aluno |
| Recusados | Iniciar o timer de descanso automaticamente; modo escuro |

## Decisões em aberto

- JS puro ou biblioteca leve de interface (item 7).
- Aluno pode ou não alterar uma ficha montada pelo personal (item 12).
- `localStorage` ou IndexedDB para os dados locais (item 6).
