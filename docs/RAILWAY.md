# Family Stream no Railway Free

O usuário autorizou remover o projeto anterior `festa junina`, incluindo seu serviço e volume, para liberar o único projeto permitido. A remoção foi executada e o projeto `family-stream` criado. Nenhum upgrade pago foi solicitado. Esta conta está em Free, não em trial: o acesso inicial confirmou zero dias de trial e cerca de US$ 1 de crédito restante. O saldo muda com o uso.

Projeto: https://railway.com/project/ee09d224-4315-4552-ad21-a2e252d42843

## Configuração aplicada pela API Railway

A API atual rejeita configurar novos serviços com `railway.json`/`railway.toml` (Config as Code descontinuado). Esses arquivos foram removidos; as configurações foram aplicadas diretamente por GraphQL. A alternativa futura é Infrastructure as Code em `.railway/railway.ts`, conforme https://docs.railway.com/infrastructure-as-code. Não reinstale as receitas antigas.

- API: repositório `rennercand/netview`, Dockerfile `infrastructure/Dockerfile.railway`, comando `pnpm --filter @family/api start`, pre-deploy `pnpm db:migrate`, healthcheck `/api/v1/health`, porta 3000, uma réplica, até 0,5 GB/1 vCPU.
- Worker: mesmo Dockerfile, comando `pnpm --filter @family/worker start`, uma réplica, até 0,5 GB/1 vCPU, sem domínio público nem healthcheck HTTP. Concorrência de mídia 1 e reconciliação de uma hora.
- Redis: `redis:7.4-alpine`, senha exclusiva, domínio privado, volume de 500 MB em `/data`, AOF habilitado, `noeviction`, cache máximo 96 MB, limite 0,15 GB/0,25 vCPU. Nenhum proxy TCP/domínio público.

O plano Free exige `sleepApplication=true` nos três serviços. Não garante execução contínua do worker nem baixa latência após suspensão; as conexões Redis e o tráfego dos serviços influenciam a suspensão. Crédito gratuito não garante que os três serviços durem um mês. Verifique saldo no dashboard e pare os serviços antes de esgotá-lo.

A implementação está na branch `feat/family-stream-foundation`; `main` ainda não contém o MVP. Um deploy manual com `latestCommit=true` buscou `main` apesar da conexão inicial da branch. Por isso use o SHA exato da branch ao chamar `serviceInstanceDeploy`, ou verifique explicitamente o commit selecionado no dashboard. Não presuma que o deploy automático está funcional.

## Variáveis de produção

API/worker receberam `NODE_ENV=production`, `DATABASE_URL` Neon pooled, `REDIS_URL` por referência ao Redis privado, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET` e credenciais S3. API também recebeu `DIRECT_URL` Neon direto para migrations e `PORT=3000`. Ambas as URLs Neon usam `sslmode=verify-full`. `APP_ORIGIN=https://family-stream-faguedes.vercel.app`, `PLAYBACK_DELIVERY=direct`. Nenhuma credencial deve entrar no Git ou em variáveis Vite.

A API testa PostgreSQL, Redis e R2 antes de ouvir. `/health` serve liveness; `/ready` faz verificação de dependências. Originais ficam no R2 e uploads são diretos; FFmpeg lê por HTTP Range, sem copiar originais ao disco do servidor.

## Biblioteca pública temporária

Por escolha explícita do usuário, `/` mostra biblioteca pública somente leitura, sem formulário de login. Apenas vídeos READY do grupo indicado em `PUBLIC_LIBRARY_GROUP_ID` serão publicados. Conta proprietária e HOST devem estar ativos. Nenhum outro grupo é publicado automaticamente. Sem configuração, a API pública responde 503.

O grupo configurado inicialmente é `d7bda340-bec1-47a7-ae2c-e1e683e84b46`. A consulta ao Neon confirmou zero usuários, grupos e mídias antes do deploy: esse UUID reserva o grupo de publicação, mas não cria usuário, catálogo ou vídeos simulados. Para administrar uploads, crie primeiro o administrador com `pnpm admin:create` e variáveis temporárias `ADMIN_EMAIL`/`ADMIN_PASSWORD`, depois substitua `PUBLIC_LIBRARY_GROUP_ID` pelo UUID do grupo real criado. Não há credenciais padrão nem administrador compartilhado.

As APIs públicas permitem catálogo/busca, capa e concessão de reprodução de 120 segundos diretamente ao R2. O bucket permanece privado, mas qualquer visitante pode reproduzir o grupo publicado. Não publique conteúdo confidencial nesse grupo. Uploads, edição e gerenciamento continuam autenticados em `/manage`.

## Validação e Vercel

O domínio criado para a API é https://api-production-af9e.up.railway.app. API, worker e Redis atingiram status SUCCESS. `/health` e `/ready` retornaram 200 por HTTPS. O rewrite `/api` da Vercel foi conectado ao domínio real, com catálogo público 200/vazio e APIs privadas protegidas. CORS R2 mantém a origem Vercel exata. Login, upload multipart real ao R2, job FFmpeg, agrupamento, thumbnail, playback Range/SHA-256 e limpeza foram verificados com conta e MP4 temporários privados; consulte [VALIDATION.md](VALIDATION.md). Não foi testado navegador remoto nem biblioteca grande.
