export interface ChatGptConnectorStatus {
  configured: boolean;
  tokenPreview: string | null;
  createdAt: string | null;
  rotatedAt: string | null;
  apiBaseUrl: string;
  openApiUrl: string;
  snapshotUrl: string;
  requiresPublicHttps: boolean;
}

export interface ChatGptConnectorRotateResult extends ChatGptConnectorStatus {
  token: string;
}

export interface ChatGptConnectorExtrasPayload {
  intelNotes: unknown[];
  financeScenarios: unknown[];
  trackedBrands: unknown[];
  companyProfiles: unknown[];
  ideas: unknown[];
  founders: unknown[];
  founderPodcasts: unknown[];
  podcastEpisodes: unknown[];
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function getChatGptConnectorStatus(): Promise<ChatGptConnectorStatus> {
  const res = await fetch('/api/chatgpt/status', { cache: 'no-store' });
  return parseJsonResponse<ChatGptConnectorStatus>(res);
}

export async function rotateChatGptConnectorToken(): Promise<ChatGptConnectorRotateResult> {
  const res = await fetch('/api/chatgpt/token/rotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rotate: true }),
  });
  return parseJsonResponse<ChatGptConnectorRotateResult>(res);
}

export async function syncChatGptConnectorExtras(payload: ChatGptConnectorExtrasPayload): Promise<void> {
  const res = await fetch('/api/chatgpt/extras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await parseJsonResponse<{ ok: true }>(res);
}