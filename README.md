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
| `npm start` | Serve o app em http://localhost:8000/meu_treino_app.html |
| `npm run emulators` | Sobe o Firebase Emulator (login, Firestore e painel em http://localhost:4000) |
| `npm test` | Sobe o emulador, roda todos os testes e desliga o emulador |
| `npm run test:unit` | Só os testes de unidade (não precisam do emulador) |
| `npm run test:e2e` | Só os testes de ponta a ponta (o de nuvem é pulado sem o emulador) |

### Qual Firebase o app usa

Definido por `pickFirebaseEnv` no [meu_treino_app.html](meu_treino_app.html):

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
