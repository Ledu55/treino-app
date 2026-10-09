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

O app fica em [src/](src/): lógica em JS puro (`storage.js`, `store.js`, `progression.js`, `sync.js`, `cloud.js`, `timer.js`, `export.js`, `monitoring.js`, `personal.js`, `personal-cloud.js`), biblioteca de exercícios e modelos de ficha em `src/data/` e telas em Preact (`src/ui/`). Arquivos estáticos (GIFs, ícones, manifest e `meu_treino_app.html`, que redireciona o endereço antigo) ficam em [public/](public/) e são copiados sem alteração para o build. O service worker sai de [src/sw.js](src/sw.js) com a lista de arquivos do build (`vite-plugin-pwa`), então não há versão de cache para atualizar à mão: quando sai uma versão nova, o app mostra "Nova versão disponível — Atualizar". A versão (data + commit) aparece no rodapé do app. A publicação no GitHub Pages é feita pelo GitHub Actions depois que os testes passam no `main`.

### Qual Firebase o app usa

Definido por `pickFirebaseEnv` em [src/cloud.js](src/cloud.js):

| Endereço | Firebase |
|---|---|
| `ledu55.github.io` | produção (`treino-app-21fcd`) |
| `localhost` | projeto de dev; o emulador se `?emulator` estiver na URL ou se o dev ainda não estiver configurado |
| qualquer outro | nenhum (backup escondido) |

Fora da produção, o título da seção de backup mostra o ambiente, ex.: "Backup ativo [emulator]".

As chaves da API do Firebase só aceitam os endereços acima (`localhost` só na porta 8000). Se o app passar a rodar num endereço novo (outro domínio ou outra porta), inclua esse endereço nos sites permitidos da chave, no Google Cloud Console; senão o login para de funcionar.

### Regras do Firestore

As regras ficam em [firestore.rules](firestore.rules) e são testadas no emulador. Para publicar:

```sh
npx firebase login
npm run deploy:rules:dev    # primeiro no projeto de dev
npm run deploy:rules:prod
```

As regras precisam estar publicadas antes do app que depende delas (o modo personal, por exemplo, precisa da coleção `invites` e das regras de fichas do personal): desde o formato v2 o backup grava em `users/{uid}/plans`, `sessions` e `state`, que as regras antigas negam (o app só mostra "Não foi possível salvar agora" e tenta de novo, sem perder nada).

### Privacidade e dados (LGPD)

A tela "Privacidade e seus dados" ([src/ui/PrivacyScreen.jsx](src/ui/PrivacyScreen.jsx), endereço `#privacidade`) tem o texto de privacidade, a exportação (tudo em JSON e o histórico em planilha CSV, por [src/export.js](src/export.js)) e a exclusão da conta (`deleteCloudAccount` em [src/cloud.js](src/cloud.js)). O link fica no fim da tela do treino, nas fichas e na tela de boas-vindas.

Ao mudar o que o app guarda ou para onde os dados vão:

- atualize o texto de privacidade nessa tela;
- uma coleção nova dentro de `users/{uid}` precisa entrar em `USER_COLLECTIONS` ([src/cloud.js](src/cloud.js)), senão a exclusão da conta deixa esses dados para trás; dados da pessoa fora de `users/{uid}` (como os convites do modo personal, em `invites`) precisam ser apagados à parte em `deleteCloudAccount`;
- o contato de quem responde pelos dados é `PRIVACY_CONTACT`, em [src/ui/PrivacyScreen.jsx](src/ui/PrivacyScreen.jsx). Hoje é provisório: `empulse.impulse@gmail.com`.

### Monitoramento de erros

Os erros vão para o Sentry (`SENTRY_DSN` em [src/monitoring.js](src/monitoring.js)) só na produção (`ledu55.github.io`), então o desenvolvimento e os testes não enviam nada.

### Mudanças no formato dos dados

Toda mudança no formato dos dados sobe `SCHEMA_VERSION` em [src/migrations.js](src/migrations.js) e ganha uma migração na lista `MIGRATIONS`, com teste em [tests/unit/migrations.test.js](tests/unit/migrations.test.js). As migrações rodam ao abrir o app e ao receber o backup da nuvem; antes de migrar, o app guarda uma cópia dos dados antigos (`restoreBackup()` em [src/storage.js](src/storage.js) desfaz no celular).
