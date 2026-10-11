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
- Bucket mantido vazio; nenhum vídeo ou fixture foi enviado ao R2 nesta etapa.
- `.env.r2` contém apenas endpoints/região/bucket, com permissão 0600 e ignorado pelo Git.

O token Cloudflare fornecido funciona para gerenciamento do bucket. Ele não permitiu consultar/gerar tokens adicionais, e o teste de credenciais S3 derivadas falhou com `SignatureDoesNotMatch`. Essas credenciais derivadas foram descartadas. Upload, download, Range e processamento no R2 real ainda não estão validados.

Para finalizar a integração: no painel R2, abra **Manage R2 API Tokens**, crie credenciais com **Object Read & Write**, restritas ao bucket `family-stream`, e configure `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY` como valores protegidos entregues diretamente à aplicação. Não envie os valores no chat ou ao GitHub. Credenciais para assinatura S3 precisam estar disponíveis ao processo, não apenas ser substituídas em headers HTTP pelo proxy. `S3_ENDPOINT` e `S3_PUBLIC_ENDPOINT` devem usar o endpoint S3 exibido pelo painel; `S3_REGION=auto`, `S3_BUCKET=family-stream`.

Os campos necessários e instruções atualizadas foram salvos como rascunho nas configurações do ambiente; preencher, salvar e publicar ativa a configuração. Isso não fornece automaticamente valores ausentes.

## Custo e pendências

Nenhum plano pago, upgrade ou serviço de hospedagem foi contratado por esta configuração. Neon Free foi confirmado pela API. R2 possui franquia gratuita e cobra excedentes; não há garantia de custo zero ilimitado. Não foi possível consultar assinaturas/faturamento Cloudflare com o token de gerenciamento. O bucket vazio evita acrescentar armazenamento de vídeos nesta etapa; acompanhe uso total da conta antes de começar uploads. A quota padrão de grupos da aplicação não representa um teto financeiro do R2.

Pendências: credenciais S3 próprias, teste remoto completo, primeiro administrador com credenciais escolhidas pelo usuário, escolha da hospedagem, Redis privado, domínio/HTTPS, CORS de produção e backup independente. URLs/chaves ficam fora do código. Consulte [DEPLOY.md](DEPLOY.md) e [VALIDATION.md](VALIDATION.md).
