# Roadmap — Meu Treino

Plano de evolução do app: hoje ele atende uma pessoa, e o objetivo é que várias pessoas usem, cada uma com fichas personalizadas, montadas por ela mesma ou por um personal.

## Onde estamos

- PWA de arquivo único ([meu_treino_app.html](meu_treino_app.html), ~1.500 linhas), publicado no GitHub Pages; [sw.js](sw.js) guarda o app em cache para uso offline.
- Ficha de treinos (A/B/C/D) escrita direto no código, no objeto `treinos`.
- Dados no `localStorage`: últimos valores digitados, treino em andamento e histórico (limitado a 50 treinos).
- Registro de carga e reps por série, histórico de treinos, timer de descanso.
- Sugestão de carga por progressão dupla (`computeSuggestion`).
- Backup na nuvem com login Google (Firebase Auth + Firestore, projeto `treino-app-21fcd`): um documento por usuário em `users/{uid}`, sincronizado com `mergeCloudData`.
- Testes automáticos (Vitest, Playwright, regras no emulador) rodando no GitHub Actions; ainda sem ferramenta de build.

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
- [ ] Separar o CSS em `src/app.css`.
- [ ] Separar o JS em módulos. Sugestão de divisão:
  - `src/storage.js`: leitura/gravação local
  - `src/progression.js`: sugestão de carga
  - `src/cloud.js`: Firebase e sincronização (o SDK passa a vir do npm em vez do gstatic, ainda carregado sob demanda com `import()`)
  - `src/timer.js`: descanso e alarme
  - `src/ui/*.jsx`: telas como componentes Preact
- [ ] Reescrever a renderização em componentes Preact, o que também elimina os `onclick="..."` do HTML. As regras de cálculo (`storage`, `progression`, `cloud`, `timer`) ficam em JS puro, sem depender do Preact, para continuarem testáveis isoladamente.
- [ ] Manter os mesmos textos, classes CSS e atributos usados pelos testes de ponta a ponta, para que eles provem que nada mudou.
- [ ] Renomear `meu_treino_app.html` para `index.html`, mantendo um redirecionamento no nome antigo (em `public/`) para quem já tem o app instalado.
- [ ] Testes: os de unidade importam os módulos direto, em vez de carregar o HTML no jsdom; os de ponta a ponta rodam contra o build (`vite preview`), que é o que vai para o celular.
- [ ] Não melhorar a sincronização atual aqui: este item só move código. A sincronização é refeita no item 6.

**Pronto quando:** o app publicado se comporta exatamente igual e todos os testes do item 2 passam contra o build.

### 4. 🧱 Atualização automática do app

**Por quê:** hoje é preciso lembrar de subir `CACHE_VERSION` em [sw.js](sw.js) a cada mudança; com vários arquivos, esquecer fica mais fácil e o celular fica com uma versão misturada.

- [ ] Gerar o service worker com o `vite-plugin-pwa` (Workbox): versão e lista de arquivos saem do build, e o `sw.js` manual é removido.
- [ ] Manter o nome `sw.js` e o mesmo escopo, para que o service worker já instalado no celular seja substituído pelo novo e não fique um antigo servindo cache velho.
- [ ] Mostrar no app o aviso "Nova versão disponível — Atualizar" quando o service worker novo estiver pronto (`registerType: 'prompt'`).
- [ ] Teste de ponta a ponta: servir dois builds seguidos e verificar que o aviso aparece e que a página atualiza.

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
users/{uid}                    perfil: nome, isTrainer, trainers: { trainerUid: true }, lastSessionAt, schemaVersion
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
- [ ] `lastSessionAt` no perfil, atualizado ao finalizar um treino, para a lista de alunos do personal (item 12) não precisar de uma consulta por aluno. O personal lista os alunos com `where('trainers.<uid>', '==', true)` em `users`.
- [ ] **Decisão: armazenamento local.** O histórico deixa de ter limite, e o `localStorage` tem ~5 MB. Antes de decidir, fazer um teste rápido da opção 3:
  1. `localStorage` (como hoje) + sincronização própria;
  2. IndexedDB + sincronização própria;
  3. cache offline do Firestore (`persistentLocalCache`) como único banco, com login anônimo vinculado depois à conta Google (`linkWithPopup`). Elimina o `mergeCloudData` e a fila de envio própria.

  Pontos a verificar na opção 3: o primeiro acesso sem internet (o login anônimo precisa de rede, e o princípio 1 não pode ser quebrado); o cache configurado sem limite (`CACHE_SIZE_UNLIMITED`), para não perder dados por coleta de lixo; transações não funcionam offline; "última gravação vence" por campo nas fichas; o peso do SDK na primeira abertura; o treino em andamento continua só local.
- [ ] Adaptar `computeSuggestion` e a sincronização ao novo formato.

**Pronto quando:** a usuária atual abre o app depois da atualização e tudo está igual, com os dados já no novo formato no celular e na nuvem.

### 7. ✨ Editor de treinos + modelos prontos

- [ ] Criar, renomear, duplicar e apagar fichas; escolher a ficha ativa.
- [ ] Dentro da ficha: criar treinos, reordenar e escolher exercícios da biblioteca com busca, além de definir séries, faixa de reps, descanso e observações.
- [ ] Modelos prontos (a ficha A/B/C/D atual vira o primeiro modelo).
- [ ] Reordenar com botões ↑/↓ (arrastar e soltar é opcional, só se fizer falta no uso).
- [ ] Componentes do editor reaproveitáveis pelo modo personal (item 12).

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
- [ ] Lista de alunos do personal, com o último treino de cada um (`lastSessionAt`).
- [ ] Editar a ficha de um aluno com o mesmo editor do item 7.
- [ ] Para o aluno, a ficha montada pelo personal é só leitura na estrutura (exercícios, séries, reps, descanso); cargas e reps continuam sendo registradas normalmente. Para mudar a estrutura, o aluno usa "Duplicar ficha" e a cópia passa a ser dele. Garantido pelas regras do Firestore via `createdBy`.
- [ ] Ver o histórico e os gráficos do aluno.
- [ ] Aviso para o aluno: "Ficha atualizada pelo seu personal".
- [ ] O aluno vê quem tem acesso e pode remover.
- [ ] Testes das regras: personal autorizado, personal removido, personal sem vínculo e aluno tentando alterar a estrutura de uma ficha do personal.

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
| Recusados | Iniciar o timer de descanso automaticamente; modo escuro |

## Decisões em aberto

- Armazenamento local: `localStorage`, IndexedDB ou cache offline do Firestore com login anônimo (item 6, depois de um teste rápido).
