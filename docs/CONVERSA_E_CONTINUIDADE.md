# Registro da conversa e continuidade

Atualizado em 11/10/2026. Este documento resume as decisões e o estado confirmado durante o chat; não é uma transcrição integral. Não contém senhas, tokens ou URLs com credenciais.

## Pedido e preferências do usuário

Desenvolver Family Stream conforme `docs/ESPECIFICACAO_FAMILY_STREAM_CODEX.md`, começando pela Fase 0 e pelo MVP essencial da Fase 1. Implementações reais, arquitetura modular, testes, Docker, migrations e commits no GitHub. O frontend deve ser básico, com foco em arquivos, séries, temporadas e episódios interpretados pelo nome.

O usuário escolheu Neon para metadados PostgreSQL e Cloudflare R2 para vídeos privados. Originais não devem ser armazenados no disco ou carregados integralmente na RAM do servidor. Uploads são diretos ao R2, multipart, com retomada e limites.

A decisão mais recente substitui a exigência anterior de login na interface: assistir e enviar são áreas separadas, ambas sem login durante o MVP. O usuário autorizou expressamente biblioteca, upload e edição públicos, ciente de que qualquer visitante pode enviar arquivos e consumir armazenamento. Não solicitar novamente cadastro ou e-mail de administrador como requisito para enviar vídeos neste modo.

## Links publicados

- Assistir: https://family-stream-faguedes.vercel.app
- Enviar e editar: https://family-stream-faguedes.vercel.app/upload
- `/manage` redireciona para `/upload`.
- Backend: https://api-production-af9e.up.railway.app
- Railway: https://railway.com/project/ee09d224-4315-4552-ad21-a2e252d42843
- Repositório: https://github.com/rennercand/netview
- Branch implementada: `feat/family-stream-foundation`; não presumir que `main` contém o MVP.

## Infraestrutura e estado

Frontend React/Vite na Vercel Hobby, com proxy da API e configuração versionada em `vercel.json`. API Fastify, worker FFmpeg/BullMQ e Redis privado com senha/AOF/volume no Railway. Todos atingiram status SUCCESS na validação. O notebook do usuário não precisa ficar ligado.

O token Railway apontou para uma conta Free, sem trial ativo, com aproximadamente US$ 1 de crédito na consulta inicial. O usuário autorizou remover o projeto anterior `festa junina` e seu volume; a remoção foi executada antes de criar Family Stream. Nenhum upgrade pago foi solicitado. Saldo e disponibilidade devem ser consultados novamente; não prometer hospedagem gratuita permanente. O plano exige suspensão automática dos serviços.

Neon projeto `family-stream` (`restless-butterfly-70641453`), banco `family_stream`, plano Free. Runtime usa `DATABASE_URL` pooled; migrations usam `DIRECT_URL` direto, com TLS `sslmode=verify-full`. Migration versionada foi aplicada e verificada. R2 bucket `family-stream`, acesso `r2.dev` desativado, CORS para a origem Vercel exata e localhost de desenvolvimento. Endpoint S3 serve objetos por concessões assinadas curtas.

`PUBLIC_LIBRARY_GROUP_ID=d7bda340-bec1-47a7-ae2c-e1e683e84b46` e `MVP_OPEN_UPLOADS=true` estão configurados na API. Esse grupo tem proprietário técnico não ADMIN, associação HOST e quota de 5 GiB. A senha técnica foi gerada aleatoriamente, não é uma credencial compartilhada de login. Ingestão anônima só permite as rotas necessárias para envio, retomada, cancelamento e edição desse grupo. APIs de usuários, sessões, permissões e outros grupos continuam protegidas. Origin, rate limits e reservas de quota permanecem ativos.

Na última limpeza, o grupo ficou vazio, com zero bytes usados e reservados. Mídias reais enviadas pelo usuário depois desse registro devem ser preservadas; não tratar todo o grupo como fixture de teste.

## Funcionalidades

Upload multipart real diretamente ao R2, retomada/cancelamento/expiração, verificação de partes e quotas, catálogo com busca e agrupamento, edição de metadados e reprodução no navegador. Nome sugerido: `Minha Série - S01E02 - Título.mp4`. O worker extrai metadados/capa e valida compatibilidade; o catálogo de assistir publica apenas READY do grupo configurado.

A arquitetura de autenticação segura, aprovação, sessões e RBAC continua no backend para uso futuro. Não liberar administração global ao retirar o login da interface. Ausência/false de `MVP_OPEN_UPLOADS` restaura exigência de autenticação nas rotas de escrita; restaurar a experiência privada requer uma alteração posterior do frontend.

## Validações concluídas

ESLint, TypeScript, Prettier e build Vite passaram. 17 testes unitários, 22 de integração com serviços reais e 2 E2E desktop/móvel passaram. Os E2E atuais enviam e editam sem login e reproduzem vídeo público real.

Smoke HTTPS publicado sem cookies comprovou consulta do único grupo, multipart R2, worker READY, agrupamento, edição, catálogo público e playback Range/206. A versão autenticada anterior também foi validada com conta temporária, cookie Secure/HttpOnly, CSRF, SHA-256 e thumbnail. Fixtures, registros e objetos de teste foram removidos; a quota do grupo foi devolvida. Não foram desabilitadas verificações TLS ou de checksum.

Navegador remoto, TVs/dispositivos físicos, arquivos grandes dentro do limite Railway e backup independente de produção continuam pendentes. A tentativa anterior de Chromium remoto foi bloqueada pelo certificado do proxy; os E2E de navegador são locais. Não há HLS/transcodificação, legendas, pareamento TV, MFA ou recuperação de senha nesta fase.

## Orientações para continuar

Leia `docs/RAILWAY.md`, `docs/VERCEL.md`, `docs/PROVISIONING.md`, `docs/VALIDATION.md` e `SECURITY.md` antes de alterar a infraestrutura. Preserve o modo sem login solicitado e a separação assistir/enviar até nova decisão do usuário.

Credenciais devem permanecer nas configurações protegidas do ambiente/provedores. Não imprimir variáveis, arquivos `.env*`, cookies, senhas ou URLs assinadas. O token Railway usa `RAILWAY_API_TOKEN`; reutilize o binding existente. Credenciais S3 precisam estar disponíveis ao processo para assinatura. Não criar plano pago nem remover dados sem autorização específica.

O Railway rejeitou configurar novos serviços por `railway.json`/`railway.toml`; as configurações atuais foram aplicadas por API. Esses arquivos antigos foram removidos. Um deploy manual com `latestCommit=true` buscou main; use o SHA exato da branch implementada e confirme o commit antes de publicar. O último deploy funcional da API corresponde a `1cb3d1f`; o registro posterior `6ebe80c` alterou apenas documentação. O frontend atual foi publicado como build compilado pela API Vercel. Não presumir sucesso de deploys Git automáticos.

Para testes locais, use banco separado com sufixo `_test` e sobrescreva explicitamente todas as variáveis S3 com MinIO; nunca deixe o runner local herdar R2 de produção. Ao testar produção, use fixtures identificadas, remova apenas seus IDs/objetos e devolva somente sua quota, preservando arquivos reais do usuário.

Continue enviando alterações à branch GitHub autorizada, com commits organizados e relatório conciso. Consulte a infraestrutura real para status/saldo atualizados antes de afirmar que os serviços continuam ativos.
