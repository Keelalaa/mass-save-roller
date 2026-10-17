// Prints the newest diagnostic events from the live site's private log.
// Usage: node tools/read-log.js [count]     (needs the git-ignored .logkey file next to index.html)
import fs from 'node:fs';
const key = fs.readFileSync(new URL('../.logkey', import.meta.url), 'utf8').trim();
const n = process.argv[2] || 100;
fetch(`https://mass-save-roller.vercel.app/api/log?key=${encodeURIComponent(key)}&n=${n}`)
  .then(r => r.json())
  .then(d => {
    if (!d.events) { console.log(d); return; }
    d.events.reverse().forEach(e => console.log(`${e.t.replace('T', ' ').slice(0, 19)}  ${e.src}${e.v ? ' ' + e.v : ''}${e.sid ? ' [' + e.sid + ']' : ''}  ${e.ev}: ${e.msg}`));
  });
