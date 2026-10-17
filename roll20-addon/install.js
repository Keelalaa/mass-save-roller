// Runs on Roll20's Mod (API) Scripts page. Shows a small box that installs the Mass Save Link
// script with one click, with a copy-and-paste fallback in case Roll20's page changes.
(function () {
  if (document.getElementById('msr-setup')) return;
  const box = document.createElement('div');
  box.id = 'msr-setup';
  box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;width:320px;background:#211c27;color:#ece6f2;border:2px solid #d6ad55;border-radius:10px;padding:14px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px #0009';
  box.innerHTML = `
    <div style="font-weight:700;color:#f0cf86;margin-bottom:6px">⚔️ Mass Save Roller setup</div>
    <div style="margin-bottom:10px">This adds the small script that lets the website change token HP. Only tokens you have selected are ever changed.</div>
    <button id="msr-auto" style="width:100%;padding:9px;border:0;border-radius:7px;background:#d6ad55;color:#1b1408;font-weight:700;cursor:pointer">Install it for me</button>
    <div id="msr-msg" style="margin-top:8px;font-size:13px"></div>
    <details style="margin-top:8px;font-size:13px"><summary style="cursor:pointer">Do it by hand instead</summary>
      <ol style="padding-left:18px;margin:6px 0">
        <li><a href="#" id="msr-copy" style="color:#f0cf86">Copy the script</a></li>
        <li>Click <b>New Script</b>, name it <b>MassSaveLink.js</b></li>
        <li>Paste it into the big box and click <b>Save Script</b></li>
      </ol>
    </details>
    <div style="text-align:right;margin-top:6px"><a href="#" id="msr-close" style="color:#a69cb3;font-size:12px">close</a></div>`;
  document.body.appendChild(box);
  const msg = (html, color) => { const m = box.querySelector('#msr-msg'); m.innerHTML = html; m.style.color = color || '#ece6f2'; };

  box.querySelector('#msr-auto').onclick = () => {
    msg('Installing…');
    chrome.runtime.sendMessage({ type: 'msr-install' }, res => {
      if (chrome.runtime.lastError || !res) { msg('Something went wrong — use "Do it by hand" below.', '#e0565b'); return; }
      if (res.ok) msg('✅ Done! Wait a few seconds for Roll20 to restart the scripts, then go back to your game and the website.', '#4fbf7a');
      else { msg(`Couldn't do it automatically (${res.why}). Use "Do it by hand" below.`, '#e6a23c'); box.querySelector('details').open = true; }
    });
  };
  box.querySelector('#msr-copy').onclick = e => {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'msr-script' }, res => {
      navigator.clipboard.writeText(res.code).then(() => msg('Copied! Now paste it into the New Script box.', '#4fbf7a'),
        () => msg('Could not copy — try again.', '#e0565b'));
    });
  };
  box.querySelector('#msr-close').onclick = e => { e.preventDefault(); box.remove(); };
})();
