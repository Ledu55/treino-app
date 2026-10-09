# Roadmap — Meu Treino

Plano de evolução do app: hoje ele atende uma pessoa, e o objetivo é que várias pessoas usem, cada uma com fichas personalizadas, montadas por ela mesma ou por um personal.

## Onde estamos

- PWA em Vite + Preact ([src/](src/)), publicado no GitHub Pages pelo GitHub Actions; o service worker ([src/sw.js](src/sw.js), gerado pelo `vite-plugin-pwa`) guarda o app em cache para uso offline e avisa quando há versão nova.
- Fichas com ids fixos, montadas a partir da biblioteca de exercícios ([src/data/exercises.json](src/data/exercises.json)); a ficha A/B/C/D virou a primeira ficha (e o primeiro modelo, em [src/data/templates.js](src/data/templates.js)).
- Dados no `localStorage` (formato v2): perfil, fichas, histórico sem limite, últimos valores digitados e treino em andamento.
- Registro de carga e reps por série, histórico de treinos, timer de descanso.
- Sugestão de carga por progressão dupla (`computeSuggestion`).
- Backup na nuvem com login Google (Firebase Auth + Firestore, projeto `treino-app-21fcd`): perfil em `users/{uid}`, um documento por ficha e por treino finalizado, sincronizados por [src/cloud.js](src/cloud.js) (só o que mudou) e mesclados por [src/sync.js](src/sync.js).
- Tela "Privacidade e seus dados": texto de privacidade, exportação (JSON e planilha) e exclusão da conta.
- Testes automáticos (Vitest, Playwright, regras no emulador) rodando no GitHub Actions.

## Princípios

1. **O app funciona sem internet.** O celular é a fonte principal dos dados e a nuvem é backup/sincronização. Nenhuma tela pode impedir o registro de um treino por falta de conexão ou de login.
2. **Os dados são do aluno.** Fichas e histórico pertencem a quem treina. Um personal só tem acesso autorizado pelo aluno, e o aluno pode revogar esse acesso a qualquer momento.
3. **Nunca perder dados.** Toda mudança no formato dos dados vem com uma migração testada. Mudanças grandes são testadas primeiro no projeto Firebase de desenvolvimento.
4. **Simplicidade.** Delegar o que é infraestrutura repetitiva (build, cache do service worker) a ferramentas prontas e manter o código do app pequeno. Dependência nova só quando resolve um problema concreto. (Antes era "sem build"; mudou com a Fase 1, porque Node e CI já existem e o item 4 é justamente o problema concreto que um build resolve.)

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

### 3. 🧱 Vite + dividir o arquivo único em módulos

**Por quê:** 1.500 linhas num só arquivo dificultam manutenção, testes e o editor de treinos. O Vite junta os módulos, gera nomes de arquivo com hash e, com o `vite-plugin-pwa`, também gera o service worker (item 4).

- [x] **Decisão:** interface em **Preact** (JSX + hooks, via `@preact/preset-vite`). Decidido antes da divisão para que as telas não sejam escritas duas vezes; o estado em árvore do editor do item 7 (fichas → treinos → exercícios → séries) é onde ele mais ajuda.
- [x] Adotar o Vite: `npm start` para desenvolver, `npm run build` gera `dist/`, com `base: '/treino-app/'` para o GitHub Pages. Estáticos (GIFs, ícones, manifest, `sw.js`) em `public/`; por enquanto o `meu_treino_app.html` entra no build como está, e os testes de ponta a ponta já rodam contra o build.
- [x] Publicar pelo GitHub Actions (build + `actions/deploy-pages`) em vez de servir a branch direto. Passo manual: em Settings → Pages, mudar a origem para "GitHub Actions".
- [x] Separar o CSS em `src/app.css`.
- [x] Separar o JS em módulos:
  - `src/storage.js`: leitura/gravação local
  - `src/store.js`: estado do app e as ações que o alteram (marcar série, finalizar treino...), com `subscribe()` para as telas
  - `src/progression.js`: sugestão de carga (`computeSuggestion` agora recebe o histórico como parâmetro)
  - `src/cloud.js`: Firebase e sincronização; o SDK (API modular) vem do npm e é carregado sob demanda com `import()`, num arquivo próprio (`firebase-sdk-*.js`)
  - `src/timer.js`: descanso e alarme
  - `src/data/treinos.js`: a ficha A/B/C/D
  - `src/ui/*.jsx`: telas como componentes Preact
