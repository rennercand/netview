# Recursos Neon e Cloudflare R2

Recursos reais provisionados para Family Stream. A aplicação pública ainda não foi hospedada.

## Neon

- Projeto: `family-stream`, ID `restless-butterfly-70641453`.
- Organização consultada pela API: plano `free`; nenhum upgrade realizado.
- Região: `aws-us-east-1`; branch `main`; banco `family_stream`.
- Compute configurado com mínimo/máximo de 0,25 CU. O plano controla a suspensão; a API recusou personalizar o intervalo e a criação foi refeita sem essa alteração.
- URLs pooled e direta preparadas em `.env.neon`, ignorado pelo Git e com permissão 0600. Ambas usam `sslmode=verify-full`; nunca inclua esse arquivo em commits, imagens ou bundles.
- Migration `20261011000000_initial` aplicada: 19 tabelas públicas, incluindo histórico de migrations; contas e mídias permanecem vazias.

A conexão TCP na porta 5432 foi recusada no ambiente Codex. O bootstrap usou o endpoint HTTPS SQL do Neon, com verificação TLS, conexão direta, batch em transação Serializable, advisory transaction lock e checksum SHA-256 do SQL versionado. Não houve modificação da migration. A reaplicação verificou o checksum e não repetiu DDL. Um batch de teste com DDL seguido de divisão por zero confirmou rollback: a tabela de teste não permaneceu no banco.

O runner normal `packages/database/src/migrate.ts` e o runtime Prisma continuam usando PostgreSQL pela conexão `pg`. A hospedagem definitiva precisa permitir conexão ao Neon; o bootstrap HTTPS não comprova execução da aplicação completa no provedor. Os testes de integração continuam usando banco local separado `_test`.

## Cloudflare R2

- Bucket: `family-stream`, classe Standard, localização ENAM.
- Acesso público `r2.dev`: desativado e confirmado pela API.
- Domínios personalizados: nenhum.
- Lifecycle: multipart incompleto abortado após 86.400 segundos.
- CORS: somente `http://localhost:5173` para desenvolvimento; GET/HEAD/PUT; headers Content-Type/Range; ETag/Content-Range/Accept-Ranges/Content-Length expostos. Substituir pela origem HTTPS exata quando a hospedagem for escolhida.
- Bucket vazio após as verificações: uma fixture textual de 28 bytes foi enviada e removida; um multipart de 28 bytes foi enviado e abortado. Nenhum vídeo foi enviado.
- `.env.r2` contém apenas endpoints/região/bucket, com permissão 0600 e ignorado pelo Git.

O token Cloudflare funciona para gerenciamento do bucket. Credenciais derivadas desse token foram descartadas após falha de assinatura. O usuário gerou as credenciais S3 próprias e as publicou como variáveis protegidas com entrega direta ao processo. Essas credenciais passaram nos testes remotos descritos abaixo.

Para renovar as credenciais: no painel R2, abra **Manage R2 API Tokens**, crie credenciais com **Object Read & Write**, restritas ao bucket `family-stream`, e configure `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY` como valores protegidos entregues diretamente à aplicação. Não envie os valores no chat ou ao GitHub. Credenciais para assinatura S3 precisam estar disponíveis ao processo, não apenas ser substituídas em headers HTTP pelo proxy. `S3_ENDPOINT` e `S3_PUBLIC_ENDPOINT` devem usar o endpoint S3 exibido pelo painel; `S3_REGION=auto`, `S3_BUCKET=family-stream`.

As variáveis S3 e os endpoints foram salvos e publicados no ambiente. As chaves não foram registradas em commits ou exibidas no chat.

### Verificação real do R2

O adaptador S3 da aplicação gerou URLs assinadas usando as credenciais fornecidas. Requisições HTTPS pelo proxy do ambiente confirmaram HEAD do bucket e listagem (200), PUT direto de fixture (200), GET com conteúdo e SHA-256 corretos (200), leitura Range com bytes corretos (206), CORS limitado à origem configurada e remoção (204). Uma requisição sem assinatura foi rejeitada com HTTP 400/InvalidArgument; o acesso público permanece desativado pela configuração verificada na API. Após a remoção, a listagem retornou zero objetos.

O teste multipart confirmou criação (200), upload de uma parte de 28 bytes com tamanho assinado (200), ETag e tamanho confirmado via ListParts (200), e abort/limpeza (204). A tentativa inicial de enviar 28 bytes com assinatura para 27 bytes foi rejeitada com HTTP 403, confirmando a proteção do tamanho assinado; a repetição com tamanho correto passou. São testes do protocolo de storage; não representam um fluxo completo de vídeo com API, Neon e worker. O runtime direto do SDK neste ambiente ainda depende da conectividade do ambiente; a hospedagem definitiva precisa validar o acesso S3 e PostgreSQL.

## Custo e pendências

Nenhum plano pago, upgrade ou serviço de hospedagem foi contratado por esta configuração. Neon Free foi confirmado pela API. R2 possui franquia gratuita e cobra excedentes; não há garantia de custo zero ilimitado. Não foi possível consultar assinaturas/faturamento Cloudflare com o token de gerenciamento. O bucket vazio evita acrescentar armazenamento de vídeos nesta etapa; acompanhe uso total da conta antes de começar uploads. A quota padrão de grupos da aplicação não representa um teto financeiro do R2.

Pendências: teste remoto completo da aplicação, primeiro administrador com credenciais escolhidas pelo usuário, escolha da hospedagem, Redis privado, domínio/HTTPS, CORS de produção e backup independente. URLs/chaves ficam fora do código. Consulte [DEPLOY.md](DEPLOY.md) e [VALIDATION.md](VALIDATION.md).
