# Produção: Neon + R2

O projeto Neon e o bucket R2 já foram criados. Consulte [PROVISIONING.md](PROVISIONING.md) para recursos, verificações remotas e pendências; não crie duplicatas. As credenciais S3 foram configuradas e testadas; a implantação pública ainda precisa ser concluída.

1. Crie banco Neon e um usuário dedicado. `DATABASE_URL` usa endpoint pooled, `DIRECT_URL` endpoint direto, ambos com `sslmode=verify-full`. Nunca exponha credenciais ao frontend. Ajuste pool/conexões ao plano e ao número de containers. Backups/PITR dependem das condições do plano; não suponha retenção infinita.
2. Crie bucket R2 **privado**, sem URL pública/r2.dev. Gere token S3 restrito ao bucket com leitura, escrita, listagem de partes e exclusão. API precisa assinar upload e ler metadados; worker precisa ler original e escrever capas. Um futuro isolamento de chaves por serviço pode reduzir privilégios. `S3_ENDPOINT` e `S3_PUBLIC_ENDPOINT` normalmente apontam para `https://<account>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_BUCKET` identifica o bucket.
3. Configure CORS no R2, substituindo a origem abaixo pela origem HTTPS exata da aplicação. A origem não é segredo. Não use `*` para origem:

```json
[
  {
    "AllowedOrigins": ["https://family.example.com"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "Range"],
    "ExposeHeaders": [
      "ETag",
      "Content-Range",
      "Accept-Ranges",
      "Content-Length"
    ],
    "MaxAgeSeconds": 300
  }
]
```

4. Configure lifecycle para abortar multipart incompleto após um dia. O worker também limpa estado/objetos expirados; mantenha-o ativo. Original, capa e futuras renditions usam prefixos separados e chaves opacas.
5. Configure Redis privado persistente, com senha e política `noeviction`. `REDIS_URL` deve corresponder à senha; encode caracteres especiais da senha na URL. Use TLS (`rediss://`) se o Redis estiver fora da rede privada. Não exponha a porta publicamente.
6. Configure `APP_ORIGIN=https://<origem>`, `NODE_ENV=production`, `PLAYBACK_DELIVERY=direct`, URLs e chaves S3 como segredos da hospedagem. Não há chaves no bundle web. O site/API devem ter a mesma origem, com proxy de `/api`.
7. Construa `infrastructure/Dockerfile`, target `services` para API/worker/migration; target `web` para interface estática. Para VPS: `docker compose --env-file .env -f infrastructure/compose.prod.yml up --build -d`. Configure também `REDIS_PASSWORD`, `SITE_ADDRESS`, `ACME_EMAIL`. Somente Caddy publica 80/443. Rode `create-admin.ts` como comando temporário no container com segredos temporários; nenhuma conta administrativa vem pronta.
8. `TRUSTED_PROXY_CIDRS` deve conter apenas a rede/IP real do proxy reverso. Vazio não confia em cabeçalhos encaminhados e limita pelo IP da conexão, que pode ser o proxy. **Não** configure trustProxy irrestrito. Mapeie isso explicitamente para sua hospedagem antes de abrir acesso.
9. Verifique `/api/v1/ready`, login, conta pendente, aprovação, upload direto multipart, CORS/ETag, processamento remoto, seek, revogação e isolamento de grupos no provedor real. Neon real recebeu migrations e R2 real passou nas verificações básicas de storage/multipart descritas em PROVISIONING.md. O fluxo completo da aplicação nos provedores e na hospedagem escolhida ainda precisa ser validado.
10. Restrinja CSP `connect-src` ao endpoint R2 quando a infraestrutura definitiva for conhecida. O Caddy web permite HTTPS para endpoints storage configuráveis; `media-src` permite HTTPS para reprodução assinada. Os endereços das URLs vêm somente da API autorizada, não de títulos enviados por clientes. Nunca habilite bucket público para resolver CORS.

O worker exige FFmpeg/FFprobe e jobs persistentes; free tiers que hibernam não dão processamento contínuo. O MVP não salva vídeos em filesystem temporário nem em volumes da aplicação. A opção gateway exige banda da hospedagem; a opção direct aproveita entrega direta do R2. Capa pequena é transmitida pela API. HLS não está implementado.

HTTPS por IP depende de certificado publicamente confiável e compatibilidade do cliente. O Compose não finge TLS por IP. Use um domínio/subdomínio ou configure método/certificado validado para seu IP; não ignore erros TLS. Não há publicação ou deploy automático pela CI.

## Compute ocioso e limites gratuitos

O processamento normal usa uma notificação Redis após o commit do upload, com outbox SQL durável. Em produção, a reconciliação/limpeza ocorre a cada hora; uma falha de publicação pode atrasar processamento até essa reconciliação. É configurável com `OUTBOX_RECONCILE_MS` (5.000–3.600.000 ms). Consultas de monitoramento frequentes a `/ready` e aba da biblioteca aberta podem manter o Neon ativo. Use `/health` para liveness e `/ready` sob demanda. Monitore compute, conexões e quotas do Neon: somente dados textuais não garante ficar no free tier.