- [x] Reescrever a renderização em componentes Preact, sem `onclick="..."` no HTML. As regras de cálculo ficam em JS puro, sem depender do Preact.
- [x] Manter os mesmos textos, classes CSS e atributos usados pelos testes de ponta a ponta. Conferido também comparando o DOM e capturas de tela do app antigo e do novo com os mesmos dados: só mudaram os `onclick` e espaços em branco.
- [x] Renomear `meu_treino_app.html` para `index.html`, com um redirecionamento no nome antigo (`public/meu_treino_app.html`); o `start_url` do manifest passou para `./`.
- [x] Testes: os de unidade importam os módulos direto (o carregamento do HTML no jsdom foi removido); os de ponta a ponta rodam contra o build. Novos testes: espaço digitado durante a pausa do salvamento, valor digitado logo antes de trocar de treino, timer e redirecionamento do endereço antigo. O teste da nuvem faz login pelo `window.__emulatorSignIn`, que só existe com o emulador.
- [x] Não melhorar a sincronização atual aqui: este item só move código. A sincronização é refeita no item 6.

**Pronto quando:** o app publicado se comporta exatamente igual e todos os testes do item 2 passam contra o build.

### 4. 🧱 Atualização automática do app

**Por quê:** hoje é preciso lembrar de subir `CACHE_VERSION` em [sw.js](sw.js) a cada mudança; com vários arquivos, esquecer fica mais fácil e o celular fica com uma versão misturada.

- [x] Gerar o service worker com o `vite-plugin-pwa` (Workbox, modo `injectManifest` a partir de [src/sw.js](src/sw.js)): versão e lista de arquivos saem do build, e o `sw.js` manual foi removido. Tudo vai para o cache na instalação, inclusive GIFs e o SDK do Firebase (~7,6 MB), e parâmetros na URL (ex.: `?emulator`) não impedem o uso do cache.
- [x] Manter o nome `sw.js` e o mesmo escopo. Quem ainda tem o `sw.js` antigo (caches `meu-treino-*`) passa para o novo sem precisar tocar em "Atualizar", porque o app antigo não sabe mostrar o aviso; os caches antigos são apagados.
- [x] Mostrar no app o aviso "Nova versão disponível — Atualizar" quando o service worker novo estiver pronto (`registerType: 'prompt'`). O app também procura versão nova ao voltar para o primeiro plano, e mostra a versão (data + commit) no rodapé.
- [x] Teste de ponta a ponta ([tests/e2e/update.spec.js](tests/e2e/update.spec.js)): serve dois builds seguidos e verifica o aviso e a atualização; também testa abrir sem internet e a passagem a partir do `sw.js` antigo.

**Pronto quando:** um push no `main` chega ao celular sem edição manual de versão, e o usuário vê o aviso de atualização.

### 5. 🧱 Versão do formato dos dados + migrações

**Por quê:** a fase 3 muda o formato dos dados de quem já usa o app.

- [x] Gravar a versão nos dados locais (`treino.schemaVersion`; sem ela, os dados são v1) e na nuvem (campo `schema` do documento, que já existia). O formato atual é a v1 (`SCHEMA_VERSION` em [src/migrations.js](src/migrations.js)).
- [x] Lista ordenada de migrações (`MIGRATIONS`, hoje vazia), aplicadas ao abrir o app (`prepareLocalData`) e ao receber dados da nuvem (`migrateRemote`). Uma migração que falha não grava nada.
- [x] Guardar uma cópia dos dados antigos antes de migrar: no celular em `treino.backupBeforeMigration` (`restoreBackup()` desfaz), na nuvem nos campos `previousPayload`/`previousSchema` do mesmo documento.
- [x] Dados de versão mais nova: localmente, o app mostra "Atualize o app" e não lê nem grava nada; na nuvem, o backup não é lido nem sobrescrito e a seção de backup pede para atualizar, enquanto o treino continua sendo registrado no celular.
- [x] Migração de exemplo testada (histórico antigo → uma linha por série, em [tests/unit/migrations.test.js](tests/unit/migrations.test.js)), com a sugestão de carga conferida antes e depois.
- [ ] Testar cada migração com dados reais anonimizados. Por enquanto os testes usam [tests/unit/fixtures/dados-v1.json](tests/unit/fixtures/dados-v1.json), montado à mão com todos os formatos que existem hoje; falta trocar por uma exportação anonimizada do celular dela antes da primeira migração de verdade (item 6).

