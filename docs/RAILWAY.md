# MVP no Railway Trial

O frontend fica na Vercel. Railway executará API Fastify, worker FFmpeg e Redis privado; Neon guarda metadados e R2 guarda objetos. Nenhum serviço Railway foi criado até este registro: falta a credencial da conta.

Gere um token da conta em https://railway.com/account/tokens e salve como `RAILWAY_API_TOKEN` no ambiente Codex, depois salve/publique. O campo e as permissões de destino das APIs Railway já foram preparados. Não envie o token no chat. Não use a criação de contas sucessivas para renovar créditos; avalie o saldo/período do trial antes da implantação, sem ativar assinatura paga.

## Serviços

- API: branch `feat/family-stream-foundation`, raiz do monorepo, configuração `railway.json`.
- Worker: mesma branch/raiz, config path `/infrastructure/railway.worker.json`. Não criar domínio público; nenhuma healthcheck HTTP para este processo.
- Redis: serviço privado, senha, volume persistente, política `noeviction`; referenciar URL privada nos dois serviços. Não publicar porta/domínio TCP.

O Dockerfile Railway usa apenas o estágio de serviços Node/FFmpeg, sem Caddy. A API aplica migrations via `DIRECT_URL` no pre-deploy; ambas as URLs Neon devem usar `sslmode=verify-full`. API verifica PostgreSQL/Redis/R2 antes de ouvir na porta Railway; liveness não consulta Neon continuamente. O worker tem concorrência 1 e reconciliação configurada para uma hora.

Defina em API/worker `NODE_ENV=production`, `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET=family-stream`, e chaves S3 protegidas. API também precisa de `DIRECT_URL`, `APP_ORIGIN=https://family-stream-faguedes.vercel.app`, `PUBLIC_LIBRARY_GROUP_ID`, e `PLAYBACK_DELIVERY=direct`. O Railway fornece `PORT`. Não exponha essas credenciais em variáveis Vite.

Antes de criar deploy, verifique limites permitidos pelo trial: uma instância por serviço, CPU/RAM limitadas à necessidade, worker dimensionado para o FFmpeg e monitoramento do saldo. Créditos de teste não garantem executar os três serviços por um mês nem impedem gastos com outro provedor. Configure alertas/limites disponíveis; pare os serviços ao encerrar o teste. Não existe um limite financeiro inventado por esta configuração.

## Biblioteca pública temporária

Por escolha explícita do usuário, `/` passa a mostrar biblioteca pública somente leitura, sem formulário de login. Apenas vídeos `READY` do grupo indicado em `PUBLIC_LIBRARY_GROUP_ID` serão publicados. Conta proprietária deve estar ativa e o grupo possuir HOST ativo. Nenhum outro grupo é publicado automaticamente. Sem essa variável, o endpoint público responde indisponibilidade, não um catálogo simulado.

As APIs públicas permitem catálogo/busca, capa e concessão de reprodução de 120 segundos, diretamente ao R2. Elas não retornam e-mails, hashes, dados de sessão, erros internos, chaves de storage ou histórico pessoal. O bucket permanece privado, mas qualquer visitante pode obter uma concessão para os vídeos publicados; não coloque vídeos confidenciais nesse grupo. Isso altera conscientemente a regra original de biblioteca exclusivamente privada.

Uploads, quota, edição, gerenciamento e progresso pessoal continuam autenticados. O formulário existente fica em `/manage`, fora da página inicial. Não existem endpoints anônimos de escrita nem usuário ADMIN compartilhado. Retirar a configuração pública restaura bloqueio da publicação; concessões já emitidas ainda valem até expirar.

## Conectar à Vercel

Quando a API Railway responder saudável pelo domínio HTTPS, atualizar o rewrite `/api` da Vercel para esse domínio e redeployar o frontend. A Vercel atualmente informa indisponibilidade porque não existe backend conectado. Manter o CORS R2 com a origem Vercel exata. Validar catálogo público e reprodução real sem login, e garantir que `/manage`/uploads continuam protegidos. Testar CPU/RAM do worker antes de enviar uma biblioteca grande.
