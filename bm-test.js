// Test payload for the bookmark button: proves a bookmark can run our code inside Roll20.
(function () {
  const ok = typeof window.Campaign === 'object';
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:999999;background:#211c27;color:#f0cf86;border:2px solid #d6ad55;border-radius:10px;padding:14px 20px;font:bold 18px system-ui,sans-serif;box-shadow:0 8px 30px #000a';
  box.textContent = ok ? '✅ Mass Save bookmark works in Roll20!' : '⚠️ Bookmark ran, but this isn’t a Roll20 game page';
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 6000);
  fetch('https://mass-save-roller.vercel.app/api/log', { method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ src: 'bm', v: 'test', ev: 'bookmark-test', msg: (ok ? 'ran in Roll20 game' : 'ran on ' + location.hostname) }) }).catch(() => {});
})();
