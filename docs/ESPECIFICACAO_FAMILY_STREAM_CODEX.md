# FAMILY STREAM — ESPECIFICAÇÃO TÉCNICA E PROMPT DE IMPLEMENTAÇÃO PARA CODEX

## 1. Objetivo

Desenvolva uma aplicação web privada de biblioteca audiovisual familiar denominada provisoriamente **Family Stream**. Ela permitirá preservar, catalogar, enviar e reproduzir remotamente vídeos pessoais, digitalizações de CDs/DVDs e arquivos antigos, incluindo materiais raros ou difíceis de encontrar, sobre os quais os usuários tenham direito de armazenamento e compartilhamento.

A aplicação deve funcionar pelo navegador em notebooks, computadores, celulares, tablets e, sempre que tecnicamente viável, Smart TVs. **Não exigir aplicativos publicados nas lojas das TVs.** Ter um modo de interface específico para TV, navegável com controle remoto. Não presumir que um pendrive USB possa executar código em qualquer Smart TV ou contornar controles do sistema operacional; o caminho principal é abrir a URL web no navegador integrado. Para TVs incompatíveis, documentar a opção de um dispositivo HDMI externo rodando um navegador comum, sem modificar o firmware da TV.

O serviço será hospedado em VPS/cloud e ficará alcançável pela internet, porém a biblioteca será privada, mediante login, convite/aprovação e autorização de dispositivos. O acesso poderá ocorrer por IP público e HTTPS, caso a infraestrutura e o certificado suportem essa opção, sem obrigatoriedade de domínio próprio. Recomendar domínio/subdomínio opcional para facilitar certificados, navegação e compatibilidade, mas não tornar isso requisito rígido. Todos os endpoints devem usar configurações de URL por ambiente.

**Escopo:** armazenamento e reprodução de arquivos fornecidos pelos próprios usuários autorizados. Não desenvolver busca, scraping, indexação de catálogos protegidos, bypass de DRM, extração de plataformas de streaming ou distribuição pública de obras sem permissão.

## 2. Princípios e requisitos

- Projeto real, evolutivo, testável e pronto para GitHub; não entregar um protótipo apenas visual.
- Priorizar segurança, privacidade, simplicidade de operação familiar e compatibilidade multiplataforma.
- Arquitetura modular em monorepo TypeScript; disponibilizar Docker Compose para desenvolvimento e produção inicial.
- Arquivos de vídeo armazenados de forma privada, fora do alcance direto de usuários não autorizados.
- Não exigir aplicativo nativo no cliente. PWA opcional em dispositivos compatíveis; não depender de service workers nem de APIs modernas para o modo TV.
- Interface amigável a controle remoto: foco visível, teclado virtual quando necessário, teclas direcionais, OK/Enter e Voltar/Escape; sem depender de hover.
- Experiência com capas, títulos, categorias, duração, legendas, retomada de reprodução e indicador de processamento.
- Separar perfil do usuário de registro do dispositivo, permitindo revogar permissões individualmente.
- Controle de IP opcional, complementar, com logs e regras configuráveis; não considerar IP identificador seguro de uma pessoa.
- Streaming eficiente para 1080p e arquivos de alta qualidade. O suporte a 4K depende dos codecs e dispositivos, do armazenamento e da banda disponível.
- Não prometer compatibilidade com todas as Smart TVs: criar matriz de compatibilidade e fallback para MP4/H.264/AAC quando possível.

## 3. Tecnologias preferenciais

**Monorepo:** pnpm workspaces (opcional Turborepo quando trouxer benefício concreto).

**Frontend:** React, TypeScript, Vite, React Router, Tailwind CSS; componentes acessíveis, navegação por teclado/controle; TanStack Query para chamadas e cache de estado remoto; Zod para validação de dados compartilhados. Manter bundle e recursos simples para o player de TV; considerar rota /tv com JavaScript e CSS minimalistas, polyfills pontuais e alvo de compilação compatível com os navegadores efetivamente testados.

