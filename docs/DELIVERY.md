# Entrega Family Stream — Fase 0 e MVP essencial da Fase 1

A especificação integral foi lida e preservada em `docs/ESPECIFICACAO_FAMILY_STREAM_CODEX.md`. O repositório original continha somente README. As decisões posteriores do usuário prevalecem: Neon para metadados, R2 privado para mídia, upload direto ao storage e frontend básico. A hospedagem pública continua sem escolha; o ambiente atual é de desenvolvimento no Codex.

## Arquivos criados e organização

| Caminho                                | Conteúdo                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/`                        | Fastify, configuração, autenticação, contas, upload multipart, catálogo, playback, progresso e tratamento de erros |
| `apps/api/test/`                       | Configuração, Range e integração com PostgreSQL/Redis/storage/worker reais                                         |
| `apps/web/src/`                        | React: login, pedidos de acesso, biblioteca, busca, séries/temporadas, upload, player e gerenciamento              |
| `apps/web/e2e/`                        | Fluxo real de navegador, desktop e viewport móvel                                                                  |
| `apps/worker/src/`                     | BullMQ, reconciliação da outbox, limpeza de uploads, FFprobe e thumbnails via FFmpeg                               |
| `packages/auth/src/`                   | Argon2id, tokens, hashes, regras de acesso e testes                                                                |
| `packages/shared/src/`                 | Contratos Zod, interpretação/sanitização de nomes e testes                                                         |
| `packages/storage/src/`                | Adaptador privado S3/R2/MinIO, assinaturas multipart e leitura por stream                                          |
| `packages/database/`                   | Prisma, adapter PostgreSQL, schema, geração do cliente e runner SQL                                                |
| `packages/database/prisma/migrations/` | Migration inicial versionada com relações, índices e constraints                                                   |
| `infrastructure/`                      | Dockerfile, Compose dev/prod, Caddy e HTTPS de produção                                                            |
| `infrastructure/scripts/`              | Inicialização do storage, migrations, administrador, ingestão CLI, runners de teste e verificação de backup        |
| `.github/workflows/ci.yml`             | Lint, tipos, unitários, integração, navegador e build Docker                                                       |
| Raiz                                   | Workspace pnpm, lockfile, TypeScript, ESLint, Prettier, Vitest, Playwright, `.env.example`, README e SECURITY      |
| `docs/`                                | Especificação, implantação, compatibilidade, backup, resultados de validação e este relatório                      |

## Funcionalidades implementadas

- Cadastro gera conta pendente; ADMIN aprova/rejeita. ADMIN/HOST/MEMBER têm permissões reais, com isolamento entre grupos e autorização em cada operação de mídia.
- Senhas Argon2id, sessões armazenadas como hashes, cookies HttpOnly/SameSite Strict/Secure em produção, expiração, logout, revogação e proteção CSRF/Origin. Rate limit distribuído no Redis.
- Upload multipart diretamente ao storage privado, quota reservada atomicamente, tamanho de parte assinado, validação no storage, retomada, cancelamento e limpeza de expirados. Nenhum original é gravado no disco da API.
- CLI para enviar uma pasta MP4 de um computador provisório diretamente ao R2, com streams limitados. O banco registra metadados e chaves do objeto.
- `Minha Série - S01E02 - Festa.mp4` vira série, temporada 1, episódio 2 e título Festa; nomes sem padrão viram vídeos avulsos. Há edição posterior dos metadados.
- Worker acessa o original remotamente para validar contêiner/codecs e gerar capa; MP4 H.264/AAC compatível fica pronto, demais codecs são marcados como incompatíveis. Não existe simulação de processamento.
- Reprodução privada por concessões curtas de 120 segundos, renovadas pelo player; alternativa de gateway com HTTP Range, seek e stream sem arquivo local. Progresso é persistido.
- Migrations usam `DIRECT_URL`, lock e checksum; runtime usa `DATABASE_URL`. Em produção as URLs exigem verificação TLS completa.

## Verificações executadas

Passaram lint, tipos, formatação e build web; **17 testes unitários, 19 testes de integração e 2 testes E2E Chromium**. Foram usados vídeos reais produzidos por FFmpeg, upload efetivo, processamento, reprodução e avanço no navegador. Também passaram migration em banco vazio/reaplicação, sintaxe Compose dev/prod e exercício de dump/restore com recuperação de objeto e comparação SHA-256.

Veja [VALIDATION.md](VALIDATION.md) para o alcance e as limitações dos testes. O build Docker completo está bloqueado neste ambiente por HTTP 503 dos registries; não há comprovação de execução da imagem completa. Neon/R2 reais, TLS público, aparelhos móveis/TV e outros navegadores ainda não foram testados.

## Configuração e hospedagem

O desenvolvimento usa PostgreSQL/Redis/MinIO locais em containers. Não há aplicação publicada nem conta de provedor criada. Para produção, a recomendação atual é uma VPS básica com Docker para API/worker/web/Redis, Neon para banco e R2 para mídia; Railway/Render dependem da avaliação de planos e worker persistente.

Siga [DEPLOY.md](DEPLOY.md): configurar domínio/HTTPS, URLs Neon pooled/direta, credenciais do bucket privado R2, CORS com origem exata, lifecycle de multipart, senha Redis e primeiro administrador. Nenhuma credencial de produção foi incluída no código. Custos de worker, operações R2 e limites do Neon precisam ser conferidos.

As instruções de instalação e inicialização do ambiente Codex foram salvas como rascunho usando `cloud-environment-onboarding:setup`. Isso não publica o ambiente: revise e salve nas configurações do ambiente e depois publique para ativar o rascunho. A instalação limpa permanece dependente da recuperação do acesso aos registries.

## Commits e próximas etapas

- `a018080`: fundação e MVP essencial — enviado ao GitHub.
- `bbd02a2`: testes de navegador/CLI e redução de polling ocioso do Neon — commit local; envio encontrou HTTP 503.
- A revisão final acrescenta teste de bootstrap do administrador e este relatório; o estado de envio será informado na resposta da entrega.

Branch de trabalho: `feat/family-stream-foundation`. As mudanças não foram integradas à `main`.

Próximas etapas: escolher hospedagem, configurar Neon/R2 reais, repetir build Docker e testes nesse ambiente, implantar com HTTPS e automatizar backup/restore independente. Em seguida: recuperação automática de uploads interrompidos na finalização, TV/pareamento, HLS/transcodificação, legendas, MFA e recuperação de senha. Essas funcionalidades futuras não estão implementadas nem representadas como funcionais.
