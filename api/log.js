// Private diagnostic log, so problems on the DM's computer can be seen without being there.
// POST: the website / add-on append one event (no personal data — just what the app did).
// GET ?key=<key>: returns the newest events. The key itself lives only in the local, git-ignored
// .logkey file; this file holds just its SHA-256. Needs the Upstash Redis env vars in Vercel.
import { createHash } from 'node:crypto';
const LIST = 'msr:log';
const KEY_SHA256 = '441952bf9e6aed35af7108ce1c33635caddfa26d654aadd147956dcd4c24854e';
const MAX_EVENTS = 2000;

async function redis(cmd) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return undefined;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  if (!r.ok) throw new Error('Redis ' + r.status);
  return (await r.json()).result;
}

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const given = createHash('sha256').update(String(req.query.key || '')).digest('hex');
      if (given !== KEY_SHA256) return res.status(403).json({ error: 'forbidden' });
      const n = Math.min(parseInt(req.query.n, 10) || 200, MAX_EVENTS);
      const rows = await redis(['LRANGE', LIST, '0', String(n - 1)]);
      if (rows === undefined) return res.status(503).json({ error: 'Redis is not connected to this Vercel project' });
      return res.status(200).json({ events: rows.map(r => { try { return JSON.parse(r); } catch (e) { return r; } }) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

    // Light rate limit per IP: 300 events per 10 minutes.
    const ip = clip((req.headers['x-forwarded-for'] || '').split(',')[0] || 'x', 60);
    const rk = 'msr:rl:' + ip;
    const count = await redis(['INCR', rk]);
    if (count === undefined) return res.status(204).end();
    if (count === 1) await redis(['EXPIRE', rk, '600']);
    if (count > 300) return res.status(429).end();

    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    const event = {
      t: new Date().toISOString(),
      src: clip(b.src, 10), v: clip(b.v, 20), sid: clip(b.sid, 20),
      ev: clip(b.ev, 40), msg: clip(b.msg, 600)
    };
    await redis(['LPUSH', LIST, JSON.stringify(event)]);
    await redis(['LTRIM', LIST, '0', String(MAX_EVENTS - 1)]);
    return res.status(204).end();
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