**Backend:** Node.js LTS, Fastify e TypeScript, API REST com OpenAPI/Swagger somente em ambiente apropriado; schemas Zod/JSON Schema; erros padronizados; logs Pino.

**Persistência:** PostgreSQL + Prisma ORM e migrations versionadas.

**Fila:** Redis + BullMQ para metadados, thumbnails, transcodificação, limpeza e tarefas longas. Worker isolado da API.

**Vídeos:** armazenamento privado S3-compatible (Cloudflare R2 como preferência inicial); adaptador de storage que suporte posteriormente MinIO/S3 ou volume/NAS próprio. FFprobe para metadados; FFmpeg para thumbnails e transcodificação prévia. MP4 com H.264 e AAC para compatibilidade; HLS em múltiplas qualidades quando necessário; evitar reencodar conteúdo já compatível.

**Player:** elemento HTML5 <video> com suporte a HTTP Range para MP4; HLS nativo quando o navegador oferecer; hls.js quando Media Source Extensions forem suportadas; fallback, informação clara e diagnóstico quando um arquivo não puder ser reproduzido. Legendas WebVTT e tratamento de faixas externas; suporte a SRT via conversão controlada, não executar arquivos de legenda como código.

**Infraestrutura:** Docker Compose, Caddy como proxy reverso TLS, PostgreSQL, Redis, api, web e worker. CI com GitHub Actions. Gerenciamento de segredos via variáveis de ambiente não versionadas.

## 4. Perfis e autorização

Papéis iniciais:

1. **ADMIN**: gerenciamento global de usuários, dispositivos, armazenamento, vídeos, permissões, auditoria e configurações.
2. **HOST** (anfitrião): pode enviar e organizar seus arquivos, convidar e aprovar usuários dentro de seu núcleo familiar/grupo, com limites de armazenamento e escopo estabelecidos pelo ADMIN.
3. **MEMBER**: assiste ao acervo ao qual recebeu acesso; permissão de upload opcional e granular.
4. **DEVICE**: identidade de um aparelho pareado, não uma conta humana; acesso limitado às funções autorizadas e à reprodução.

Modelar relações explícitas entre usuários, grupos familiares, mídia e aparelhos. Permissões devem ser validadas no servidor a cada operação sensível. Um HOST não pode acessar ou aprovar recursos de outros grupos.

**Fluxo de cadastro:** por padrão, o registro público não concede acesso; usar convites, pedido pendente ou cadastro habilitado pelo admin. ADMIN aprova, rejeita, suspende e revoga.

**Fluxo de pareamento de TV:** o navegador da TV abre `/tv`, recebe um código curto de uso único, expira em poucos minutos, e exibe instruções. Um membro autorizado abre painel no celular/notebook, informa o código, vê o nome/tipo solicitado e aprova. A TV recebe uma credencial de dispositivo restrita, com rotação e revogação. Não apresentar credenciais permanentes ou tokens em texto visível. Restringir tentativas, expiração, reutilização e ataques de adivinhação do código.

**Tokens e sessões:** preferir sessões opacas geradas criptograficamente, armazenadas no servidor como hashes, com cookies HttpOnly, Secure e SameSite para o navegador convencional, e mecanismo de sessão adequado à TV. Evitar guardar JWT de longa duração em localStorage. Renovar credenciais de maneira segura, suportar logout global, expiração, revogação e lista de dispositivos. Proteger operações mutáveis contra CSRF quando cookies forem usados. Se JWT for adotado em alguma integração, usar expiração curta e revogação/rotação apropriadas.

**IP:** armazenar endereço de origem com política de retenção; oferecer allowlist/denylist opcional por usuário, grupo ou dispositivo. Evitar travar o usuário ao trocar de Wi-Fi, usar dados móveis, IPv6 ou CGNAT; permitir novos IPs sujeitos a revalidação. Considerar cabeçalhos de IP encaminhado somente de proxies reversos explicitamente confiáveis. Não confiar em cabeçalhos `X-Forwarded-For` enviados diretamente por clientes.