**Pronto quando:** existe uma migração de exemplo testada e o app recusa com segurança dados de uma versão mais nova que ele não conhece.

---

## Fase 3: base para vários usuários

### 6. 🧱 Novo modelo de dados

**Por quê:** é a base para fichas personalizadas, para o modo personal e para histórico sem limite.

**Biblioteca de exercícios:** [src/data/exercises.json](src/data/exercises.json), com id fixo, nome, grupo muscular, GIF, instruções e incremento de carga: os 21 exercícios da ficha atual, mais 36 comuns (sem GIF por enquanto) para o editor do item 7. Um exercício fora da biblioteca, criado pela pessoa, leva o próprio nome na ficha.

**Firestore:**

```
users/{uid}                    perfil: nome, titulo, activePlanId, lastSessionAt, profileUpdatedAt, schema,
                               trainers: { trainerUid: true } (isTrainer entra no item 12)
users/{uid}/plans/{planId}     ficha: nome, treinos[{ id, nome, exercicios[{ exerciseId, nome?, series, reps, descanso, obs }] }],
                               createdBy, updatedBy, updatedAt, deleted?
users/{uid}/sessions/{id}      treino finalizado: date, planId, workoutId, workoutNome, workoutNote, doneCount, totalCount,
                               exercises[{ exerciseId, nome, note, sets[{ weight, reps, done }], setsDone, setsTotal }],
                               updatedAt (apagado: só { deleted: true })
users/{uid}/state/current      últimos valores digitados: values{ 'treino|exercício': { sets, note, updatedAt } }
invites/{codigo}               convite de personal: trainerUid, expiresAt (item 12)
```

Todo documento leva `syncedAt` (hora do servidor), e cada sincronização só busca o que mudou desde a anterior. Diferenças em relação ao plano: a ficha ativa fica no perfil (`activePlanId`) em vez de um campo `ativa` em cada ficha, para nunca haver duas ativas; a versão continua no campo `schema`, que o app antigo já lê; os nomes dos campos do treino seguem os que o código já usava.

- [x] Ids fixos para fichas, treinos e exercícios. Os últimos valores passaram de `"A|Agachamento"` para `"A|agachamento"` (id do treino + id do exercício); os treinos da ficha migrada mantêm as letras como id.
- [x] Um documento por treino finalizado, o que elimina o limite de 50 treinos e o risco de passar de 1 MB num documento só. Treino apagado vira `{ deleted: true }`, para os outros celulares saberem.
- [x] Regras do Firestore ([firestore.rules](firestore.rules), testadas em [tests/rules/](tests/rules/firestore.rules.test.js) com aluno, personal autorizado, personal removido e pessoa sem vínculo):
  - o aluno lê e escreve tudo que é dele;
  - um personal listado em `trainers` pode ler o perfil, ler o histórico e criar/editar fichas (com `updatedBy` = ele), mas não pode apagar fichas ou treinos, gravar treinos nem alterar o perfil;
  - só o próprio aluno grava a lista `trainers`.
