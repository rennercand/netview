# Family Stream

Biblioteca audiovisual familiar privada. Fundação (Fase 0) e MVP essencial (Fase 1), com frontend básico: login, biblioteca, busca, agrupamento por série/temporada, player, envio de arquivos, aprovação e gerenciamento de membros/sessões.

## Arquitetura e decisões

- `apps/web`: React + Vite + TypeScript + React Router + TanStack Query + Tailwind. Sem tokens em localStorage, service worker ou cache offline de mídia.
- `apps/api`: Fastify REST em `/api/v1`, Zod, Pino, RBAC e proteção CSRF. Sem CORS aberto. Swagger em desenvolvimento apenas.
- `apps/worker`: BullMQ + Redis, FFprobe e FFmpeg remoto para metadados e thumbnail. Não baixa o original para disco e não mantém vídeo inteiro em RAM. Uma tarefa por vez, limites de tempo e buffers de 1 MiB para saída do processo. O consumo do decoder depende da resolução da fonte; o container limita CPU/RAM.
- `packages/database`: PostgreSQL/Prisma com adapter `pg`, UUIDs, relações, índices, migrations SQL e constraints. Produção: **Neon**, `DATABASE_URL` pooled para runtime e `DIRECT_URL` sem pooler para migrations.
- `packages/storage`: adaptador S3 privado compatível com R2/MinIO. Banco guarda somente metadados e chaves opacas; originais e capas ficam no storage.
- `packages/auth` e `packages/shared`: políticas, Argon2id, hashes de sessão e contratos compartilhados.

Uploads multipart vão **direto do cliente para R2** em partes de 10 MiB. A API reserva quota atomicamente, assina tamanho e validade de cada parte, confirma ETags/tamanhos no storage e agenda processamento por outbox SQL e notifica a fila logo após o commit. Os arquivos ficam prontos apenas após validação real do contêiner e dos codecs. MP4/H.264 8-bit (`yuv420p`) e áudio AAC são aceitos para reprodução; outros codecs ficam `INCOMPATIBLE`. Não há transcodificação/HLS no MVP.

Por padrão, reprodução vai **direto ao R2**, com concessão somente para um objeto e validade de 120 segundos. O player renova o acesso preservando a posição. A API revalida sessão/grupo a cada concessão. Uma concessão anterior continua utilizável até expirar, inclusive após revogação; uma requisição já iniciada pode continuar. `PLAYBACK_DELIVERY=gateway` oferece alternativa com validação a cada requisição HTTP Range, sem gravar o vídeo localmente, mas consome a banda da hospedagem. Não registra URLs assinadas nem cookies em logs.

O ADMIN tem visão global. HOST gerencia membros e arquivos de seu grupo, mas **não aprova pedidos públicos globais**; essa aprovação é exclusiva do ADMIN no MVP. MEMBER assiste e só envia com permissão explícita. Suspensão de grupo revoga acesso nas consultas seguintes. Não existe cadastro público com acesso automático.

## Desenvolvimento local

Requisitos: Node.js >= 22.14, pnpm 11.25.0, Docker Compose v2. Para executar fora de containers, FFmpeg/FFprobe no PATH. Use o checkout existente; tarefas cloud já são isoladas e não precisam de worktree.

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:generate

docker compose --env-file .env -f infrastructure/compose.dev.yml up -d postgres redis minio
pnpm exec tsx --env-file=.env infrastructure/scripts/init-storage.ts
pnpm exec tsx --env-file=.env infrastructure/scripts/migrate.ts
```

Em ambientes com HOME somente leitura, acrescente `--store-dir /tmp/family-pnpm-store` à instalação e use `DOCKER_CONFIG=/tmp/family-docker` para builds. Isso é uma configuração local, não uma exigência da aplicação.

Crie o primeiro administrador **sem credenciais padrão**. Defina temporariamente `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` (mínimo de 12 caracteres) no ambiente, por um gerenciador de segredos ou prompt seguro; nunca passe senha na linha de comando, não a registre em `.env.example` nem em histórico. Então:

```sh
pnpm exec tsx --env-file=.env infrastructure/scripts/create-admin.ts
```

O comando cria a conta ACTIVE e um grupo HOST; não redefine contas existentes. Remova as variáveis temporárias após a execução.

Para desenvolvimento com Vite (origem `http://localhost:5173` em `.env`), execute em terminais separados:

