# Validação

Em andamento. Já foram executados lint, typecheck, build Vite, 17 testes unitários e 17 testes de integração com PostgreSQL 16, Redis 7.4, MinIO e FFmpeg reais. As migrations SQL foram aplicadas e reaplicadas no banco local, com verificação de histórico/checksum.

O upload de MP4 e processamento remoto foram verificados por integração. Neon e R2 reais ainda não foram conectados; hospedagem não foi escolhida. Validação E2E em navegador, CLI de ingestão e build completo Docker estão em execução e terão resultados registrados no próximo commit.
