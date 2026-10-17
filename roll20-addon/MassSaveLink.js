// Mass Save Link — Roll20 Mod script, installed by the Mass Save Roller add-on.
// Lets the add-on read the GM's selected tokens and change their HP bar. GM only.
// Commands (sent by the add-on, never shown in chat):
//   !msr-ping <req>
//   !msr-sel  <req> bar=1
//   !msr-dmg  <req> bar=1 dead=1 <tokenId>:<damage> ...   (negative damage heals;
//             tokens that aren't currently selected are refused, never changed)
var MassSaveLink = MassSaveLink || (function () {
  'use strict';
  var VERSION = '1.0.0';

  function tell(kind, data) {
    sendChat('Mass Save', '/w gm MSR-' + kind + ' ' + encodeURIComponent(JSON.stringify(data)), null, { noarchive: true });
  }
  function barAttr(t, bar) {
    var link = t.get('bar' + bar + '_link');
    return link ? getObj('attribute', link) : null;
  }
  function readBar(t, bar) {
    var a = barAttr(t, bar);
    var cur = a ? a.get('current') : t.get('bar' + bar + '_value');
    var max = a ? a.get('max') : t.get('bar' + bar + '_max');
    return { cur: String(cur).trim() === '' ? null : parseInt(cur, 10), max: parseInt(max, 10) || 0 };
  }
  function writeBar(t, bar, v) {
    var a = barAttr(t, bar);
    if (a) a.set('current', v); else t.set('bar' + bar + '_value', v);
  }
  function tokenInfo(t, bar) {
    var b = readBar(t, bar);
    return { id: t.id, name: t.get('name') || 'Token', hp: isNaN(b.cur) ? null : b.cur, max: b.max };
  }

  on('chat:message', function (msg) {
    if (msg.type !== 'api' || !/^!msr-/.test(msg.content)) return;
    if (!playerIsGM(msg.playerid)) return;
    var parts = msg.content.trim().split(/\s+/), cmd = parts[0], req = parts[1] || '';
    var opts = {}, pairs = [];
    parts.slice(2).forEach(function (p) {
      var eq = /^(bar|dead)=(\w+)$/.exec(p);
      if (eq) { opts[eq[1]] = eq[2]; return; }
      var i = p.lastIndexOf(':');
      if (i > 0) pairs.push({ id: p.slice(0, i), amt: parseInt(p.slice(i + 1), 10) || 0 });
    });
    var bar = /^[123]$/.test(opts.bar) ? opts.bar : '1';

    if (cmd === '!msr-ping') { tell('PONG', { req: req, v: VERSION }); return; }

    if (cmd === '!msr-sel') {
      var tokens = (msg.selected || []).filter(function (s) { return s._type === 'graphic'; })
        .map(function (s) { return getObj('graphic', s._id); })
        .filter(function (t) { return t && t.get('subtype') === 'token'; })
        .map(function (t) { return tokenInfo(t, bar); });
      tell('SEL', { req: req, tokens: tokens });
      return;
    }

    if (cmd === '!msr-dmg') {
      // Safety rule: only tokens the GM has selected RIGHT NOW are ever changed.
      var selected = {};
      (msg.selected || []).forEach(function (s) { if (s._type === 'graphic') selected[s._id] = true; });
      var results = [], missing = [], notSelected = [];
      pairs.forEach(function (p) {
        if (!selected[p.id]) { notSelected.push(p.id); return; }
        var t = getObj('graphic', p.id);
        if (!t) { missing.push(p.id); return; }
        var b = readBar(t, bar);
        if (b.cur === null || isNaN(b.cur)) { results.push({ id: p.id, name: t.get('name'), skipped: 'no HP on bar ' + bar }); return; }
        var hp = Math.max(0, b.cur - p.amt);
        if (b.max > 0) hp = Math.min(hp, Math.max(b.max, b.cur));
        writeBar(t, bar, hp);
        if (opts.dead === '1') t.set('status_dead', hp <= 0);
        results.push({ id: p.id, name: t.get('name'), hp: hp, max: b.max });
      });
      tell('DMG', { req: req, results: results, missing: missing, notSelected: notSelected });
    }
  });

  on('ready', function () { log('Mass Save Link ' + VERSION + ' ready'); });
  return { version: VERSION };
}());