**Segurança:** senhas com Argon2id; limites de tentativa de login; validação de entradas, controle de tamanho de uploads, quotas, RBAC, logs de auditoria, HTTPS obrigatório em produção, headers de segurança compatíveis com o player, CORS fechado por padrão e princípio do menor privilégio. Não disponibilizar endpoints anônimos de listagem de arquivos. Não usar IDs sequenciais como única camada de proteção.

## 5. Streaming privado e armazenamento

Arquivos originais devem ficar em bucket privado. Chaves de objetos devem ser opacas e independentes do título; preservar filename original apenas como metadado sanitizado. Organizar originais, previews, capas, legendas e renditions processadas separadamente.

**Upload:** o backend autoriza e inicia sessão de upload multipart/resumable, grava estado em banco e emite URLs pré-assinadas curtas para envio direto ao storage, com validação de permissões, quotas, tipo e tamanho, integridade e finalização no servidor. Não confiar apenas na extensão do arquivo. Registrar jobs de processamento, cancelamento e falha recuperável. Não enviar arquivos grandes através da API sem necessidade.

**Reprodução:** a API verifica usuário/dispositivo/grupo, então emite concessão temporária limitada ao objeto, ou disponibiliza gateway de mídia protegido, dependendo do mecanismo de entrega escolhido. URLs assinadas são credenciais portadoras: devem durar pouco, não aparecer em logs, estar restritas ao objeto e ser renováveis sem expor o catálogo. Para HLS, é necessário proteger também manifesto, playlists-filhas, segmentos e legendas. Não presumir que uma única URL assinada do manifesto proteja automaticamente todos os segmentos. Especificar e testar esta parte com cuidado.

Para **MP4 direto**, oferecer suporte a HTTP Range, seek e cabeçalhos adequados (`206 Partial Content`, `Content-Range`, `Accept-Ranges`) na origem ou gateway que efetivamente sirva bytes. Verificar CORS conforme player e a arquitetura final.

Para **HLS**, gerar renditions após upload, inicialmente 1080p/720p/480p conforme origem e limites configurados, com codecs e áudio amplamente compatíveis. Evitar escalonar acima da resolução original. A qualidade original deve ser mantida como fonte. Usar streaming adaptativo somente quando browser e mídia suportarem; não depender exclusivamente de hls.js.

**Custos e limites:** armazenamento R2, requisições e possível processamento têm cobranças próprias; confirmar preços e regras de uso antes do deploy. Evitar colocar toda a entrega de vídeo em um CDN/proxy genérico com políticas incompatíveis. Planejar capacidade de banda simultânea e quota por grupo.

**Backup:** conservar mídia original, banco de dados, configurações e chaves de modo protegido. Backups automatizados, criptografados quando apropriado, com retenção e restauração testada. Não considerar o próprio bucket primário como backup suficiente.

## 6. Experiência de usuário

**Web convencional:** telas para login, cadastro/convite, espera de aprovação, painel inicial, biblioteca, busca, filtros, detalhes de mídia, player, continuar assistindo, upload, processamento, legendas, dispositivos, membros da família, permissões, histórico de acesso e administração.

**Modo TV (`/tv`):** interface em tela cheia, cards grandes, layout 10-foot, fontes legíveis, estados de foco, controles play/pause/seek/volume/legendas, pareamento por código e retomada automática opcional após reconexão. Evitar frameworks pesados, popups e fluxos que exijam teclado quando possível. Autoplay com áudio pode ser restringido pelo navegador: prever ativação inicial por clique/controle e mensagens claras. O navegador pode suspender a aba, impedir modo quiosque ou terminar por memória; não prometer execução 24/7 em todas as TVs.

**PWA:** instalável onde suportado, mas inteiramente utilizável por URL normal. Cache apenas de recursos públicos da interface quando seguro; não armazenar vídeo privado offline por padrão.

**Acessibilidade:** navegação por teclado, indicadores de foco, contraste adequado, estados de carregamento e erro, descrição de botões, orientação de uso para controle remoto.

## 7. Entidades iniciais de banco

