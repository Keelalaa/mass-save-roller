// Runs in the Roll20 game. Watches the chat for NEW dice rolls made by you (the person in this
// browser) and sends the individual dice to the Mass Save Roller website. Read-only: it never
// changes anything in Roll20.
(function () {
  const TAG = '[Mass Save link]';

  // Turns a chat message element into a list of rolls: {dice:[{sides,value,dropped}], total, formula}.
  function parseMessage(msg) {
    const rolls = [];
    // "/r 6d20+2" style rolls
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
    // [[1d20+2]] inline rolls (also used by roll templates)
    msg.querySelectorAll('.inlinerollresult').forEach(el => {
      const r = parseInline(el);
      if (r) rolls.push(r);
    });
    return rolls;
  }

  // Inline rolls keep their details in a tooltip like:
  //   Rolling 2d20kh1+1d4 = (<span class="basicdiceroll">12</span>+<span class="basicdiceroll dropped">7</span>)+(3)
  function parseInline(el) {
    const raw = el.getAttribute('title') || el.getAttribute('original-title') || el.getAttribute('data-original-title') || '';
    const m = /Rolling\s+(.+?)\s*=\s*([\s\S]*)$/i.exec(raw);
    if (!m) return null;
    const formula = m[1].replace(/<[^>]*>/g, '').trim();
    const terms = [...formula.matchAll(/(\d*)d(\d+)/gi)].map(t => +t[2]);
    const box = document.createElement('div');
    box.innerHTML = m[2];
    // Each dice term shows up as one "( ... )" group, in the same order as in the formula.
    const groups = [];
    let depth = 0, cur = null;
    const walk = node => {
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) {
          for (const ch of n.textContent) {
            if (ch === '(') { if (depth++ === 0) { cur = []; groups.push(cur); } }
            else if (ch === ')') { depth = Math.max(0, depth - 1); }
          }
        } else if (n.nodeType === 1) {
          if (/basicdiceroll/.test(n.className) && cur) {
            cur.push({ value: parseInt(n.textContent, 10), dropped: /dropped/.test(n.className) });
          } else walk(n);
        }
      });
    };
    walk(box);
    const dice = [];
    groups.forEach((g, i) => g.forEach(d => { if (terms[i] && Number.isFinite(d.value)) dice.push({ sides: terms[i], value: d.value, dropped: d.dropped }); }));
    if (!dice.length) return null;
    const total = parseInt(el.textContent, 10);
    return { dice, total: Number.isFinite(total) ? total : sum(dice), formula };
  }

  const sum = dice => dice.filter(d => !d.dropped).reduce((a, d) => a + d.value, 0);
  const isMine = msg => msg.classList.contains('you');

  // Exposed for the website's test page; harmless in Roll20.
  window.__msrParse = { parseMessage, parseInline };

  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;

  const loadedAt = Date.now();
  // Problems are sent to the website's private log so they can be looked into remotely.
  const logEv = (ev, msg) => { try { chrome.runtime.sendMessage({ type: 'msr-log', ev, msg: String(msg) }, () => void chrome.runtime.lastError); } catch (e) {} };
  setTimeout(() => logEv('roll20-tab', 'loaded; chat box ' + (document.querySelector('#textchat-input textarea') ? 'found' : 'NOT found')), 5000);
  const seen = new Set();
  const send = (id, roll) => {
    try {
      if (!chrome.runtime.id) { console.warn(TAG, 'add-on was updated - refresh this Roll20 tab'); return; }
      chrome.runtime.sendMessage({ type: 'msr-roll', roll: Object.assign({ id, at: Date.now() }, roll) }, () => void chrome.runtime.lastError);
      console.log(TAG, 'sent', roll.formula, roll.dice.map(d => 'd' + d.sides + ':' + d.value).join(' '));
    } catch (e) { console.warn(TAG, 'could not send roll', e); }
  };
  // Replies from the Mass Save Link Mod script arrive as hidden GM whispers: "MSR-<KIND> <data>".
  const handleReply = msg => {
    const m = /MSR-(PONG|SEL|DMG)\s+(\S+)/.exec(msg.textContent || '');
    if (!m) return false;
    msg.style.display = 'none';
    const key = 'r:' + (msg.getAttribute('data-messageid') || m[2].slice(0, 120));
    if (seen.has(key)) return true;
    seen.add(key);
    try {
      const data = JSON.parse(decodeURIComponent(m[2]));
      chrome.runtime.sendMessage({ type: 'msr-reply', kind: m[1], data }, () => void chrome.runtime.lastError);
    } catch (e) { console.warn(TAG, 'bad reply from the Mod script', e); logEv('bad-reply', m[1] + ' ' + m[2].slice(0, 200)); }
    return true;
  };
  const handle = msg => {
    if (handleReply(msg)) return;
    const key = msg.getAttribute('data-messageid') || msg;
    if (seen.has(key) || !isMine(msg)) return;
    const rolls = parseMessage(msg);
    if (!rolls.length) return;            // results not drawn yet - a later look will catch it
    seen.add(key);
    rolls.forEach((r, i) => send(String(key) + ':' + i, r));
  };

  new MutationObserver(muts => {
    // Ignore the chat history Roll20 draws while the game loads.
    if (Date.now() - loadedAt < 4000) return;
    muts.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      const msg = n.matches('.message') ? n : n.closest('.message') || n.querySelector('.message');
      // Only the newest message counts, so older messages being redrawn never re-send.
      if (!msg || msg.nextElementSibling) return;
      [60, 400, 1200].forEach(ms => setTimeout(() => handle(msg), ms));
    }));
  }).observe(document.body, { childList: true, subtree: true });

  // Sends a "!msr-..." command through the chat box. "!" commands go to the Mod script and are
  // never shown in chat. Whatever the GM had half-typed is put back afterwards.
  function sendChatText(text) {
    const ta = document.querySelector('#textchat-input textarea');
    if (!ta) { logEv('no-chatbox', text.split(' ')[0]); return false; }
    const btn = document.querySelector('#textchat-input button, #textchat-input .btn');
    const old = ta.value;
    ta.value = text;
    if (btn) btn.click();
    else ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    setTimeout(() => { if (!ta.value || ta.value === text) ta.value = old; }, 50);
    return true;
  }
  function campaignId() {
    for (const s of document.querySelectorAll('script:not([src])')) {
      const m = /campaign_id\s*=\s*["']?(\d+)/.exec(s.textContent);
      if (m) return m[1];
    }
    for (const a of document.querySelectorAll('a[href*="/campaigns/"]')) {
      const m = /\/campaigns\/\w+\/(\d+)/.exec(a.getAttribute('href'));
      if (m) return m[1];
    }
    return null;
  }
  window.__msrChat = { sendChatText, campaignId, handleReply };
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg && msg.type === 'msr-cmd') reply({ ok: sendChatText(msg.text) });
    else if (msg && msg.type === 'msr-campaign') reply({ id: campaignId() });
  });
  console.log(TAG, 'watching Roll20 chat for your rolls');
})();