- [x] Migração dos dados atuais (`migrateV1toV2` em [src/migrations.js](src/migrations.js)): a ficha A/B/C/D vira a primeira ficha da usuária atual, e o histórico e os últimos valores passam para os novos ids. Testado contra uma cópia congelada do código da v1: a sugestão de carga e os valores dos campos saem iguais para todos os exercícios. No histórico, os treinos do formato antigo (uma carga por exercício) passam a mostrar uma linha por série, e o nome do treino aparece completo ("Treino A - Inferiores"). O backup v1 na nuvem é migrado na primeira sincronização e fica guardado em `previousPayload`.
- [x] `lastSessionAt` no perfil, atualizado ao finalizar um treino, para a lista de alunos do personal (item 12) não precisar de uma consulta por aluno. O personal lista os alunos com `where('trainers.<uid>', '==', true)` em `users`.
- [x] **Decisão: armazenamento local → `localStorage`** (opção 1). Um treino ocupa ~1 KB, então os ~5 MB dão para mais de 15 anos a 5 treinos por semana; se uma gravação falhar, o app avisa na tela. O teste da opção 3 (2026-10-07, no emulador) mostrou que ela quebra o princípio 1: sem internet o login anônimo falha, e o que é gravado antes do primeiro login some da vista e nunca é enviado; num segundo celular, vincular uma conta Google que já existe dá `credential-already-in-use` e os dados anônimos ficam presos. Ela também precisaria de armazenamento e mesclagem próprios, e o SDK (175 KB gzip) teria de carregar antes de mostrar o treino. As opções eram:
  1. `localStorage` (como hoje) + sincronização própria;
  2. IndexedDB + sincronização própria;
  3. cache offline do Firestore (`persistentLocalCache`) como único banco, com login anônimo vinculado depois à conta Google (`linkWithPopup`). Elimina o `mergeCloudData` e a fila de envio própria.

  Pontos a verificar na opção 3: o primeiro acesso sem internet (o login anônimo precisa de rede, e o princípio 1 não pode ser quebrado); o cache configurado sem limite (`CACHE_SIZE_UNLIMITED`), para não perder dados por coleta de lixo; transações não funcionam offline; "última gravação vence" por campo nas fichas; o peso do SDK na primeira abertura; o treino em andamento continua só local.
- [x] Adaptar `computeSuggestion` e a sincronização ao novo formato. A sincronização não usa mais transação: busca o que mudou, mescla (`mergeData`, em [src/sync.js](src/sync.js)) e envia só o que mudou no celular, em lotes.

**Pronto quando:** a usuária atual abre o app depois da atualização e tudo está igual, com os dados já no novo formato no celular e na nuvem.

### 7. ✨ Editor de treinos + modelos prontos

- [x] Criar, renomear, duplicar e apagar fichas; escolher a ficha ativa (botão 📋 no topo do treino → tela "Fichas", que também tem o perfil: nome e título do app).
- [x] Dentro da ficha: criar treinos, reordenar e escolher exercícios da biblioteca com busca (sem acento, por nome ou grupo muscular), além de definir séries, faixa de reps (mín./máx.), descanso e observações (aparecem no cartão do exercício). Exercício fora da biblioteca: "Criar exercício" com o nome digitado.
- [x] Modelos prontos em [src/data/templates.js](src/data/templates.js): a ficha A/B/C/D, "Corpo inteiro A/B" e "ABC: empurrar, puxar e pernas".
- [x] Reordenar com botões ↑/↓ (arrastar e soltar é opcional, só se fizer falta no uso).
- [x] Componentes do editor reaproveitáveis pelo modo personal (item 12): [src/ui/editor/PlanEditor.jsx](src/ui/editor/PlanEditor.jsx) recebe a ficha e `onChange`, sem ler o store. As telas usam o `#` da URL, então o botão voltar do Android funciona.

**Pronto quando:** uma pessoa nova consegue montar a própria ficha do zero no celular sem ajuda.

### 8. ✨ Primeiro acesso

- [x] Tela de boas-vindas na primeira abertura ([src/ui/Welcome.jsx](src/ui/Welcome.jsx)): nome, "Entrar com Google" (recomendado, mas opcional; sem internet, fica para depois) e a escolha entre um modelo e uma ficha do zero (que abre o editor).
- [x] Título e textos usando o nome da pessoa: "Treino de <nome>", ou um título escolhido no perfil. "Treino do Meu Benzinho" saiu das telas e só existe na migração, que o põe como título da usuária atual.
- [x] Ao entrar com uma conta que já tem dados na nuvem (inclusive um backup v1), restaurar os dados em vez de mostrar a configuração inicial. "Começar" fica desativado enquanto a nuvem está sendo lida, para não criar uma ficha repetida.
- [x] Depois do primeiro acesso, o app abre direto no treino, sem pedir login de novo.

**Pronto quando:** alguém que nunca viu o app instala, configura e registra um treino em poucos minutos.

---

## Fase 4: qualidade e abertura para outras pessoas

### 9. ✨ Editar treinos já finalizados

**Por quê:** um erro de digitação muda a sugestão de carga do próximo treino, e hoje a única saída é apagar o treino inteiro.