Criar Prisma schema e migrations para pelo menos:

- `User`: id UUID, email único, senha hash, nome, status, timestamps.
- `Household`/`FamilyGroup`: id, nome, owner/admin, configurações e quota.
- `Membership`: userId, groupId, papel, permissões, status.
- `Invitation`/`AccessRequest`: token hash/código, solicitante, destino, status, validade e aprovador.
- `Device`: id UUID, groupId, nome, tipo (TV, MOBILE, DESKTOP, OTHER), status, último acesso, metadados limitados.
- `DevicePairing`: código hash, deviceId, expiração, estado, tentativas e aprovação.
- `Session`: hash do token, userId/deviceId, validade, revogação e último uso.
- `IpAccessRule`: escopo, CIDR/IP validado, tipo allow/deny, justificativa, autor e expiração.
- `Media`: id UUID, groupId, uploaderId, título, descrição, visibilidade, status, duração, resolução, codecs, tamanho, origem/objeto armazenado, datas.
- `MediaAsset`: mediaId, tipo (original, mp4, hls, thumbnail, subtitle), storageKey, MIME, formato, tamanho, status.
- `Playlist` e `PlaylistItem`.
- `MediaPermission` para compartilhamento granular dentro de grupos.
- `WatchProgress`: userId, mediaId, deviceId opcional, posição, atualizadoEm.
- `UploadSession`: uploaderId, mídia, estado, tamanho, storage upload id, validade.
- `ProcessingJob` (ou vinculação aos job IDs da fila).
- `AuditLog`: ator, ação, objeto, tempo, IP minimizado segundo política, resultado.

Adicionar índices, unique constraints, chaves estrangeiras, regras de cascata e validações de integridade. Arquivos não devem se tornar públicos por erro de padrão ou falta de relação de grupo.

## 8. APIs REST sugeridas

Usar prefixo `/api/v1` e respostas consistentes; exemplos (adaptar após modelagem):

- `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh` quando aplicável, `GET /auth/me`.
- `POST /access-requests`, `GET /admin/access-requests`, `POST /admin/access-requests/:id/approve`, `.../reject`.
- `GET /households`, `POST /households/:id/invitations`, `GET /households/:id/members`.
- `GET /devices`, `PATCH /devices/:id`, `POST /devices/:id/revoke`.
- `POST /device-pairings/start`, `GET /device-pairings/:code/status`, `POST /device-pairings/:code/approve`.
- `GET /media`, `GET /media/:id`, `PATCH /media/:id`, `DELETE /media/:id`.
- `POST /uploads/init`, `POST /uploads/:id/part-url`, `POST /uploads/:id/complete`, `POST /uploads/:id/abort`.
- `POST /media/:id/playback-session` para emitir acesso temporário e listar fontes suportadas.
- `GET /media/:id/subtitles`, `POST /media/:id/subtitles`.
- `GET /me/progress`, `PUT /media/:id/progress`.
- `GET /admin/audit-logs`, `GET /admin/metrics`, `GET /health`, `GET /ready`.

Implementar checagens de autorização no backend e testes para IDOR (usuário tentando acessar mídia de outro grupo). Não tornar público o endpoint que cria playback session.

## 9. Organização de código

```text
family-stream/
├── apps/
│   ├── web/              # React, Vite, /tv, biblioteca e painel
│   ├── api/              # Fastify, rotas, domínio, middleware de auth
│   └── worker/           # FFmpeg, thumbnails, renditions e filas
├── packages/
│   ├── database/         # Prisma schema, migrations e client
│   ├── auth/             # Políticas de autenticação/autorização
│   ├── shared/           # Schemas, tipos e contratos
│   └── storage/          # Interface e implementação R2/S3
├── infrastructure/
│   ├── compose.dev.yml
│   ├── compose.prod.yml
│   ├── Caddyfile
│   └── scripts/
├── .github/workflows/
├── .env.example
├── .gitignore
├── README.md
├── SECURITY.md
└── pnpm-workspace.yaml
```

