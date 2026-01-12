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

export async function apiGet<T>(path: string): Promise<T> {
  const token = getToken();

  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("agent");
    localStorage.removeItem("agentPublicId");
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json();
}
