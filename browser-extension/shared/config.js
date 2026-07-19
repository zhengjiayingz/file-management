/** 默认对接本地 Nest；可在 Side Panel 设置里覆盖并写入 chrome.storage */
export const DEFAULT_API_BASE = 'http://localhost:3000';

export async function getApiBase() {
  const { apiBase } = await chrome.storage.local.get('apiBase');
  return (apiBase && String(apiBase).trim()) || DEFAULT_API_BASE;
}

export async function getToken() {
  const { accessToken } = await chrome.storage.local.get('accessToken');
  return accessToken || '';
}

export async function setAuth(data) {
  await chrome.storage.local.set(data);
}

export async function clearAuth() {
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'username']);
}