Não versionar `.env`, segredos, mídia, banco, certificados, backups ou credenciais. Usar `.env.example` com valores fictícios.

## 10. Implantação, segurança operacional e disponibilidade

- Desenvolvimento via Docker Compose; produção inicial com containers separados e volumes persistentes necessários.
- Caddy terminando HTTPS quando houver domínio ou método de certificado por IP validado. Em desenvolvimento, usar HTTP local sem fingir TLS público.
- Se VPS possuir IP público, abrir somente portas indispensáveis; banco, Redis e serviços internos sem exposição pública. Firewall, atualizações, usuário não-root, credenciais fortes, restart policy, monitoramento e logs.
- Rate limiting de login, pairing e upload; limite de tráfego opcional por grupo; proteção do provedor contra ataques DDoS e dimensionamento de banda.
- Verificar possibilidade real de certificado válido para IP e suporte do navegador da TV; não ignorar erros TLS. Se não for confiável em alguma TV, usar hostname público não indexado e controlado como fallback.
- Coletar apenas dados necessários; detalhar retenção de IPs, sessões e logs para a família.
- Sem porta administrativa publicamente aberta sem autenticação; painel ADMIN exige privilégios e opcionalmente segundo fator.
- Usar CI com lint, typecheck, testes e build, antes do deploy. Não fazer deploy automático para produção com segredos indefinidos.
- Criar guia de restauração do PostgreSQL e da mídia; preservar integridade e compatibilidade das versões.

## 11. Testes e critérios de aceite

Incluir testes unitários, integração com PostgreSQL/Redis de teste, verificações de permissão e testes end-to-end principais. Priorizar:

1. Usuário pendente não acessa a biblioteca.
2. ADMIN/HOST aprova usuário apenas no escopo permitido.
3. Usuários de grupos distintos não veem nem reproduzem mídias uns dos outros.
4. Dispositivo não pareado não recebe playlist nem URLs protegidas.
5. Código de pareamento expira e não pode ser reutilizado.
6. Revogar sessão ou dispositivo impede emissão de novos acessos; acessos temporários preexistentes expiram rapidamente.
7. Upload interrompido pode ser retomado ou cancelado, sem arquivos órfãos permanentes.
8. Arquivo MP4 compatível é reproduzido com seek e HTTP Range.
9. Arquivo incompatível entra em processamento e apresenta estado compreensível.
10. Usuário sem autorização não obtém manifesto/segmentos/legendas HLS protegidos.
11. Controle remoto da TV navega pelo menu, seleciona título e controla vídeo; testar em navegadores reais sempre que possível.
12. Os backups podem ser restaurados; `.env` não entra no repositório.

Criar matriz de compatibilidade contendo versões testadas de Chrome, Firefox, Safari, navegador Samsung Tizen, LG webOS e Android TV quando disponíveis. Marcar os não testados como **não verificados**, nunca como garantidos.

## 12. Plano de execução por fases

### Fase 0 — Fundação
- Criar monorepo, configurações TypeScript, lint, formatter, scripts e Docker Compose de desenvolvimento.
- Criar migrações PostgreSQL, serviço de API, healthchecks, front mínimo e documentação de setup.
- Definir contratos e políticas de autenticação/permissão.

### Fase 1 — MVP privado funcional
- Login e aprovação de contas; ADMIN inicial criado por comando/seed seguro (sem credenciais padrão em código).
- Household e memberships, biblioteca com busca básica, upload de MP4 para R2 privado, metadados via FFprobe, thumbnail e reprodução MP4 protegida com seek.
- Interface responsiva para desktop e celular.
- Listagem/revogação de sessões e dispositivos.
- Testes obrigatórios de autorização.

### Fase 2 — Experiência Smart TV
- `/tv` com navegação por controle, pareamento por código, biblioteca, player em tela cheia, estados de erro, suporte a pausas e retomada.
- Medir limitações reais de navegadores e documentar fallback.

### Fase 3 — Streaming avançado
- Jobs FFmpeg, múltiplas renditions/HLS, legendas, progresso, filas com retry/idempotência, painel de processamento e quotas.
- Proteger segmentos HLS e testar renovação de autorização.

