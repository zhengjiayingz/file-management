import {
  appendTempMessage,
  login,
  saveToDrive,
  saveToWrongBook,
  streamAskOrSolve,
  uploadTempImage,
} from '../shared/api.js';
import {
  clearAuth,
  DEFAULT_API_BASE,
  getApiBase,
  getToken,
  setAuth,
} from '../shared/config.js';

const loginView = document.getElementById('loginView');
const mainView = document.getElementById('mainView');
const apiBaseInput = document.getElementById('apiBase');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const loginErr = document.getElementById('loginErr');
const logoutBtn = document.getElementById('logoutBtn');
const userLabel = document.getElementById('userLabel');
const captureBtn = document.getElementById('captureBtn');
const preview = document.getElementById('preview');
const tempMeta = document.getElementById('tempMeta');
const chatEl = document.getElementById('chat');
const draft = document.getElementById('draft');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const saveDriveBtn = document.getElementById('saveDriveBtn');
const saveWrongBtn = document.getElementById('saveWrongBtn');
const saveResult = document.getElementById('saveResult');
const toastEl = document.getElementById('toast');

/** @type {'selection' | 'solve'} */
let mode = 'selection';
let tempImageId = '';
/** @type {{ role: 'user' | 'assistant', content: string }[]} */
let messages = [];
let streaming = false;
/** @type {AbortController | null} */
let abortCtrl = null;

function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove('hidden');
  setTimeout(() => toastEl.classList.add('hidden'), 2200);
}

function renderChat(streamingText = '') {
  chatEl.innerHTML = '';
  if (!messages.length && !streamingText) {
    chatEl.innerHTML =
      '<p class="muted" style="margin:8px">暂无消息。框选截图后发送问题。</p>';
    return;
  }
  for (const m of messages) {
    const div = document.createElement('div');
    div.className = `bubble ${m.role === 'user' ? 'user' : ''}`;
    div.innerHTML = `<div class="role">${m.role === 'user' ? '我' : 'AI'}</div>`;
    const pre = document.createElement('div');
    pre.textContent = m.content;
    div.appendChild(pre);
    chatEl.appendChild(div);
  }
  if (streamingText) {
    const div = document.createElement('div');
    div.className = 'bubble';
    div.innerHTML = '<div class="role">AI</div>';
    const pre = document.createElement('div');
    pre.textContent = streamingText;
    div.appendChild(pre);
    chatEl.appendChild(div);
  }
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function refreshAuthUi() {
  const token = await getToken();
  const { username } = await chrome.storage.local.get('username');
  apiBaseInput.value = await getApiBase();
  if (token) {
    loginView.classList.add('hidden');
    mainView.classList.remove('hidden');
    userLabel.textContent = username ? `已登录：${username}` : '已登录';
  } else {
    mainView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }
}

loginBtn.addEventListener('click', async () => {
  loginErr.textContent = '';
  loginBtn.disabled = true;
  try {
    const apiBase = apiBaseInput.value.trim() || DEFAULT_API_BASE;
    await setAuth({ apiBase });
    const data = await login(
      usernameInput.value.trim(),
      passwordInput.value,
    );
    await setAuth({
      apiBase,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || '',
      username: data.user?.username || usernameInput.value.trim(),
    });
    passwordInput.value = '';
    toast('登录成功');
    await refreshAuthUi();
  } catch (e) {
    loginErr.textContent = e instanceof Error ? e.message : String(e);
  } finally {
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  await clearAuth();
  resetCapture();
  await refreshAuthUi();
});

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (streaming) return;
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.getAttribute('data-mode') === 'solve' ? 'solve' : 'selection';
    messages = [];
    renderChat();
  });
});

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(meta)?.[1] || 'image/png';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function resetCapture() {
  tempImageId = '';
  messages = [];
  preview.classList.add('hidden');
  preview.removeAttribute('src');
  tempMeta.textContent = '';
  saveResult.textContent = '';
  renderChat();
}

captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'START_REGION_CAPTURE' });
    if (!res?.ok) throw new Error(res?.error || '截图失败');
    preview.src = res.dataUrl;
    preview.classList.remove('hidden');
    const blob = dataUrlToBlob(res.dataUrl);
    const uploaded = await uploadTempImage(blob, `capture-${Date.now()}.png`);
    tempImageId = uploaded.tempImageId;
    messages = [];
    renderChat();
    tempMeta.textContent = `tempImageId: ${tempImageId}\n过期: ${uploaded.expiresAt}`;
    toast('截图已上传（临时）');
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e));
  } finally {
    captureBtn.disabled = false;
  }
});

async function send() {
  const q = draft.value.trim();
  if (!tempImageId) {
    toast('请先框选截图');
    return;
  }
  if (!q || streaming) return;

  const history = messages.map((m) => ({ role: m.role, content: m.content }));
  messages.push({ role: 'user', content: q });
  draft.value = '';
  streaming = true;
  sendBtn.disabled = true;
  stopBtn.disabled = false;
  abortCtrl = new AbortController();
  let buffer = '';
  renderChat('…');

  try {
    await streamAskOrSolve({
      tempImageId,
      mode,
      question: q,
      messages: history,
      signal: abortCtrl.signal,
      onChunk: (t) => {
        buffer += t;
        renderChat(buffer || '…');
      },
    });
    const answer = buffer.trim();
    if (answer) {
      messages.push({ role: 'assistant', content: answer });
      try {
        await appendTempMessage(tempImageId, mode, { role: 'user', content: q });
        await appendTempMessage(tempImageId, mode, {
          role: 'assistant',
          content: answer,
        });
      } catch {
        /* 落盘失败不打断 */
      }
    }
  } catch (e) {
    if (e?.name === 'AbortError') toast('已停止');
    else toast(e instanceof Error ? e.message : String(e));
  } finally {
    streaming = false;
    sendBtn.disabled = false;
    stopBtn.disabled = true;
    abortCtrl = null;
    renderChat();
  }
}

sendBtn.addEventListener('click', () => void send());
draft.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    void send();
  }
});
stopBtn.addEventListener('click', () => abortCtrl?.abort());

saveDriveBtn.addEventListener('click', async () => {
  if (!tempImageId) {
    toast('请先截图');
    return;
  }
  saveDriveBtn.disabled = true;
  try {
    const data = await saveToDrive(tempImageId);
    saveResult.textContent = `已存网盘 userFileId=${data.userFileId}`;
    toast('已保存到网盘');
    resetCapture();
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e));
  } finally {
    saveDriveBtn.disabled = false;
  }
});

saveWrongBtn.addEventListener('click', async () => {
  if (!tempImageId) {
    toast('请先截图');
    return;
  }
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant')?.content;
  if (!lastAssistant?.trim()) {
    toast('请先完成至少一轮解题/问答');
    return;
  }
  saveWrongBtn.disabled = true;
  try {
    const item = await saveToWrongBook({
      tempImageId,
      answerText: lastAssistant,
      difficulty: 'medium',
      tags: ['浏览器插件'],
    });
    saveResult.textContent = `已写入错题本 id=${item.id ?? '?'}`;
    toast('已存入错题本');
    resetCapture();
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e));
  } finally {
    saveWrongBtn.disabled = false;
  }
});

renderChat();
void refreshAuthUi();
