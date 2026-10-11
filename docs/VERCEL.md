# Frontend Family Stream na Vercel

**Publicado:** https://family-stream-faguedes.vercel.app, projeto `family-stream` na equipe Hobby do usuário, sem upgrade pago. O deploy atual usou o build Vite compilado, enviado pela API Vercel; o projeto não está ligado ao GitHub para deploy automático. Commits novos precisam de novo deploy ou de configurar a integração Git descrita abaixo. O login Vercel que protegia esse novo projeto foi desativado apenas nele para permitir acesso público à interface; a página inicial agora usa biblioteca pública somente leitura; gerenciamento autenticado fica em `/manage` e depende da API.

Os assets, CSP e fallback React Router foram conferidos via HTTPS. Enquanto o notebook não está conectado, `/api` responde HTTP 503 com JSON explicando indisponibilidade; não há autenticação ou catálogo simulados. A origem desse frontend já foi adicionada ao CORS privado do R2. Para conectar o Windows, siga [NOTEBOOK.md](NOTEBOOK.md) e informe a URL HTTPS do túnel para substituir a rota temporária de indisponibilidade pelo proxy da API real.

A Vercel serve a interface React/Vite. O backend Fastify, worker FFmpeg e Redis desta arquitetura serão hospedados no Railway Trial; a receita do notebook permanece como alternativa. Neon e R2 continuam separados. Publicar somente a interface não torna login/upload/reprodução funcionais sem uma API acessível por HTTPS.

## Importar o projeto

No painel [Vercel](https://vercel.com/new), importe `rennercand/netview`. A implementação está na branch `feat/family-stream-foundation`; configure essa branch como Production Branch nas configurações Git antes de publicar, pois `main` ainda não contém o app.

Configure **Root Directory** como `apps/web`, **Framework Preset** como Vite, **Build Command** como `pnpm build`, e **Output Directory** como `dist`. Se precisar informar Install Command, use `pnpm install --frozen-lockfile`; o monorepo usa o lockfile e workspace na raiz. Mantenha habilitado o acesso aos arquivos fora do Root Directory para resolver `packages/shared`. Não coloque chaves S3 ou URLs com senha em variáveis `VITE_*`: elas entram no JavaScript público.

O Hobby é destinado a uso pessoal não comercial, compatível com uma biblioteca familiar dentro das condições do plano. Se a intenção for um SaaS comercial, confirme licença/plano e custos antes de publicar. Não faça upgrade para cumprir esta instrução.

## Conectar a API

A interface chama `/api/v1` na mesma origem. Ela não chama diretamente seu localhost nem uma API em outra origem. Depois de ter uma API pública por HTTPS, crie `apps/web/vercel.json` usando este exemplo e substitua `backend.example.com` pelo endereço real:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://backend.example.com/api/:path*"
    },
    {
      "source": "/:path*",
      "destination": "/index.html"
    }
  ]
}
```

O destino acima é um exemplo de documentação, não um backend existente. O rewrite da API vem antes do fallback React Router. Commitar essa configuração dispara novo deploy. O backend deve usar `NODE_ENV=production` e `APP_ORIGIN` igual à origem HTTPS real do frontend, por exemplo `https://family-stream.vercel.app`. Mantenha as URLs Neon, chaves S3 e Redis somente no backend. Configure também CORS do R2 para essa origem HTTPS exata. Não use wildcard de origem para resolver erro de autenticação.

Se o backend ficar no Windows, será necessário configurar acesso HTTPS público, por exemplo um Cloudflare Tunnel com hostname estável. O PC/Docker deve permanecer ligado. O Compose local HTTP em `127.0.0.1` não está pronto para publicação externa e não deve ser exposto simplesmente abrindo a porta no roteador. Isso é uma etapa adicional de configuração; consulte [DEPLOY.md](DEPLOY.md) para requisitos de produção.

## Antes de compartilhar

Confira backend pronto, login, logout, pedido de acesso, upload direto R2, worker, reprodução/seek e isolamento entre grupos usando o domínio de produção. Mudanças de domínio exigem atualizar `APP_ORIGIN` e CORS; previews de branches têm origens diferentes e não são automaticamente autorizados. O frontend foi publicado e conferido; o fluxo completo ainda não foi testado porque o backend Railway ainda não está conectado.
