# Backup e restauração

O bucket primário não é backup. Antes de produção, configure retenção e backup para destino separado; confirme preços, requisitos de privacidade e suporte do plano Neon.

1. Exporte PostgreSQL com `pg_dump --format=custom --no-owner --file=<arquivo>` usando a conexão direta em `PGSERVICE`/gerenciador de segredos seguro. Use ferramentas PostgreSQL compatíveis com a versão do Neon. Evite senha em linha de comando e logs.
2. Copie todos os objetos originais, thumbnails e futuras renditions para outro bucket/conta ou mídia externa protegida, preservando **as chaves**. Use ferramenta S3 compatível de confiança e configuração privada. Mantenha manifesto com chave/tamanho/checksum; multipart ETag não é um SHA-256 completo.
3. Guarde versões da aplicação/migrations, configuração sem valores públicos de segredos e segredos num cofre separado. Criptografe backups e restrinja permissões. Nunca salve no checkout.
4. Teste restauração num banco vazio e bucket separados: restaure com `pg_restore --no-owner`, restaure objetos/chaves, configure URLs para o destino de teste, confira migrações/checksums, login e autorização, reprodução/Range e thumbnails. Uma restauração do catálogo sem objetos não recupera vídeos.
5. O teste local documentado em VALIDATION valida dump/restore do schema/dados PostgreSQL; não prova backup do provedor R2/Neon. Automatização, criptografia e recuperação completa entre provedores são requisitos operacionais pendentes da Fase 4.

O trabalho atual não configura jobs de backup de produção nem faz upload de backups para terceiros.