- [x] Editar carga, reps, séries feitas e observações de um treino do histórico: botão "✏️ Editar" no treino aberto no histórico, com todos os exercícios (inclusive os que ficaram em branco) e a observação do treino; só grava ao tocar em "Salvar" (`updateHistoryEntry` em [src/store.js](src/store.js)). Os últimos valores digitados no treino em andamento não mudam.
- [x] Recalcular a sugestão de carga depois da edição: ela já é calculada a partir do histórico, então acompanha a correção. As contagens (séries feitas por exercício, exercícios concluídos) só são refeitas onde as séries marcadas mudaram, porque os treinos antigos migrados da v1 têm contagens que não dá para tirar das séries. A edição leva `updatedAt` novo e vai para a nuvem como qualquer mudança (vence o editado por último).

**Pronto quando:** um erro de digitação num treino finalizado se corrige no próprio histórico, e a sugestão do próximo treino já sai certa. Testado em [tests/unit/edit-history.test.js](tests/unit/edit-history.test.js) e no teste de ponta a ponta "corrigir um treino do histórico".

### 10. 🧱 O mínimo antes de divulgar

Tudo fica na tela "Privacidade e seus dados" ([src/ui/PrivacyScreen.jsx](src/ui/PrivacyScreen.jsx), `#privacidade`), com link no fim do treino, nas fichas e na tela de boas-vindas.

