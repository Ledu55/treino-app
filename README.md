# Meu Treino

PWA de acompanhamento de treino, publicado em https://ledu55.github.io/treino-app/. Plano de evolução em [ROADMAP.md](ROADMAP.md).

## Desenvolvimento

Requisitos: Node.js 24 (LTS) e Java 21 (para o Firebase Emulator).

```sh
npm install
npx playwright install chromium   # uma vez
```

| Comando | O que faz |
|---|---|
| `npm start` | Servidor de desenvolvimento (Vite) em http://localhost:8000/treino-app/ |
| `npm run build` | Gera a versão publicada em `dist/` |
| `npm run preview` | Serve o `dist/` para conferir o build |
| `npm run emulators` | Sobe o Firebase Emulator (login, Firestore e painel em http://localhost:4000) |
| `npm test` | Sobe o emulador, roda todos os testes e desliga o emulador |
| `npm run test:unit` | Só os testes de unidade (não precisam do emulador) |
| `npm run test:e2e` | Só os testes de ponta a ponta (o de nuvem é pulado sem o emulador) |

O app fica em [src/](src/): lógica em JS puro (`storage.js`, `store.js`, `progression.js`, `sync.js`, `cloud.js`, `timer.js`, `export.js`, `monitoring.js`), biblioteca de exercícios e modelos de ficha em `src/data/` e telas em Preact (`src/ui/`). Arquivos estáticos (GIFs, ícones, manifest e `meu_treino_app.html`, que redireciona o endereço antigo) ficam em [public/](public/) e são copiados sem alteração para o build. O service worker sai de [src/sw.js](src/sw.js) com a lista de arquivos do build (`vite-plugin-pwa`), então não há versão de cache para atualizar à mão: quando sai uma versão nova, o app mostra "Nova versão disponível — Atualizar". A versão (data + commit) aparece no rodapé do app. A publicação no GitHub Pages é feita pelo GitHub Actions depois que os testes passam no `main`.

### Qual Firebase o app usa

Definido por `pickFirebaseEnv` em [src/cloud.js](src/cloud.js):

| Endereço | Firebase |
|---|---|
| `ledu55.github.io` | produção (`treino-app-21fcd`) |
| `localhost` | projeto de dev; o emulador se `?emulator` estiver na URL ou se o dev ainda não estiver configurado |
| qualquer outro | nenhum (backup escondido) |

Fora da produção, o título da seção de backup mostra o ambiente, ex.: "Backup ativo [emulator]".

### Regras do Firestore

As regras ficam em [firestore.rules](firestore.rules) e são testadas no emulador. Para publicar:

```sh
npx firebase login
npm run deploy:rules:dev    # primeiro no projeto de dev
npm run deploy:rules:prod
```

As regras precisam estar publicadas antes do app que depende delas: desde o formato v2 o backup grava em `users/{uid}/plans`, `sessions` e `state`, que as regras antigas negam (o app só mostra "Não foi possível salvar agora" e tenta de novo, sem perder nada).

### Antes de divulgar: passos manuais

Estes passos são feitos nos consoles do Google e do Sentry, fora do código (item 10 do [ROADMAP](ROADMAP.md)).

**1. Restringir as chaves da API.** As chaves do Firebase ficam visíveis no app (é normal); a restrição impede que outro site as use. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), em cada projeto, abra a chave "Browser key (auto created by Firebase)" (a mesma `apiKey` de [src/cloud.js](src/cloud.js)):

- Em "Restrições de aplicativo", escolha "Sites" e adicione:
  - produção (`treino-app-21fcd`): `https://ledu55.github.io/*` e `https://treino-app-21fcd.firebaseapp.com/*`;
  - dev (`treino-app-dev-306d2`): `http://localhost:8000/*` e `https://treino-app-dev-306d2.firebaseapp.com/*`.

  O endereço `*.firebaseapp.com` é obrigatório: a janela do login Google roda nele e usa a mesma chave. Sem ele, o login para de funcionar.
- Restrições de API: a chave criada pelo Firebase já vem limitada às APIs do Firebase. A lista aparece no alto da página da chave, acima de "Restrições de chave". Confira se ela tem Identity Toolkit API, Token Service API e Cloud Firestore API; não é preciso mexer.
- Depois de salvar (leva alguns minutos para valer), confira no celular: entrar com Google, finalizar um treino e ver "Último backup" atualizar. O emulador e os testes usam uma chave falsa e não são afetados.

**2. Alerta de orçamento.** No [Console do Firebase](https://console.firebase.google.com/project/treino-app-21fcd/usage/details), veja o plano. No Spark (gratuito) não há cobrança: passou da cota do dia, o backup para até o dia seguinte e o app continua funcionando no celular. Nesse caso não há o que configurar. No Blaze (pago por uso), crie um orçamento em Google Cloud Console → Faturamento → Orçamentos e alertas (ex.: R$ 10 por mês, com alertas em 50%, 90% e 100%).

**3. Monitoramento de erros (Sentry).** Crie uma conta no [Sentry](https://sentry.io) (plano Developer, gratuito) e um projeto "Browser JavaScript". Copie o DSN (Settings → Projects → Client Keys) para `SENTRY_DSN` em [src/monitoring.js](src/monitoring.js). No projeto, ative "Prevent Storing of IP Addresses" (Security & Privacy) e, em Allowed Domains, deixe só `ledu55.github.io`. O monitoramento só liga na produção; quando ele liga, o texto de privacidade do app passa a citar o Sentry.

### Mudanças no formato dos dados

Toda mudança no formato dos dados sobe `SCHEMA_VERSION` em [src/migrations.js](src/migrations.js) e ganha uma migração na lista `MIGRATIONS`, com teste em [tests/unit/migrations.test.js](tests/unit/migrations.test.js). As migrações rodam ao abrir o app e ao receber o backup da nuvem; antes de migrar, o app guarda uma cópia dos dados antigos (`restoreBackup()` em [src/storage.js](src/storage.js) desfaz no celular).
