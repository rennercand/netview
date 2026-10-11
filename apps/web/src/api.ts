export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const csrf = document.cookie
    .split("; ")
    .find((c) => c.startsWith("fs_csrf="))
    ?.split("=")[1];
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || "Falha na requisição");
  return data as T;
}
export type Me = { id: string; name: string; email: string; isAdmin: boolean };
export type Group = {
  id: string;
  name: string;
  usedBytes: string;
  reservedBytes: string;
  quotaBytes: string;
  memberships: { role: string; allowUpload: boolean }[];
};
export type Media = {
  id: string;
  groupId: string;
  title: string;
  filename: string;
  series: string | null;
  season: number | null;
  episode: number | null;
  status: string;
  duration: number | null;
  processingError: string | null;
  progress: { position: number }[];
};
export type Upload = {
  id: string;
  mediaId: string;
  expectedSize: string;
  expiresAt: string;
  media: { filename: string; groupId: string };
};
