import { getApiBase, getToken } from './config.js';

async function authHeaders(extra = {}) {
  const token = await getToken();
  if (!token) throw new Error('未登录');
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function parseError(res) {
  let message = `请求失败 (${res.status})`;
  try {
    const data = await res.json();
    if (typeof data.message === 'string') message = data.message;
    else if (Array.isArray(data.message)) message = data.message.join('; ');
  } catch {
    /* ignore */
  }
  return message;
}

export async function login(username, password) {
  const base = await getApiBase();
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.message || (await parseError(res)));
  }
  if (data.code === 'MFA_REQUIRED') {
    throw new Error('该账号开启了 MFA，试用版请暂用未开 MFA 的账号');
  }
  return data.data;
}

export async function uploadTempImage(blob, fileName = 'capture.png') {
  const base = await getApiBase();
  const form = new FormData();
  form.append('file', blob, fileName);
  const res = await fetch(`${base}/api/ai/math-temp-images`, {
    method: 'POST',
    headers: await authHeaders(),
    body: form,
  });
  if (!res.ok) throw new Error(await parseError(res));
  const json = await res.json();
  return json.data;
}

export async function appendTempMessage(tempImageId, mode, body) {
  const base = await getApiBase();
  const res = await fetch(
    `${base}/api/ai/math-temp-images/${tempImageId}/chat-sessions/${mode}/messages`,
    {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

async function readTextStream(res, onChunk) {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) onChunk(decoder.decode(value, { stream: true }));
  }
  onChunk(decoder.decode());
}

export async function streamAskOrSolve({
  tempImageId,
  mode,
  question,
  messages,
  signal,
  onChunk,
}) {
  const base = await getApiBase();
  const path = mode === 'solve' ? 'solve' : 'ask';
  const res = await fetch(
    `${base}/api/ai/math-temp-images/${tempImageId}/${path}`,
    {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ question, messages }),
      signal,
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  await readTextStream(res, onChunk);
}

export async function saveToDrive(tempImageId) {
  const base = await getApiBase();
  const res = await fetch(
    `${base}/api/ai/math-temp-images/${tempImageId}/save-to-drive`,
    {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        includeTranscript: false,
        copyChat: true,
      }),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  const json = await res.json();
  return json.data;
}

export async function saveToWrongBook(body) {
  const base = await getApiBase();
  const res = await fetch(`${base}/api/wrong-questions/from-temp`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
