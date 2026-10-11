# Compatibilidade

MVP: MP4 com H.264 8-bit/yuv420p e áudio AAC, HTML5 video, HTTP Range. Sem promessa de 4K/HLS/TV antiga. Vídeo incompatível exibe estado real e preserva original. Autoplay depende de gesto do usuário.

| Cliente                         | Versão testada       | Estado                            |
| ------------------------------- | -------------------- | --------------------------------- |
| Chromium desktop/headless Linux | A registrar após E2E | Não verificado até concluir teste |
| Chrome desktop                  | —                    | Não verificado                    |
| Firefox                         | —                    | Não verificado                    |
| Safari/macOS/iOS                | —                    | Não verificado                    |
| Android navegador               | —                    | Não verificado em aparelho real   |
| Samsung Tizen                   | —                    | Não verificado                    |
| LG webOS                        | —                    | Não verificado                    |
| Android TV                      | —                    | Não verificado                    |

Frontend responsivo e foco visível não equivalem a teste em TV. `/tv` e pareamento não estão no MVP; a rota não simula sucesso. TVs futuras usarão URL em navegador, sem lojas/USB/firmware. Se o browser integrado não suportar os codecs/TLS, o fallback operacional é dispositivo HDMI externo com navegador compatível. Não ignore avisos de certificado.