```sh
pnpm exec tsx --env-file=.env apps/api/src/main.ts
pnpm exec tsx --env-file=.env apps/worker/src/main.ts
pnpm --filter @family/web dev
```

Para a stack completa em containers, a origem usada é `http://localhost:8080`:

```sh
docker compose --env-file .env -f infrastructure/compose.dev.yml up --build -d
```

Nesse modo, `S3_PUBLIC_ENDPOINT=http://localhost:9000` é a URL alcançável pelo navegador; `S3_ENDPOINT=http://minio:9000` é a URL interna dos containers. Troque `localhost` pelo endereço real somente quando publicar e revise CORS/origem. O exemplo local usa credenciais descartáveis **somente** em serviços vinculados a `127.0.0.1`; produção usa Neon/R2 e exige segredos próprios.

A imagem MinIO de desenvolvimento está fixada por digest no arquivo Compose. É uma imagem Bitnami Legacy de testes, sem garantia de atualizações; não a use em produção. Produção usa R2. MinIO usa CORS global explícito por `MINIO_API_CORS_ALLOW_ORIGIN` porque não implementa PutBucketCors nessa versão. O worker limpa uploads expirados; configure também a limpeza de multipart incompleto no provedor de produção.

## Organização de vídeos e ingestão em viagem

`Minha Série - S01E02 - Festa.mp4` → série "Minha Série", temporada 1, episódio 2, título "Festa". Aceita também `Minha.Serie.S01E02.mp4`. Sem padrão, o arquivo vira vídeo avulso. Não busca dados externos. A API permite editar título/série/temporada/episódio após upload.

No navegador, um HOST/ADMIN ou membro autorizado usa "Enviar arquivo". Se houver interrupção, selecione o upload aberto e o mesmo arquivo para retomar as partes já enviadas; o cancelamento libera quota e apaga o multipart. Use exatamente o mesmo conteúdo, não apenas um arquivo com nome/tamanho coincidentes. Após 24 horas sem finalizar, a limpeza cancela o upload. Se a API cair durante finalização, o estado COMPLETING conserva a reserva até a limpeza e permite reenviar depois; a recuperação automática desse caso será aprimorada.

Para uma pasta já baixada do Google Drive em **seu computador provisório**, defina `INGEST_API_ORIGIN`, `INGEST_EMAIL`, `INGEST_PASSWORD` no ambiente seguro desse computador e rode:

```sh
pnpm ingest --path /pasta/videos --group UUID_DO_GRUPO
pnpm ingest --path /pasta/video.mp4 --group UUID_DO_GRUPO --resume UUID_DO_UPLOAD
```

A CLI percorre a pasta, envia apenas `.mp4` diretamente para o storage com streams limitados, usa a mesma autenticação/quota/permissões da web, e registra metadados pela API. Não importa vídeos no disco do servidor. Não há integração OAuth com Google Drive ou importação silenciosa de catálogos. A CLI não mantém credenciais depois do processo e faz logout ao terminar.

## Neon, R2 e hospedagem

Para começar no seu próprio computador instalando somente Docker, veja [o guia local com Neon e R2](docs/LOCAL.md). Ele usa `infrastructure/compose.local.yml`, com acesso apenas neste computador, sem PostgreSQL/MinIO locais.

Veja [guia de produção](docs/DEPLOY.md) para requisitos Neon, CORS R2, Redis, HTTPS e containers. A hospedagem pode ser VPS, Railway ou Render, desde que suporte worker persistente, FFmpeg e Redis. Não pressuponha que todos os serviços cabem em plano gratuito nem que serviços suspensos processam jobs. Não faça deploy antes de configurar os segredos e validar custos/limites.

