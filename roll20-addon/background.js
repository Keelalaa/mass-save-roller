// Relays dice rolled in Roll20 to any open Mass Save Roller tab. Keeps no state of its own:
// the website decides whether it is waiting for rolls.
const SITE_URLS = ['https://mass-save-roller.vercel.app/*', 'http://localhost:8765/*'];
const ROLL20_URLS = ['https://app.roll20.net/editor*'];

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'msr-roll') {
    chrome.tabs.query({ url: SITE_URLS }, tabs => {
      tabs.forEach(t => chrome.tabs.sendMessage(t.id, msg, () => void chrome.runtime.lastError));
      reply({ delivered: tabs.length });
    });
    return true;
  }
  if (msg && msg.type === 'msr-ping') {
    chrome.tabs.query({ url: ROLL20_URLS }, tabs => reply({ roll20Open: tabs.length > 0 }));
    return true;
  }
});
