# Rodar no próprio computador com Neon e R2

Instale somente [Docker Desktop](https://www.docker.com/products/docker-desktop/) no Windows/macOS; no Linux, Docker Engine com Compose também serve. O Desktop é gratuito para uso pessoal nas condições da licença. Windows pode precisar de WSL2/virtualização habilitados. Não é necessário instalar Node, pnpm, FFmpeg, Redis ou Git separadamente. O primeiro build baixa as imagens/dependências e pode ocupar alguns GB; os próximos reutilizam o cache. Este modo usa a energia e os recursos do seu computador.

## Baixar e configurar

Baixe o [ZIP da branch de implementação](https://github.com/rennercand/netview/archive/refs/heads/feat/family-stream-foundation.zip), extraia e abra um terminal dentro da pasta que contém `package.json`. A branch `main` ainda não contém essa implementação.

Copie `infrastructure/local.env.example` para um arquivo chamado `.env.local` na raiz. Pode fazer isso pelo gerenciador de arquivos e editar com um editor de texto simples; confirme que o nome não virou `.env.local.txt`.

No Windows, abra **Terminal/PowerShell** dentro dessa pasta. Para criar o arquivo sem alterar a extensão, execute `Copy-Item infrastructure/local.env.example .env.local` e depois `notepad .env.local`. Os comandos Docker abaixo funcionam no PowerShell.

Preencha `DATABASE_URL` e `DIRECT_URL` com as URLs do botão **Connect** do Neon (banco `family_stream`, role `family_stream_owner`): uma com pooling e outra sem. Use `sslmode=verify-full` nas duas. Preencha as duas chaves S3 do R2 e o endpoint S3, igual em `S3_ENDPOINT`/`S3_PUBLIC_ENDPOINT`. As credenciais do ambiente Codex não são automaticamente copiadas ao seu computador. Não copie as variáveis de gerenciamento `NEON_API_KEY`/`CLOUDFLARE_API_TOKEN`: a aplicação só precisa das URLs do banco e das chaves restritas ao bucket.

No painel R2, ajuste CORS para adicionar **`http://localhost:8080`** às origens já configuradas, mantendo métodos GET/HEAD/PUT, headers Content-Type/Range e exposição de ETag/Content-Range/Accept-Ranges/Content-Length. Mantenha o bucket privado e `r2.dev` desativado.

## Iniciar e criar sua conta

Com Docker aberto, execute:

```sh
docker compose --env-file .env.local -f infrastructure/compose.local.yml up --build -d
```

O comando sobe web/API/worker/Redis e verifica/aplica migrations no Neon existente. Não baixa PostgreSQL nem MinIO locais e não grava os vídeos originais no computador. Aguarde a conclusão do build e os serviços ficarem saudáveis.

Crie seu administrador com entrada de senha oculta, sem senha padrão e sem credenciais em argumentos/histórico:

```sh
docker compose --env-file .env.local -f infrastructure/compose.local.yml run --rm --no-deps -it api pnpm exec tsx infrastructure/scripts/create-admin-prompt.ts
```

Abra **http://localhost:8080** no navegador deste computador. Faça login com a conta criada. O primeiro teste manual deve ser um MP4 pequeno compatível com H.264/AAC; confirme upload, processamento e reprodução antes de enviar sua biblioteca.

O modo local usa HTTP e configurações de desenvolvimento, exclusivamente em `127.0.0.1`. Somente a interface web é publicada; Redis/API não publicam portas. Não altere a interface de bind para expor este modo na rede. Para acesso da família fora deste computador, configure domínio/HTTPS e o modo de produção; não basta compartilhar o endereço localhost.

## Uso diário

Depois do primeiro build, iniciar dispensa `--build`:

```sh
docker compose --env-file .env.local -f infrastructure/compose.local.yml up -d
```

Para parar:

```sh
docker compose --env-file .env.local -f infrastructure/compose.local.yml stop
```

O PC e Docker precisam estar ligados para acessar a aplicação/processar novos arquivos. Suspensão do computador interrompe o serviço. Mantenha `.env.local` protegido, fora do Git e de pastas compartilhadas. Ao renovar o token R2, atualize o arquivo e recrie os containers com `up -d --force-recreate`.

Diagnóstico: `docker compose --env-file .env.local -f infrastructure/compose.local.yml ps`. Logs podem ser vistos com `logs --tail=50 api worker`, mas nunca publique `.env.local` ou a saída completa de `docker compose config`, que contém segredos. Se Neon/porta 5432 ou R2 estiverem bloqueados por firewall, os serviços não ficam prontos; não desative TLS.

Não há mensalidade de hospedagem contratada por este modo. R2 cobra uso além da franquia gratuita; energia/Internet e armazenamento de imagens Docker no PC continuam sendo seus. O teste remoto documentado validou protocolo S3, e a execução completa deste Compose ainda precisa ser verificada no computador escolhido.
