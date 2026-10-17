// Runs on the Mass Save Roller website. Bridges the page and the add-on with window.postMessage.
(function () {
  const VERSION = chrome.runtime.getManifest().version;
  const post = data => window.postMessage(Object.assign({ source: 'msr-ext', version: VERSION }, data), location.origin);
  const alive = () => { try { return !!chrome.runtime.id; } catch (e) { return false; } };
  const ask = (msg, cb) => {
    if (!alive()) { post({ type: 'stale' }); return; }
    chrome.runtime.sendMessage(msg, res => {
      if (chrome.runtime.lastError) { post({ type: 'stale' }); return; }
      cb(res || {});
    });
  };

  window.addEventListener('message', e => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== 'msr-page') return;
    if (d.type === 'ping') ask({ type: 'msr-ping' }, res => post({ type: 'pong', roll20Open: !!res.roll20Open }));
    else if (d.type === 'cmd') ask({ type: 'msr-cmd', text: d.text }, res => post({ type: 'cmdack', req: d.req, ok: !!res.ok, error: res.error }));
    else if (d.type === 'setup') ask({ type: 'msr-setup' }, res => post({ type: 'setupack', ok: !!res.ok }));
  });
  chrome.runtime.onMessage.addListener(msg => {
    if (msg && msg.type === 'msr-roll') post({ type: 'roll', roll: msg.roll });
    else if (msg && msg.type === 'msr-reply') post({ type: 'reply', kind: msg.kind, data: msg.data });
  });
})();
