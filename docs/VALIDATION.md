# Validação do MVP

Resultados executados nesta máquina (Node 24.19.0, PostgreSQL 16, Redis 7.4, MinIO Bitnami Legacy fixado por digest, FFmpeg 7.1.5, Chromium 154.0.8037.57). Os containers usam Node 22.

| Verificação                                                 | Resultado                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| ESLint                                                      | Passou                                                                                  |
| TypeScript: API, worker, pacotes, scripts, web e E2E        | Passou                                                                                  |
| Prettier                                                    | Passou                                                                                  |
| Build Vite                                                  | Passou                                                                                  |
| Unitários                                                   | 17 passaram; nenhum ignorado                                                            |
| Integração com serviços reais                               | 18 passaram; nenhum ignorado                                                            |
| E2E Chromium                                                | 2 passaram: desktop 1280×800 e viewport móvel 390×844                                   |
| Migrations em banco vazio + reaplicação                     | Passou; reaplicação não duplicou dados/DDL                                              |
| Dump/restore PostgreSQL e recuperação do objeto             | Passou; IDs/chaves, SHA-256 e Range preservados                                         |
| Sintaxe Docker Compose dev/prod                             | Passou                                                                                  |
| Build Docker com download normal                            | Bloqueado por HTTP 503 do registry npm neste ambiente; não foi desabilitada verificação |
| Neon/R2 reais, deploy e TLS público                         | Não executados; dependem da configuração da infraestrutura                              |
| TV real, Firefox, Safari, Chrome comercial e celular físico | Não verificados                                                                         |

A integração criou MP4s reais via FFmpeg e comprovou: conta pendente e anônimo bloqueados; aprovação ADMIN; restrição de HOST a seu grupo; CSRF/Origin; cookies HttpOnly e armazenamento de hashes; upload direto/retomada/cancelamento/expiração; assinatura que rejeita tamanho de parte divergente; quota; isolamento de grupos no catálogo, playback, gateway, capas e progresso; identificação real de codec incompatível; fila e thumbnail remoto; concessão S3 de 120 segundos; bytes MP4/206/Content-Range/seek; revogação de sessão/associação; CLI com stream direto ao storage.

Os E2E fizeram login pelo formulário, enviaram um arquivo, encontraram série/temporada/episódio, reproduziram o MP4 no elemento video, avançaram a posição e fizeram logout. Viewport móvel não representa verificação em Android/iPhone real. Não foram produzidos artefatos de navegador com credenciais de reprodução.

O backup testou um banco restaurado separado e recuperação de mídia usando prefixo temporário no mesmo MinIO. Isso não comprova redundância, criptografia, retenção ou recuperação entre provedores de produção. Fixtures, bancos restaurados, objetos e contas de teste são limpos após o teste.

O primeiro build Docker encontrou resolução de proxy indisponível dentro do builder. Com mapeamento do proxy e CA pública fornecida por mount temporário, APT passou com assinaturas verificadas, mas npm retornou 503. A disponibilidade do registry também falhou no host. Uma validação adicional com as dependências já instaladas e verificadas está sendo executada; será registrada após concluir. A receita normal continua usando TLS e checksum, sem flags de bypass.

Não há HLS, transcodificação, legendas, pareamento TV, MFA, recuperação de senha ou deploy automatizado nesta entrega. Entidades futuras no banco e respostas de rota indisponível não são simulações dessas funcionalidades.
