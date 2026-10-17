// Relays between the Roll20 game tab and the Mass Save Roller website tab. Keeps no state of its
// own: the website decides what to ask for and what to do with the answers.
const SITE_URLS = ['https://mass-save-roller.vercel.app/*', 'http://localhost:8765/*'];
const ROLL20_URLS = ['https://app.roll20.net/editor*'];

const toSites = msg => chrome.tabs.query({ url: SITE_URLS }, tabs =>
  tabs.forEach(t => chrome.tabs.sendMessage(t.id, msg, () => void chrome.runtime.lastError)));

// The Roll20 tab to talk to: the most recently used one if there are several.
function roll20Tab(cb) {
  chrome.tabs.query({ url: ROLL20_URLS }, tabs => {
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    cb(tabs[0] || null);
  });
}
const scriptCode = () => fetch(chrome.runtime.getURL('MassSaveLink.js')).then(r => r.text());

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  switch (msg.type) {
    case 'msr-log':
      fetch('https://mass-save-roller.vercel.app/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: 'addon', v: chrome.runtime.getManifest().version, ev: msg.ev, msg: msg.msg }) }).catch(() => {});
      return;
    case 'msr-roll':
    case 'msr-reply':
      toSites(msg);
      return;
    case 'msr-ping':
      roll20Tab(t => reply({ roll20Open: !!t }));
      return true;
    case 'msr-cmd':
      roll20Tab(t => {
        if (!t) { reply({ ok: false, error: 'noroll20' }); return; }
        chrome.tabs.sendMessage(t.id, msg, res => {
          if (chrome.runtime.lastError || !res) reply({ ok: false, error: 'stale' });
          else reply(res.ok ? { ok: true } : { ok: false, error: 'nochat' });
        });
      });
      return true;
    case 'msr-setup':
      roll20Tab(t => {
        const open = id => {
          chrome.tabs.create({ url: id ? `https://app.roll20.net/campaigns/scripts/${id}#msr-install` : 'https://app.roll20.net/campaigns/search' });
          reply({ ok: !!id });
        };
        if (!t) { open(null); return; }
        chrome.tabs.sendMessage(t.id, { type: 'msr-campaign' }, res => { void chrome.runtime.lastError; open(res && res.id); });
      });
      return true;
    case 'msr-script':
      scriptCode().then(code => reply({ code }));
      return true;
    case 'msr-install':
      scriptCode().then(code => chrome.scripting.executeScript({
        target: { tabId: sender.tab.id }, world: 'MAIN', func: installInPage, args: [code]
      })).then(r => reply((r && r[0] && r[0].result) || { ok: false, why: 'no result' }))
        .catch(e => reply({ ok: false, why: String(e && e.message || e) }));
      return true;
  }
});

// Runs inside Roll20's Mod Scripts page. Opens the existing "MassSaveLink.js" tab (or "New
// Script"), puts the code in the editor and presses Save Script.
async function installInPage(code) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => el && el.offsetParent !== null;
  const byText = (sel, re) => [...document.querySelectorAll(sel)].find(el => vis(el) && re.test(el.textContent.trim()));
  const tab = byText('a, li, button', /^MassSaveLink\.js$/) || byText('a, li, button', /^New Script$/i);
  if (!tab) return { ok: false, why: 'Could not find the New Script tab' };
  const isNew = /new script/i.test(tab.textContent);
  tab.click();
  await sleep(700);
  const ed = [...document.querySelectorAll('.ace_editor')].find(vis);
  if (!ed || !window.ace) return { ok: false, why: 'Could not find the script editor' };
  if (isNew) {
    const name = [...document.querySelectorAll('input[type=text], input:not([type])')].find(i => vis(i));
    if (name) {
      name.value = 'MassSaveLink.js';
      name.dispatchEvent(new Event('input', { bubbles: true }));
      name.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  window.ace.edit(ed).setValue(code, -1);
  await sleep(300);
  const save = byText('button, a, input[type=button], input[type=submit]', /^Save Script$/i);
  if (!save) return { ok: false, why: 'Could not find the Save Script button' };
  save.click();
  return { ok: true };
}
