# Backend no notebook Windows e frontend na Vercel

O frontend está publicado em **https://family-stream-faguedes.vercel.app**. O backend ainda depende de iniciar seu notebook e informar o endereço HTTPS do túnel. Até essa conexão, as rotas `/api` respondem indisponibilidade HTTP 503; nenhum login/upload/reprodução é simulado.

## 1. Instalar só Docker e baixar o projeto

Instale [Docker Desktop para Windows](https://www.docker.com/products/docker-desktop/) e abra o programa. Ele pode pedir WSL2 e virtualização habilitados. Para uso pessoal, observe a licença gratuita. Não precisa instalar Git, Node, Redis, FFmpeg ou cloudflared separadamente: as ferramentas rodam em containers. O primeiro build pode baixar/ocupar alguns GB.

Baixe o [ZIP do projeto](https://github.com/rennercand/netview/archive/refs/heads/feat/family-stream-foundation.zip), extraia e abra PowerShell na pasta que contém `package.json`.

## 2. Configurar as credenciais no seu notebook

```powershell
Copy-Item infrastructure/local.env.example .env.local
notepad .env.local
```

Preencha `DATABASE_URL` pooled e `DIRECT_URL` direta pelo botão **Connect** do Neon, selecionando `family_stream` / `family_stream_owner`. As duas devem ter `sslmode=verify-full`. Preencha as chaves próprias S3 e os dois endpoints R2. As chaves salvas no Codex não são automaticamente transferidas ao notebook; nunca envie esse arquivo ao GitHub, chat ou pasta pública.

Adicione ao arquivo:

```dotenv
FRONTEND_ORIGIN=https://family-stream-faguedes.vercel.app
```

Essa origem exata é usada na proteção CSRF e nos cookies de produção. As chaves ficam no backend, fora da Vercel e do JavaScript público. O R2 precisa permitir essa origem em CORS, mantendo o bucket privado.

## 3. Iniciar backend e túnel HTTPS

Com Docker Desktop aberto:

```powershell
docker compose --env-file .env.local -f infrastructure/compose.local.yml -f infrastructure/compose.notebook.yml up --build -d
```

Esse modo não sobe PostgreSQL/MinIO locais nem a interface Caddy: usa Neon e R2, e o frontend já está na Vercel. Nenhuma porta de API/Redis é publicada no Windows. Cloudflared cria uma conexão de saída com HTTPS público; o modo http2 evita depender de QUIC/UDP. O HTTP interno termina no container da API, sem desativar a verificação TLS das conexões Neon/R2.

Confira os serviços:

```powershell
docker compose --env-file .env.local -f infrastructure/compose.local.yml -f infrastructure/compose.notebook.yml ps
```

API deve estar saudável; o túnel só começa depois disso. Se falhar, veja `logs --tail=50 api migrate worker` e confira URLs, credenciais e conectividade, sem compartilhar segredos.

## 4. Criar sua conta administradora

```powershell
docker compose --env-file .env.local -f infrastructure/compose.local.yml -f infrastructure/compose.notebook.yml run --rm --no-deps -it api pnpm exec tsx infrastructure/scripts/create-admin-prompt.ts
```

O terminal pede nome/e-mail e senha com entrada oculta. Não há conta/senha padrão. O comando não redefine uma conta existente.

## 5. Informar o endereço do túnel

```powershell
docker compose --env-file .env.local -f infrastructure/compose.local.yml -f infrastructure/compose.notebook.yml logs --tail=100 tunnel
```

Localize a URL **`https://...trycloudflare.com`** e informe somente essa URL ao assistente para conectar o rewrite `/api` da Vercel. Não envie `.env.local`, senhas, chaves ou logs completos. A URL do túnel é um endereço público, não uma credencial de acesso.

Depois da atualização do deploy/rewrite, abra o frontend Vercel, faça login e teste um MP4 pequeno H.264/AAC: upload, processamento, seek, logout e isolamento de usuários. Os vídeos vão direto ao R2; não passam pelo túnel/backend durante upload nem são baixados para disco no notebook.

## Operação e limites

Mantenha notebook, Docker e Internet ativos; suspensão/desligamento deixam a API offline. Para ligar novamente, use o comando `up -d` sem `--build`; para parar, use `stop` com os mesmos arquivos Compose.

O Quick Tunnel é gratuito, temporário e destinado a testes, sem garantia de disponibilidade para produção. Sua URL muda ao reiniciar e deve ser atualizada na Vercel. Para acesso estável depois, use túnel nomeado/hostname sob um domínio que você já controla, após configurar DNS e permissões. Nenhum domínio ou plano pago foi comprado. Neon Free/R2 têm limites; o uso acima da franquia R2 pode ser cobrado. Vercel Hobby é para uso pessoal não comercial.

A configuração Compose foi verificada por sintaxe, merge, perfis e políticas de exposição; ela ainda não foi executada no seu Windows. O teste remoto R2 e o bootstrap Neon estão registrados em [PROVISIONING.md](PROVISIONING.md).
