import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, type Me, type Group, type Media, type Upload } from "./api";
import "./style.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="error">
      {message}
    </p>
  ) : null;
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [register, setRegister] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <h1>Family Stream</h1>
      <p>Biblioteca privada da família</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          const data = new FormData(e.currentTarget);
          try {
            await api(register ? "/access-requests" : "/auth/login", {
              email: data.get("email"),
              password: data.get("password"),
              ...(register ? { name: data.get("name") } : {}),
            });
            if (register)
              setMessage(
                "Solicitação enviada. Aguarde aprovação do administrador.",
              );
            else onLogin();
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {register && (
          <label>
            Nome
            <input name="name" required maxLength={100} />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Senha
          <input
            name="password"
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            minLength={register ? 12 : 1}
            maxLength={128}
            required
          />
        </label>
        <button disabled={busy}>
          {busy ? "Aguarde…" : register ? "Solicitar acesso" : "Entrar"}
        </button>
      </form>
      <ErrorMessage message={message} />
      <button
        onClick={() => {
          setRegister(!register);
          setMessage("");
        }}
      >
        {register ? "Voltar ao login" : "Solicitar acesso à família"}
      </button>
    </main>
  );
}
function Uploader({ groups, onDone }: { groups: Group[]; onDone: () => void }) {
  const [groupId, setGroup] = useState(groups[0]?.id || ""),
    [file, setFile] = useState<File | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [percent, setPercent] = useState(0);
  const uploads = useQuery({
    queryKey: ["uploads"],
    queryFn: () => api<Upload[]>("/uploads"),
  });
  const [resumeId, setResume] = useState("");
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setMessage("");
    setPercent(0);
    try {
      const init: {
        id: string;
        partSize: number;
        filename?: string;
        size?: string;
        parts?: { partNumber: number; etag: string }[];
      } = resumeId
        ? await api<{
            id: string;
            partSize: number;
            filename: string;
            size: string;
            parts: { partNumber: number; etag: string }[];
          }>(`/uploads/${resumeId}`)
        : await api<{ id: string; partSize: number }>("/uploads/init", {
            groupId,
            filename: file.name,
            size: file.size,
          });
      setResume(init.id);
      if (
        "filename" in init &&
        (init.filename !== file.name || Number(init.size) !== file.size)
      )
        throw new Error(
          "Selecione o mesmo arquivo e tamanho do upload interrompido.",
        );
      const existing = init.parts || [];
      const parts: { partNumber: number; etag: string }[] = [];
      for (let i = 0; i < Math.ceil(file.size / init.partSize); i++) {
        const number = i + 1;
        const found = existing.find((p) => p.partNumber === number);
        if (found) parts.push({ partNumber: number, etag: found.etag });
        else {
          const { url } = await api<{ url: string }>(
            `/uploads/${init.id}/part-url`,
            { partNumber: number },
          );
          const response = await fetch(url, {
            method: "PUT",
            body: file.slice(
              i * init.partSize,
              Math.min(file.size, (i + 1) * init.partSize),
            ),
            credentials: "omit",
          });
          if (!response.ok)
            throw new Error(
              "Falha ao enviar parte. Selecione o mesmo arquivo para retomar.",
            );
          const etag = response.headers.get("ETag");
          if (!etag)
            throw new Error(
              "Storage não expõe ETag. Verifique configuração CORS.",
            );
          parts.push({ partNumber: number, etag });
        }
        setPercent(
          Math.round(((i + 1) / Math.ceil(file.size / init.partSize)) * 100),
        );
      }
      await api(`/uploads/${init.id}/complete`, { parts });
      setResume("");
      setFile(null);
      setMessage("Upload concluído. Extraindo metadados e capa…");
      onDone();
      await uploads.refetch();
    } catch (e) {
      setMessage((e as Error).message);
      await uploads.refetch();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2>Enviar arquivo</h2>
      <p>
        Use <code>Nome da Série - S01E02 - Título.mp4</code> para organizar
        automaticamente. Outros nomes ficam como vídeos avulsos.
      </p>
      <label>
        Grupo
        <select
          value={groupId}
          onChange={(e) => setGroup(e.target.value)}
          disabled={busy}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Upload
        <select
          value={resumeId}
          onChange={(e) => setResume(e.target.value)}
          disabled={busy}
        >
          <option value="">Novo upload</option>
          {uploads.data?.map((u) => (
            <option key={u.id} value={u.id}>
              Retomar: {u.media.filename}
            </option>
          ))}
        </select>
      </label>
      <input
        aria-label="Arquivo MP4"
        type="file"
        accept="video/mp4,.mp4"
        disabled={busy}
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <button
        onClick={() => void upload()}
        disabled={!file || !groupId || busy}
      >
        {busy ? `Enviando ${percent}%` : "Enviar / retomar"}
      </button>
      {resumeId && !busy && (
        <button
          onClick={async () => {
            try {
              await api(`/uploads/${resumeId}/abort`, {});
              setResume("");
              await uploads.refetch();
              onDone();
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Cancelar upload
        </button>
      )}
      <ErrorMessage message={message} />
    </section>
  );
}
function Player({ media, onClose }: { media: Media; onClose: () => void }) {
  const source = useQuery({
    queryKey: ["playback", media.id],
    queryFn: () =>
      api<{ source: string; expiresAt: string }>(
        `/media/${media.id}/playback-session`,
        {},
      ),
  });
  const [message, setMessage] = useState("");
  const lastSave = useRef(0),
    position = useRef(media.progress[0]?.position || 0),
    wasPlaying = useRef(false);
  useEffect(() => {
    if (!source.data) return;
    const wait = new Date(source.data.expiresAt).getTime() - Date.now() - 10000;
    const timer = setTimeout(() => void source.refetch(), Math.max(1000, wait));
    return () => clearTimeout(timer);
  }, [source.data]);
  return (
    <section>
      <h2>
        {media.series
          ? `${media.series} — S${media.season}E${media.episode} — `
          : ""}
        {media.title}
      </h2>
      <button onClick={onClose}>Fechar player</button>
      {source.isPending && <p>Autorizando reprodução…</p>}
      <ErrorMessage message={source.error?.message || message} />
      {source.data && (
        <video
          controls
          preload="metadata"
          src={source.data.source}
          onLoadedMetadata={(e) => {
            if (position.current < e.currentTarget.duration - 0.1)
              e.currentTarget.currentTime = position.current;
            if (wasPlaying.current) void e.currentTarget.play().catch(() => {});
          }}
          onPlay={() => {
            wasPlaying.current = true;
            setMessage("");
          }}
          onError={() =>
            setMessage(
              "Não foi possível reproduzir. Verifique sua sessão e o suporte a H.264/AAC neste navegador.",
            )
          }
          onTimeUpdate={(e) => {
            position.current = e.currentTarget.currentTime;
            if (Date.now() - lastSave.current > 10000) {
              lastSave.current = Date.now();
              void api(
                `/media/${media.id}/progress`,
                { position: e.currentTarget.currentTime },
                "PUT",
              ).catch(() => {});
            }
          }}
          onPause={(e) => {
            if (e.currentTarget.readyState > 0) wasPlaying.current = false;
            void api(
              `/media/${media.id}/progress`,
              { position: e.currentTarget.currentTime },
              "PUT",
            ).catch(() => {});
          }}
        />
      )}
    </section>
  );
}
function Administration({ groups }: { groups: Group[] }) {
  const pending = useQuery({
    queryKey: ["pending"],
    queryFn: () =>
      api<{ id: string; user: { email: string; name: string } }[]>(
        "/admin/access-requests",
      ),
  });
  const [groupId, setGroup] = useState(groups[0]?.id || ""),
    [error, setError] = useState("");
  const members = useQuery({
    queryKey: ["members", groupId],
    queryFn: () =>
      api<
        {
          role: string;
          allowUpload: boolean;
          active: boolean;
          user: { id: string; name: string; isAdmin: boolean };
        }[]
      >(`/households/${groupId}/members`),
    enabled: !!groupId,
  });
  const action = async (path: string, body: unknown, method?: string) => {
    try {
      await api(path, body, method);
      setError("");
      await pending.refetch();
      await members.refetch();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section>
      <h2>Administração da família</h2>
      <label>
        Grupo
        <select value={groupId} onChange={(e) => setGroup(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <ErrorMessage
        message={
          error || pending.error?.message || members.error?.message || ""
        }
      />
      <h3>Pedidos de acesso</h3>
      {pending.data?.length === 0 && <p>Nenhum pedido pendente.</p>}
      {pending.data?.map((r) => (
        <div key={r.id} className="row">
          <span>
            {r.user.name} ({r.user.email})
          </span>
          <button
            onClick={() =>
              void action(`/admin/access-requests/${r.id}/approve`, { groupId })
            }
          >
            Aprovar como membro
          </button>
          <button
            onClick={() =>
              void action(`/admin/access-requests/${r.id}/reject`, {})
            }
          >
            Rejeitar
          </button>
        </div>
      ))}
      <h3>Membros</h3>
      {members.data?.map((m) => (
        <div key={m.user.id} className="row">
          <span>
            {m.user.name} · {m.role} ·{" "}
            {m.active ? "Ativo" : "Suspenso no grupo"}
          </span>
          {!m.user.isAdmin && (
            <>
              <button
                onClick={() =>
                  void action(
                    `/households/${groupId}/members/${m.user.id}`,
                    { allowUpload: !m.allowUpload },
                    "PATCH",
                  )
                }
              >
                {m.allowUpload ? "Revogar upload" : "Permitir upload"}
              </button>
              <button
                onClick={() =>
                  void action(
                    `/households/${groupId}/members/${m.user.id}`,
                    { active: !m.active },
                    "PATCH",
                  )
                }
              >
                {m.active ? "Suspender no grupo" : "Reativar no grupo"}
              </button>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
function Sessions() {
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api<{ id: string; createdAt: string }[]>("/sessions"),
  });
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () =>
      api<
        { id: string; name: string; type: string; revokedAt: string | null }[]
      >("/devices"),
  });
  const [error, setError] = useState("");
  return (
    <section>
      <h2>Sessões e dispositivos</h2>
      <ErrorMessage
        message={
          error || sessions.error?.message || devices.error?.message || ""
        }
      />
      {sessions.data?.map((s) => (
        <div className="row" key={s.id}>
          <span>Sessão de {new Date(s.createdAt).toLocaleString()}</span>
          <button
            onClick={async () => {
              try {
                await api(`/sessions/${s.id}/revoke`, {});
                await sessions.refetch();
                await client.invalidateQueries({ queryKey: ["me"] });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Revogar
          </button>
        </div>
      ))}
      {devices.data?.length === 0 && (
        <p>
          Nenhum dispositivo pareado. Pareamento de TV será adicionado na Fase
          2.
        </p>
      )}
      {devices.data?.map((d) => (
        <div className="row" key={d.id}>
          <span>
            {d.name} · {d.type}
          </span>
          <button
            disabled={!!d.revokedAt}
            onClick={async () => {
              try {
                await api(`/devices/${d.id}/revoke`, {});
                await devices.refetch();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Revogar dispositivo
          </button>
        </div>
      ))}
    </section>
  );
}
function Library({ me }: { me: Me }) {
  const [q, setQ] = useState(""),
    [groupId, setGroup] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Media | null>(null),
    [tab, setTab] = useState("library");
  const groups = useQuery({
    queryKey: ["groups"],
    queryFn: () => api<Group[]>("/households"),
  });
  const media = useQuery({
    queryKey: ["media", q, groupId, page],
    queryFn: () =>
      api<{ items: Media[]; total: number }>(
        `/media?q=${encodeURIComponent(q)}&page=${page}${groupId ? `&groupId=${groupId}` : ""}`,
      ),
    refetchInterval: 5000,
  });
  const writable =
    groups.data?.filter(
      (g) =>
        me.isAdmin ||
        g.memberships.some((m) => m.role === "HOST" || m.allowUpload),
    ) || [];
  const sections: Record<string, Media[]> = {};
  for (const item of media.data?.items || []) {
    const key = item.series
      ? `${item.series} · Temporada ${item.season}`
      : "Vídeos avulsos";
    (sections[key] ??= []).push(item);
  }
  return (
    <>
      <header>
        <h1>Family Stream</h1>
        <span>{me.name}</span>
        <nav>
          <button onClick={() => setTab("library")}>Biblioteca</button>
          {me.isAdmin && (
            <button onClick={() => setTab("admin")}>Administrar</button>
          )}
          <button onClick={() => setTab("sessions")}>Sessões</button>
          <button
            onClick={async () => {
              await api("/auth/logout", {});
              client.clear();
              location.reload();
            }}
          >
            Sair
          </button>
        </nav>
      </header>
      <main>
        <ErrorMessage message={groups.error?.message || ""} />
        {tab === "admin" && groups.data && (
          <Administration groups={groups.data} />
        )}{" "}
        {tab === "sessions" && <Sessions />}
        {tab === "library" && (
          <>
            {selected && (
              <Player media={selected} onClose={() => setSelected(null)} />
            )}
            <section>
              <h2>Biblioteca</h2>
              <div className="row">
                <label>
                  Busca
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Título, série ou arquivo"
                  />
                </label>
                <label>
                  Grupo
                  <select
                    value={groupId}
                    onChange={(e) => {
                      setGroup(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">Todos os meus grupos</option>
                    {groups.data?.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <ErrorMessage message={media.error?.message || ""} />
              {media.isPending && <p>Carregando biblioteca…</p>}
              {media.data?.total === 0 && <p>Nenhum vídeo encontrado.</p>}
              {Object.entries(sections).map(([title, items]) => (
                <div key={title}>
                  <h3>{title}</h3>
                  <div className="grid">
                    {items.map((m) => (
                      <article key={m.id}>
                        {["READY", "INCOMPATIBLE"].includes(m.status) && (
                          <img
                            loading="lazy"
                            alt=""
                            src={`/api/v1/media/${m.id}/thumbnail`}
                          />
                        )}
                        <h4>
                          {m.episode !== null ? `E${m.episode} · ` : ""}
                          {m.title}
                        </h4>
                        <p className="filename">{m.filename}</p>
                        <p>
                          {{
                            UPLOADING: "Aguardando upload",
                            PROCESSING: "Processando",
                            READY: "Pronto",
                            INCOMPATIBLE: "Codec incompatível",
                            FAILED: "Falha",
                          }[m.status as "READY"] || m.status}
                          {m.duration
                            ? ` · ${Math.ceil(m.duration / 60)} min`
                            : ""}
                        </p>
                        {m.processingError && (
                          <p role="status">{m.processingError}</p>
                        )}
                        <button
                          disabled={m.status !== "READY"}
                          onClick={() => setSelected(m)}
                        >
                          {m.progress[0]?.position
                            ? "Continuar assistindo"
                            : "Reproduzir"}
                        </button>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
              <div className="row">
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </button>
                <span>Página {page}</span>
                <button
                  disabled={!media.data || page * 100 >= media.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </button>
              </div>
            </section>
            {writable.length > 0 && (
              <Uploader
                groups={writable}
                onDone={() =>
                  void client.invalidateQueries({ queryKey: ["media"] })
                }
              />
            )}
          </>
        )}
      </main>
    </>
  );
}
function App() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me") });
  if (me.isPending) return <p>Carregando…</p>;
  return me.data ? (
    <Library me={me.data} />
  ) : (
    <Login
      onLogin={() => void queryClient.invalidateQueries({ queryKey: ["me"] })}
    />
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route
            path="*"
            element={
              <main>
                <h1>Rota indisponível</h1>
                <p>O modo TV com pareamento será implementado na Fase 2.</p>
                <Link to="/">Abrir biblioteca</Link>
              </main>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
