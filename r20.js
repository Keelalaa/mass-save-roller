// Mass Save Roller — Roll20 link. Loaded by the "⚔️ Mass Save" bookmark inside a Roll20 game.
// It opens (or re-links) the website window, sends the GM's NEW dice rolls to it, and changes the
// HP of tokens on the GM's command. Safety rule: it only ever changes tokens that are selected in
// Roll20 at that moment. Nothing is installed; reloading Roll20 removes it.
(function () {
  const VERSION = '2.0.0';
  const SITE = 'https://mass-save-roller.vercel.app';
  const TAG = '[Mass Save link]';

  // Clicking the bookmark again: just re-open / re-link the website window.
  if (window.__msrLink) { window.__msrLink.relink(window.__msrWin); return; }

  let win = window.__msrWin || null;
  const send = data => { try { if (win && !win.closed) win.postMessage(Object.assign({ source: 'msr-ext', version: VERSION }, data), SITE); } catch (e) {} };
  const logEv = (ev, msg) => {
    try {
      fetch(SITE + '/api/log', { method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ src: 'bm', v: VERSION, ev, msg: String(msg) }) }).catch(() => {});
    } catch (e) {}
  };

  // ---------- Roll20 internals ----------
  function d20() {
    const page = window.Campaign && Campaign.activePage && Campaign.activePage();
    const m = page && page.thegraphics && page.thegraphics.models.find(x => x.d20);
    return m ? m.d20 : null;
  }
  function selectedGraphics() {
    const d = d20();
    if (!d || !d.engine || !d.engine.tabletopSelected) throw new Error('noselect');
    const graphics = Campaign.activePage().thegraphics;
    return d.engine.tabletopSelected().map(x => x && x.model).filter(m => m && m.get && graphics.get(m.id) === m);
  }
  function barAttr(m, bar) {
    const link = m.get('bar' + bar + '_link');
    if (!link) return null;
    const ch = Campaign.characters && Campaign.characters.get(m.get('represents'));
    return ch && ch.attribs && ch.attribs.get ? ch.attribs.get(link) : null;
  }
  function readBar(m, bar) {
    const a = barAttr(m, bar);
    const cur = a ? a.get('current') : m.get('bar' + bar + '_value');
    const max = a ? a.get('max') : m.get('bar' + bar + '_max');
    const n = parseInt(cur, 10);
    return { cur: String(cur ?? '').trim() === '' || isNaN(n) ? null : n, max: parseInt(max, 10) || 0 };
  }
  function writeBar(m, bar, cur, max) {
    const a = barAttr(m, bar);
    if (a) { a.save(max != null ? { current: cur, max } : { current: cur }); return; }
    const ch = { ['bar' + bar + '_value']: cur };
    if (max != null) ch['bar' + bar + '_max'] = max;
    m.save(ch);
  }
  function setDead(m, dead) {
    const list = String(m.get('statusmarkers') || '').split(',').filter(x => x && x !== 'dead');
    if (dead) list.push('dead');
    m.save({ statusmarkers: list.join(',') });
  }

  // Same command language the website already speaks: "!msr-<cmd> <req> opt=val id:number ..."
  function runCommand(text) {
    const parts = String(text).trim().split(/\s+/), cmd = parts[0], req = parts[1] || '';
    const opts = {}, pairs = [];
    parts.slice(2).forEach(p => {
      const eq = /^(bar|dead)=(\w+)$/.exec(p);
      if (eq) { opts[eq[1]] = eq[2]; return; }
      const i = p.lastIndexOf(':');
      if (i > 0) pairs.push({ id: p.slice(0, i), n: parseInt(p.slice(i + 1), 10) || 0 });
    });
    const bar = /^[123]$/.test(opts.bar) ? opts.bar : '1';
    const reply = (kind, data) => send({ type: 'reply', kind, data: Object.assign({ req }, data) });

    if (cmd === '!msr-ping') { reply('PONG', { v: VERSION }); return; }

    const sel = selectedGraphics();
    const selById = new Map(sel.map(m => [m.id, m]));

    if (cmd === '!msr-sel') {
      reply('SEL', { tokens: sel.map(m => { const b = readBar(m, bar); return { id: m.id, name: m.get('name') || '', hp: b.cur, max: b.max }; }) });
      return;
    }
    // !msr-dmg: take damage (negative heals). !msr-init: set the bar's HP and max (for image
    // tokens whose bar was empty, or after "Reset all HP" on the website).
    if (cmd === '!msr-dmg' || cmd === '!msr-init') {
      const results = [], notSelected = [];
      pairs.forEach(p => {
        const m = selById.get(p.id);
        if (!m) { notSelected.push(p.id); return; }           // never touch unselected tokens
        const b = readBar(m, bar);
        if (cmd === '!msr-init') {
          writeBar(m, bar, Math.max(0, p.n), Math.max(0, p.n));
          results.push({ id: p.id, hp: p.n, max: p.n });
          return;
        }
        if (b.cur === null) { results.push({ id: p.id, skipped: 'no HP on bar ' + bar }); return; }
        let hp = Math.max(0, b.cur - p.n);
        if (b.max > 0) hp = Math.min(hp, Math.max(b.max, b.cur));
        writeBar(m, bar, hp);
        if (opts.dead === '1') setDead(m, hp <= 0);
        results.push({ id: p.id, name: m.get('name'), hp, max: b.max });
      });
      reply(cmd === '!msr-init' ? 'INIT' : 'DMG', { results, missing: [], notSelected });
    }
  }

  // ---------- reading dice from chat ----------
  function parseMessage(msg) {
    const rolls = [];
    if (msg.classList.contains('rollresult')) {
      const dice = [...msg.querySelectorAll('.diceroll')].map(el => {
        const m = /\bd(\d+)\b/.exec(el.className);
        const v = parseInt((el.querySelector('.didroll') || el).textContent, 10);
        return { sides: m ? +m[1] : 0, value: v, dropped: el.classList.contains('dropped') };
      }).filter(d => d.sides && Number.isFinite(d.value));
      const totalEl = msg.querySelector('.rolled');
      const formulaEl = [...msg.querySelectorAll('.formula')].find(f => !f.classList.contains('formattedformula'));
      const formula = (formulaEl ? formulaEl.textContent : '').replace(/^\s*rolling\s*/i, '').trim();
      if (dice.length) rolls.push({ dice, total: totalEl ? parseInt(totalEl.textContent, 10) : sum(dice), formula });
    }
    msg.querySelectorAll('.inlinerollresult').forEach(el => { const r = parseInline(el); if (r) rolls.push(r); });
    return rolls;
  }
  function parseInline(el) {
    const raw = el.getAttribute('title') || el.getAttribute('original-title') || el.getAttribute('data-original-title') || '';
    const m = /Rolling\s+(.+?)\s*=\s*([\s\S]*)$/i.exec(raw);
    if (!m) return null;
    const formula = m[1].replace(/<[^>]*>/g, '').trim();
    const terms = [...formula.matchAll(/(\d*)d(\d+)/gi)].map(t => +t[2]);
    const box = document.createElement('div');
    box.innerHTML = m[2];
    const groups = [];
    let depth = 0, cur = null;
    const walk = node => node.childNodes.forEach(n => {
      if (n.nodeType === 3) {
        for (const ch of n.textContent) {
          if (ch === '(') { if (depth++ === 0) { cur = []; groups.push(cur); } }
          else if (ch === ')') depth = Math.max(0, depth - 1);
        }
      } else if (n.nodeType === 1) {
        if (/basicdiceroll/.test(n.className) && cur) cur.push({ value: parseInt(n.textContent, 10), dropped: /dropped/.test(n.className) });
        else walk(n);
      }
    });
    walk(box);
    const dice = [];
    groups.forEach((g, i) => g.forEach(d => { if (terms[i] && Number.isFinite(d.value)) dice.push({ sides: terms[i], value: d.value, dropped: d.dropped }); }));
    if (!dice.length) return null;
    const total = parseInt(el.textContent, 10);
    return { dice, total: Number.isFinite(total) ? total : sum(dice), formula };
  }
  const sum = dice => dice.filter(d => !d.dropped).reduce((a, d) => a + d.value, 0);

  const seen = new WeakSet();
  const startedAt = Date.now();
  const handle = msg => {
    if (seen.has(msg) || !msg.classList.contains('you')) return;
    const rolls = parseMessage(msg);
    if (!rolls.length) return;               // results not drawn yet; a later look catches it
    seen.add(msg);
    rolls.forEach((r, i) => send({ type: 'roll', roll: Object.assign({ id: (msg.getAttribute('data-messageid') || '') + ':' + i, at: Date.now() }, r) }));
  };
  const chat = document.querySelector('#textchat') || document.body;
  // Everything already in chat is old: mark it seen so only new rolls count.
  chat.querySelectorAll('.message').forEach(m => seen.add(m));
  const observer = new MutationObserver(muts => muts.forEach(mu => mu.addedNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    const msg = n.matches('.message') ? n : n.closest('.message') || n.querySelector('.message');
    if (!msg || msg.nextElementSibling) return;   // only the newest message
    [60, 400, 1200].forEach(ms => setTimeout(() => handle(msg), ms));
  })));
  observer.observe(chat, { childList: true, subtree: true });

  // ---------- talking to the website window ----------
  window.addEventListener('message', ev => {
    const d = ev.data;
    if (ev.origin !== SITE || !d || d.source !== 'msr-page') return;
    if (win !== ev.source) win = ev.source;
    if (d.type === 'ping') { send({ type: 'pong', roll20Open: true, direct: true }); return; }
    if (d.type === 'cmd') {
      try { runCommand(d.text); send({ type: 'cmdack', req: d.req, ok: true }); }
      catch (e) {
        send({ type: 'cmdack', req: d.req, ok: false, error: e.message === 'noselect' ? 'noselect' : 'failed' });
        logEv('cmd-error', d.text.split(' ')[0] + ': ' + (e && e.message));
      }
    }
  });

  // ---------- small status badge in Roll20 ----------
  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;left:60px;bottom:52px;z-index:999999;background:#211c27;color:#f0cf86;border:1px solid #d6ad55;border-radius:8px;padding:6px 10px;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px #0008';
  badge.title = 'Click to open the Mass Save Roller window';
  badge.onclick = () => relink(null);
  document.body.appendChild(badge);
  const setBadge = () => { badge.textContent = win && !win.closed ? '⚔️ Mass Save linked' : '⚔️ Mass Save — click to open'; };
  setInterval(setBadge, 2000);

  function relink(w) {
    if (w && !w.closed) win = w;
    if (!win || win.closed) win = window.open(SITE + '/?r20=1', 'massSaveRoller', 'popup,width=600,height=900');
    else try { win.focus(); } catch (e) {}
    setBadge();
    send({ type: 'pong', roll20Open: true, direct: true });
  }
  window.__msrLink = { relink, version: VERSION };
  relink(win);
  logEv('linked', 'roll20 page ' + ((Campaign.activePage && Campaign.activePage().get('name')) ? 'ok' : '?') + ', popup ' + (win ? 'open' : 'BLOCKED'));
  console.log(TAG, 'ready', VERSION);
})();
