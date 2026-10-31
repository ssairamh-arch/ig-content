// Builds queue.json from posts/*.json. Media URLs point at the public ig-content repo (raw.githubusercontent.com).
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.MEDIA_BASE || 'https://raw.githubusercontent.com/ssairamh-arch/ig-content/main/media';
const queue = fs.readdirSync(path.join(ROOT, 'posts')).filter(f => f.endsWith('.json')).sort().map(f => {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'posts', f), 'utf8'));
  const dir = path.join(ROOT, 'media', p.id);
  const media = (p.type === 'reel' || p.type === 'motion')
    ? [`${BASE}/${p.id}/reel.mp4`]
    : fs.readdirSync(dir).filter(x => /^\d+\.jpg$/.test(x)).sort().map(x => `${BASE}/${p.id}/${x}`);
  return { id: p.id, date: p.date, type: p.type === 'motion' ? 'reel' : p.type, caption: p.caption, ai_voice: p.ai_voice || undefined, media,
           cover: (p.type === 'reel' || p.type === 'motion') ? `${BASE}/${p.id}/cover.jpg` : undefined };
});
fs.writeFileSync(path.join(ROOT, 'queue.json'), JSON.stringify(queue, null, 2));
console.log(`queue.json: ${queue.length} posts`);
