# Frontend Family Stream na Vercel

Publicado em https://family-stream-faguedes.vercel.app no projeto `family-stream`, equipe Hobby, sem upgrade pago. O deploy de produção usa assets Vite compilados enviados pela API Vercel. O projeto foi conectado ao GitHub pelo usuário; previews anteriores falharam antes de existir configuração de build do monorepo.

O arquivo `vercel.json` na raiz agora registra build `pnpm build`, instalação com lockfile congelado, saída `apps/web/dist`, headers de segurança, rewrite da API e fallback React Router. Root Directory deve ficar na raiz do monorepo. A implementação está em `feat/family-stream-foundation`; `main` ainda não contém o MVP. Configure a Production Branch correspondente ou integre a implementação em main antes de depender de deploys Git. O sucesso da publicação manual não comprova sucesso de deploy automático.

## Backend conectado

`/api/:path*` aponta para `https://api-production-af9e.up.railway.app/api/:path*`. O rewrite vem antes do fallback SPA. O backend usa `NODE_ENV=production` e `APP_ORIGIN=https://family-stream-faguedes.vercel.app`. O domínio Vercel já está autorizado no CORS R2. Não use preview de outra origem para testar uploads/login sem configurar sua origem específica.

A página `/` mostra biblioteca pública somente leitura; `/upload` permite envio e edição sem login no grupo do MVP; `/manage` redireciona para envio. O login Vercel de proteção do projeto foi desativado para permitir acesso à interface pública. Isso não desativa autenticação da API privada.

Os testes HTTPS publicados confirmaram `/` e `/manage` com 200; `/api/v1/health` e `/api/v1/ready` com 200; catálogo público real 200 e vazio; catálogo privado 401. Login, upload direto, processamento, capa e playback Range foram verificados pela API publicada com conta e mídia temporárias e depois limpos; veja [VALIDATION.md](VALIDATION.md). O grupo do MVP e seu ator técnico não ADMIN estão preparados para ingestão sem login. Os testes de navegador completos passaram localmente; o navegador remoto continua não verificado.

Neon, Redis e credenciais S3 ficam no backend. Não exponha URLs com senha ou chaves em variáveis `VITE_*`. O R2 guarda originais privados; reprodução recebe concessões curtas do backend.

O Hobby é destinado a uso pessoal não comercial, conforme os termos da Vercel. Não foi ativado plano pago. O backend usa o crédito disponível do Railway Free; consulte [RAILWAY.md](RAILWAY.md). O notebook Windows deixou de ser necessário para hospedar esse backend; [NOTEBOOK.md](NOTEBOOK.md) permanece como alternativa de execução local.