### Fase 4 — Produção e operação
- Deploy VPS, TLS, métricas, backup/restauração, quotas, logs, limitação de tentativas, monitoramento e documentação de ameaças.
- Preparar CI/CD GitHub Actions com aprovação para produção.

## 13. Instruções objetivas ao Codex

1. Antes de escrever código, analise o repositório GitHub existente e preserve as convenções, arquivos e projetos já presentes. Se o repositório estiver vazio, inicialize seguindo a estrutura proposta. **Não apagar nem sobrescrever código sem necessidade.**
2. Registre no README um resumo da arquitetura, dependências e decisões técnicas. Quando houver incompatibilidade ou tecnologia inadequada, explique e proponha alternativa segura.
3. Trabalhe **em etapas pequenas e verificáveis**. Implemente a Fase 0 e o núcleo da Fase 1 antes de tentar produzir todas as funcionalidades. Não entregue dezenas de páginas sem backend funcional.
4. Forneça código real, migrations, testes, scripts e `.env.example`; inclua comandos para subir localmente, criar o primeiro administrador e executar testes.
5. Para integração com R2, implementar SDK S3 compatível com bucket privado, uploads diretos autorizados e playback por autorização. Em modo de desenvolvimento, oferecer adaptador S3 local opcional (MinIO) ou mock seguro para testes; não exigir credenciais reais para rodar lint e testes.
6. Implementar mecanismos de tokens curtos, revogação, validação de grupo/dispositivo e auditoria. Não colocar segredo no frontend, não expor bucket público e não depender somente de IP para autenticação.
7. Usar estados claros de erro/carregamento e componentes adequados ao controle remoto das TVs.
8. Não fingir que HLS, 4K ou Smart TV antiga funcionarão universalmente. Documentar capacidades detectadas e fallback do player.
9. Não coletar dados de mídias via serviços externos sem consentimento do usuário. Começar com metadados informados manualmente e extraídos localmente.
10. Antes de cada commit, executar scripts de lint, typecheck, testes e build (ou explicar impedimento). Usar commits convencionais, com mudanças agrupadas por responsabilidade.
11. Se tiver acesso ao repositório remoto e permissão explícita, criar branch `feat/family-stream-foundation`, implementar e abrir PR com descrição e checklist. Caso contrário, preparar os arquivos e indicar como o usuário fará push, sem inventar publicação no GitHub.
12. Ao finalizar cada etapa, informar o que foi implementado, o que está pendente, como testar e quais segredos/configurações o responsável ainda precisa fornecer.

## 14. O que não implementar

- Nada de contornar DRM, desbloquear Smart TVs, explorar falhas de firmware ou executar códigos arbitrários via USB.
- Nada de crawler de filmes, downloads automáticos de serviços de streaming, distribuição pública de obras protegidas ou listas piratas.
- Nada de criar contas administrativas com usuário/senha padrão fixos.
- Nada de expor R2, PostgreSQL, Redis, segredos, chaves de API, filmes ou backups em repositório público.
- Nada de afirmar que ocultar a URL/IP substitui autenticação.
- Nada de armazenar tokens duradouros em `localStorage` por conveniência.

## 15. Entrega inicial solicitada

Comece imediatamente analisando o repositório e implementando a **Fase 0** seguida do **MVP essencial da Fase 1**, respeitando a arquitetura. Prioridades: uma pessoa administradora consegue iniciar o sistema, autorizar um familiar, enviar um MP4 para armazenamento privado e reproduzi-lo com acesso protegido em navegador desktop e móvel. Em seguida, implemente a interface `/tv` com pareamento por código. Recursos avançados (transcodificação completa, HLS, matriz de compatibilidade) devem ser construídos sobre essa base e não simulados como se já existissem.

**Resultado esperado:** repositório GitHub organizado, código reproduzível, seguro por padrão, documentação completa e aplicação web familiar de streaming com evolução gradual para diferentes plataformas.
