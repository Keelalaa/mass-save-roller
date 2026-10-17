// Runs on the Mass Save Roller website. Bridges the page and the add-on with window.postMessage.
(function () {
  const VERSION = chrome.runtime.getManifest().version;
  const post = data => window.postMessage(Object.assign({ source: 'msr-ext', version: VERSION }, data), location.origin);
  const alive = () => { try { return !!chrome.runtime.id; } catch (e) { return false; } };

  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.source !== 'msr-page') return;
    if (e.data.type === 'ping') {
      if (!alive()) { post({ type: 'stale' }); return; }
      chrome.runtime.sendMessage({ type: 'msr-ping' }, res => {
        if (chrome.runtime.lastError) { post({ type: 'stale' }); return; }
        post({ type: 'pong', roll20Open: !!(res && res.roll20Open) });
      });
    }
  });
  chrome.runtime.onMessage.addListener(msg => {
    if (msg && msg.type === 'msr-roll') post({ type: 'roll', roll: msg.roll });
  });
})();