`DATABASE_URL` e `DIRECT_URL` devem usar `sslmode=verify-full` em produção, verificando o certificado TLS do Neon. O Neon guarda dados textuais, mas logs/catálogo/índices crescem; monitore o uso do plano. R2 Standard tem egress sem cobrança; armazenamento, operações e eventuais classes de acesso/recuperação têm custos próprios. Não trate a fatura como somente espaço em disco.

O worker reconcilia a outbox a cada hora em produção (`OUTBOX_RECONCILE_MS`, 5 segundos no desenvolvimento). A fila é notificada imediatamente no fluxo normal; se essa notificação falhar, o SQL conserva o job para a reconciliação. A API verifica dependências reais ao iniciar; o healthcheck periódico usa `/health` sem consultar o Neon. `/ready` continua disponível para checagem completa sob demanda. Isso evita manter o banco acordado apenas por polling/healthchecks quando não há uso, mas não garante custo zero nem caber no plano gratuito.

## Migrations

`pnpm db:generate` usa o gerador oficial do Prisma e WASM empacotado, sem banco/segredos nem download de engine nativo. O adapter runtime `pg` dispensa binários nativos.

`pnpm db:migrate` aplica o SQL versionado com conexão **direta**, advisory lock, transação por migration, histórico `_prisma_migrations` compatível e SHA-256. Reruns não reaplicam SQL; alteração do checksum de uma migration aplicada é rejeitada. Novas migrations devem ser arquivos novos, nunca reescrever as publicadas. O bootstrap inicial pode falhar de forma segura num banco não vazio sem histórico; não há reset automático. Para gerar diffs com a CLI padrão do Prisma, permita `binaries.prisma.sh`; `PRISMA_JS_MIGRATIONS=1` habilita seu engine experimental somente para geração/diff em desenvolvimento. Não usamos esse engine experimental para aplicar migrations de produção.

## Verificações

```sh
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm build
```

Integração precisa de PostgreSQL/Redis/MinIO reais e um banco separado com sufixo `_test`. O runner recusa banco sem esse sufixo e limpa somente seus próprios registros/chaves. Prepare o banco de teste uma vez:

```sh
docker compose --env-file .env -f infrastructure/compose.dev.yml exec -T postgres createdb -U family family_stream_test
```

Defina `DATABASE_URL` e `DIRECT_URL` apontando para `family_stream_test` (por exemplo num arquivo **ignorado** `.env.test`, com demais variáveis copiadas de `.env`) e execute:

```sh
pnpm exec tsx --env-file=.env.test infrastructure/scripts/migrate.ts
pnpm exec tsx --env-file=.env.test infrastructure/scripts/run-integration.ts
```

E2E (mesmo banco isolado, FFmpeg disponível):

```sh
pnpm exec playwright install --with-deps chromium
pnpm exec tsx --env-file=.env.test infrastructure/scripts/run-e2e.ts
```

Se houver Chromium instalado, defina `CHROMIUM_PATH` para o executável e dispense o download. Os testes iniciam API, Vite e worker, exercitam desktop e viewport móvel e limpam sua própria mídia. Não gravam trace, screenshot nem vídeo que possa conter concessões de reprodução.

Não rode integração contra seu banco Neon de produção. O worker é iniciado pelo teste e finalizado ao concluir. O teste cria um MP4 real, envia ao MinIO, verifica processamento, codecs, capa, Range, quota, CSRF, autorização e revogação. Veja [relatório de validação](docs/VALIDATION.md) para resultados realmente executados, E2E e limitações.

## Próximas fases

Fase 2: pareamento com código de uso único e credencial DEVICE restrita, `/tv`, controles direcionais e validação em aparelhos reais. Fase 3: transcodificação, HLS com autorização de todos os segmentos, legendas, melhor recuperação de finalização e gerenciamento granular de compartilhamento. Fase 4: deploy escolhido, backup/restore automatizado, observabilidade, MFA e revisão operacional. Entidades futuras no schema não significam APIs dessas funcionalidades já implementadas.

[Especificação integral](docs/ESPECIFICACAO_FAMILY_STREAM_CODEX.md) · [Segurança](SECURITY.md) · [Compatibilidade](docs/COMPATIBILITY.md) · [Backup e restauração](docs/BACKUP.md)
