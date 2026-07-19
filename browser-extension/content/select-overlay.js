(() => {
  if (window.__fmSelectOverlayInstalled) return;
  window.__fmSelectOverlayInstalled = true;

  let selecting = false;
  let startX = 0;
  let startY = 0;
  let boxEl = null;
  let maskEl = null;
  let resolveSelect = null;

  function cleanup() {
    selecting = false;
    document.removeEventListener('mousedown', onDown, true);
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseup', onUp, true);
    document.removeEventListener('keydown', onKey, true);
    maskEl?.remove();
    boxEl?.remove();
    maskEl = null;
    boxEl = null;
  }

  function onKey(e) {
    if (e.key === 'Escape' && selecting) {
      e.preventDefault();
      cleanup();
      resolveSelect?.({ ok: false, error: '已取消框选' });
      resolveSelect = null;
    }
  }

  function onDown(e) {
    if (!selecting) return;
    e.preventDefault();
    e.stopPropagation();
    startX = e.clientX;
    startY = e.clientY;
    if (!boxEl) {
      boxEl = document.createElement('div');
      boxEl.className = 'fm-select-box';
      document.documentElement.appendChild(boxEl);
    }
    boxEl.style.left = `${startX}px`;
    boxEl.style.top = `${startY}px`;
    boxEl.style.width = '0px';
    boxEl.style.height = '0px';
  }

  function onMove(e) {
    if (!selecting || !boxEl) return;
    e.preventDefault();
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    boxEl.style.left = `${x}px`;
    boxEl.style.top = `${y}px`;
    boxEl.style.width = `${w}px`;
    boxEl.style.height = `${h}px`;
  }

  function onUp(e) {
    if (!selecting) return;
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    cleanup();
    if (w < 8 || h < 8) {
      resolveSelect?.({ ok: false, error: '选区太小，请重新框选' });
    } else {
      resolveSelect?.({
        ok: true,
        rect: { x, y, w, h },
        dpr: window.devicePixelRatio || 1,
      });
    }
    resolveSelect = null;
  }

  function beginSelect() {
    return new Promise((resolve) => {
      cleanup();
      resolveSelect = resolve;
      selecting = true;
      maskEl = document.createElement('div');
      maskEl.className = 'fm-select-mask';
      maskEl.innerHTML =
        '<div class="fm-select-hint">拖拽框选题目区域 · Esc 取消</div>';
      document.documentElement.appendChild(maskEl);
      document.addEventListener('mousedown', onDown, true);
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
      document.addEventListener('keydown', onKey, true);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('截图加载失败'));
      img.src = dataUrl;
    });
  }

  async function cropShot(dataUrl, rect, dpr) {
    const img = await loadImage(dataUrl);
    const scale = dpr || window.devicePixelRatio || 1;
    const sx = Math.round(rect.x * scale);
    const sy = Math.round(rect.y * scale);
    const sw = Math.round(rect.w * scale);
    const sh = Math.round(rect.h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, sw);
    canvas.height = Math.max(1, sh);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/png');
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'FM_BEGIN_SELECT') {
      beginSelect().then(sendResponse);
      return true;
    }
    if (msg?.type === 'FM_CROP_SHOT') {
      cropShot(msg.dataUrl, msg.rect, msg.dpr)
        .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
        .catch((err) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      return true;
    }
    return false;
  });
})();