- [x] **Excluir conta:** apagar todos os dados da nuvem e a conta do Firebase Auth (LGPD). `deleteCloudAccount` em [src/cloud.js](src/cloud.js) apaga `plans`, `sessions` e `state`, depois o documento do usuário e por fim a conta; se o login tiver mais de 4 minutos, pede o login de novo antes de apagar qualquer coisa (o Firebase só exclui contas com login recente). Em seguida apaga os dados do celular e volta à tela de boas-vindas. Sem login, o mesmo botão apaga só o celular. Outro aparelho com a mesma conta percebe na próxima sincronização (o documento do usuário sumiu depois de já ter sido sincronizado), sai da conta sem reenviar nada e mantém os treinos que estão nele.
- [x] **Exportar dados:** baixar o histórico (LGPD: portabilidade). Tudo em JSON (perfil, fichas, histórico, últimos valores e treino em andamento) e o histórico em planilha CSV, uma linha por série ([src/export.js](src/export.js)).
- [x] Texto curto de privacidade dentro do app: quais dados são guardados, onde e para quê.
- [x] Contato de quem responde pelos dados no texto de privacidade (a LGPD pede a identificação e o contato do controlador): por enquanto `empulse.impulse@gmail.com` (`PRIVACY_CONTACT` em [src/ui/PrivacyScreen.jsx](src/ui/PrivacyScreen.jsx)), a trocar por um endereço mais formal no futuro.
- [x] Restringir a chave da API (apiKey) no Google Cloud a `ledu55.github.io/*` e `localhost`. Produção: sites `ledu55.github.io` e `treino-app-21fcd.firebaseapp.com`; dev: `localhost:8000` e `treino-app-dev-306d2.firebaseapp.com`. As APIs já vinham limitadas pelo Firebase, com a Cloud Firestore API incluída. Login e backup testados no celular (produção) e em `localhost` (dev) em 2026-10-09. Passo a passo no [README](README.md#antes-de-divulgar-passos-manuais).
- [x] Alerta de orçamento no Firebase/Google Cloud. Não se aplica: o projeto está no plano Spark (gratuito, conferido em 2026-10-09), que não tem cobrança. Passada a cota do dia, o backup para até o dia seguinte e o app continua funcionando no celular. Se um dia mudar para o Blaze, criar o alerta antes (ver o [README](README.md#antes-de-divulgar-passos-manuais)).
- [x] Monitoramento de erros (ex.: Sentry no plano gratuito), para saber quando algo falha no celular de outra pessoa. [src/monitoring.js](src/monitoring.js): só na produção, com o SDK carregado sob demanda (~32 KB gzip, num arquivo próprio), relatórios guardados no celular quando não há internet, sem IP, sem e-mail, sem registro de toques e requisições e sem contar aberturas do app. Além dos erros não tratados, envia as falhas de backup, login, migração, gravação no celular e exclusão de conta. Projeto no Sentry criado em 2026-10-09 (região US), com "Prevent Storing of IP Addresses" ligado e Allowed Domains só `ledu55.github.io`; o DSN está em `SENTRY_DSN`. Com ele, o texto de privacidade cita o Sentry.

**Pronto quando:** dá para indicar o app para alguém fora da família sem riscos legais ou de custo. Testado em [tests/unit/export.test.js](tests/unit/export.test.js), [tests/e2e/privacy.spec.js](tests/e2e/privacy.spec.js) e no teste de ponta a ponta "excluir conta" (no emulador, com um segundo aparelho).

### 11. ✨ Gráficos e recordes pessoais

- [ ] Gráfico de carga (e volume) ao longo do tempo por exercício.
- [ ] Aviso de recorde pessoal ao finalizar um treino ("🏆 Novo recorde no Agachamento: 42,5 kg").
- [ ] Frequência semanal ("3 treinos esta semana").

### 12. ✨ Modo personal

**Depende de:** 6 (regras e modelo), 7 (editor) e 11 (gráficos).

- [ ] Ativar o perfil de personal numa conta.
- [ ] O personal gera um código de convite com validade; o aluno digita o código e confirma o acesso.
- [ ] Lista de alunos do personal, com o último treino de cada um (`lastSessionAt`).
- [ ] Editar a ficha de um aluno com o mesmo editor do item 7.
- [ ] Para o aluno, a ficha montada pelo personal é só leitura na estrutura (exercícios, séries, reps, descanso); cargas e reps continuam sendo registradas normalmente. Para mudar a estrutura, o aluno usa "Duplicar ficha" e a cópia passa a ser dele. Garantido pelas regras do Firestore via `createdBy`.
- [ ] Ver o histórico e os gráficos do aluno.
- [ ] Aviso para o aluno: "Ficha atualizada pelo seu personal".
- [ ] O aluno vê quem tem acesso e pode remover.
- [ ] Testes das regras: personal autorizado, personal removido, personal sem vínculo e aluno tentando alterar a estrutura de uma ficha do personal.
- [ ] Atualizar o texto de privacidade (quem mais vê os dados) e a exclusão de conta (convites e vínculos com o personal).

### 13. ✨ Refinamentos

- [ ] Timer de descanso confiável. Ela continua iniciando o timer manualmente; iniciar o timer automaticamente foi recusado.
  - Manter a tela ligada durante o treino com a Wake Lock API (pedir de novo quando o app volta ao primeiro plano).
  - Calcular o timer pela hora de término, não por contagem de ticks, para ele estar certo ao voltar ao app.
  - Avisar na interface que o alarme depende da tela ligada.
  - Alarme com a tela desligada fica fora: tanto o Android quanto o iOS suspendem o JavaScript em segundo plano, e um aviso confiável exigiria push vindo de um servidor. Reavaliar só se fizer falta no uso.
- [ ] Outros ajustes conforme o uso.

---

## Decisões já tomadas

| Tema | Decisão |
|---|---|
| Progressão de carga | Progressão dupla; incremento por exercício (2,5 kg padrão, 1 kg em halteres/isolados); sugestão exibida com botão "Usar", sem preencher automaticamente |
| Backup | Firebase com login Google, sincronização automática |
| Página de login | Não bloqueia o app; o login entra no primeiro acesso (item 8) e continua opcional |
| Quem monta as fichas | Os dois: cada pessoa e, opcionalmente, um personal autorizado pelo aluno |
| Build | Vite + `vite-plugin-pwa`, publicado no GitHub Pages pelo GitHub Actions (item 3) |
| Interface | Preact (JSX + hooks); regras de cálculo em JS puro, fora dos componentes |
| Ficha montada pelo personal | Só leitura na estrutura para o aluno, que registra cargas normalmente e pode duplicar a ficha para ter uma cópia própria |
| Timer com a tela desligada | Fora do escopo; manter a tela ligada com Wake Lock (item 13) |
| Ordem das fases | A reestruturação (item 3) continua separada do novo modelo de dados (item 6), para os testes garantirem que nada mudou |
| Armazenamento local | `localStorage`, com o `storage.js` isolado para trocar por IndexedDB se um dia precisar (item 6) |
| Plano do Firebase | Spark (gratuito), sem risco de cobrança; mudar para o Blaze só com alerta de orçamento criado antes (item 10) |
| Recusados | Iniciar o timer de descanso automaticamente; modo escuro |

## Decisões em aberto

Nenhuma no momento.
