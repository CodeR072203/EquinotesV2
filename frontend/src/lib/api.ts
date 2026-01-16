// /var/www/html/EquinotesV2/frontend/src/lib/api.ts

export type ApiCall = {
  id: number;
  status: string;
  startTime: string;
  endTime: string | null;
  durationSec: number | null;
  updatedAt: string;

  clientTranscript: string;
  agentTranscript: string;
  combinedTranscript: string;
};

function getToken(): string | null {
  return localStorage.getItem("token");
}

function isUnauthorized(res: Response): boolean {
  return res.status === 401;
}

export async function apiGet<T>(path: string): Promise<T> {
  const token = getToken();

  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  // IMPORTANT: do NOT wipe storage automatically; let the UI decide how to handle 401s
  if (isUnauthorized(res)) {
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken();

  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // IMPORTANT: do NOT wipe storage automatically; let the UI decide how to handle 401s
  if (isUnauthorized(res)) {
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken();

  const res = await fetch(path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // IMPORTANT: do NOT wipe storage automatically; let the UI decide how to handle 401s
  if (isUnauthorized(res)) {
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}
