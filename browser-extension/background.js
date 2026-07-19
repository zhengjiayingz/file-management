/** 点击扩展图标 → 打开 Side Panel */
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

/**
 * Side Panel 发起框选：注入 overlay → 截可见区域 → 回传 crop 坐标 → 裁剪
 * 裁剪在 content script 完成（SW 无 DOM）。
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'START_REGION_CAPTURE') {
    startRegionCapture()
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

async function startRegionCapture() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id) throw new Error('没有可用标签页');
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    throw new Error('系统页面无法截图，请打开普通网页后再试');
  }

  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['content/select-overlay.css'],
  });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/select-overlay.js'],
  });

  const rect = await chrome.tabs.sendMessage(tab.id, {
    type: 'FM_BEGIN_SELECT',
  });
  if (!rect?.ok) {
    throw new Error(rect?.error || '已取消框选');
  }

  const shot = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png',
  });

  const cropped = await chrome.tabs.sendMessage(tab.id, {
    type: 'FM_CROP_SHOT',
    dataUrl: shot,
    rect: rect.rect,
    dpr: rect.dpr,
  });
  if (!cropped?.ok || !cropped.dataUrl) {
    throw new Error(cropped?.error || '裁剪失败');
  }
  return cropped.dataUrl;
}
