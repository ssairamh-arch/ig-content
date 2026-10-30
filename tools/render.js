// Renders posts/<id>.json into media/<id>/ (carousel JPEGs, or reel MP4 + cover).
// Usage: node tools/render.js [post-id ...]   (no args = every post without media yet)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const HANDLE = '@prompt.stackdaily';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// **word** -> highlighted word
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>').replace(/\n/g, '<br>');
// [brackets] inside prompts -> fill-in chips
const promptText = (s) => esc(s).replace(/\[(.+?)\]/g, '<span class="fill">[$1]</span>').replace(/\n/g, '<br>');

// v2 look: flat fields (lime / white / soft tint / ink), big Inter Display type, no labels, rules, grids or glows.
const LIME = '#C6F43A', INK = '#0F1A12', TINT = '#F1F7DC', GREY = '#3A463D';
const plain = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\n/g, '<br>');

function css(w, h) {
  const tall = h > 1500;
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${w}px;height:${h}px}
  body{font-family:'Inter',sans-serif;color:${INK};overflow:hidden;position:relative}
  .lime{background:${LIME}}.white{background:#fff}.tint{background:${TINT}}.ink{background:${INK};color:#fff}
  .frame{position:absolute;inset:0;padding:${tall ? '230px 88px 330px' : '96px 88px 96px'};display:flex;flex-direction:column}
  .handle{font:700 30px 'Inter Display';letter-spacing:-.01em}
  .body{flex:1;display:flex;flex-direction:column;justify-content:center}
  h1{font:800 ${tall ? 128 : 146}px/.95 'Inter Display';letter-spacing:-.05em}
  .sub{font-size:40px;line-height:1.3;font-weight:600;margin-top:44px;max-width:860px}
  .num{display:inline-flex;align-items:center;justify-content:center;width:132px;height:132px;border-radius:99px;background:${INK};color:${LIME};font:800 84px 'Inter Display';letter-spacing:-.04em;margin-bottom:38px}
  h2{font:800 ${tall ? 84 : 76}px/1 'Inter Display';letter-spacing:-.04em;margin-bottom:38px}
  .card{background:#fff;border-radius:30px;padding:42px 46px;font-size:${tall ? 36 : 35}px;line-height:1.5;font-weight:500}
  .tint .card{background:#fff}.white .card{background:${TINT}}
  .chip{background:${LIME};border-radius:8px;padding:0 8px;font-weight:700}
  .tip{margin-top:38px;font-size:34px;line-height:1.4;color:${GREY};font-weight:500}.tip b{color:${INK}}
  .keyword{display:inline-block;background:${LIME};color:${INK};font:800 150px/1 'Inter Display';letter-spacing:-.04em;padding:18px 44px 26px;border-radius:30px;margin:30px 0}
  .ink .sub{color:#D7DDD2}
  `;
}

function slideHTML(post, slide, i, total, w, h) {
  const isReel = post.type === 'reel';
  let cls = 'white', inner = '';
  if (slide.kind === 'hook') {
    cls = 'lime';
    inner = `<h1>${plain(slide.title)}</h1>${slide.sub ? `<div class="sub">${plain(slide.sub)}</div>` : ''}`;
  } else if (slide.kind === 'prompt') {
    cls = slide.n % 2 ? 'white' : 'tint';
    inner = `<div><span class="num">${slide.n}</span></div><h2>${plain(slide.title)}</h2>
      <div class="card">${promptText(slide.prompt).replace(/<span class="fill">/g, '<span class="chip">')}</div>
      ${slide.tip ? `<div class="tip"><b>Why it works:</b> ${plain(slide.tip)}</div>` : ''}`;
  } else if (slide.kind === 'text') {
    cls = 'white';
    inner = `<h1 style="font-size:104px">${plain(slide.title)}</h1>${slide.sub ? `<div class="sub">${plain(slide.sub)}</div>` : ''}`;
  } else if (slide.kind === 'cta') {
    cls = 'ink';
    inner = `<h2 style="font-size:84px;margin-bottom:20px">${plain(slide.title || 'Get the full prompt pack')}</h2>
      <div style="font-size:42px;font-weight:600;color:#D7DDD2">Comment</div><div><span class="keyword">${esc(post.keyword || 'PROMPTS')}</span></div>
      <div class="sub" style="margin-top:0">${plain(slide.sub || "and I'll send you the link.")}</div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css(w, h)}</style></head><body class="${cls}">
    <div class="frame"><div class="handle">${HANDLE}</div><div class="body">${inner}</div></div></body></html>`;
}

async function renderPost(browser, id) {
  const post = JSON.parse(fs.readFileSync(path.join(ROOT, 'posts', `${id}.json`), 'utf8'));
  const out = path.join(ROOT, 'media', id);
  fs.mkdirSync(out, { recursive: true });
  const reel = post.type === 'reel';
  const [w, h] = reel ? [1080, 1920] : [1080, 1350];
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const files = [];
  for (let i = 0; i < post.slides.length; i++) {
    await page.setContent(slideHTML(post, post.slides[i], i, post.slides.length, w, h), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const f = path.join(out, `${String(i + 1).padStart(2, '0')}.jpg`);
    await page.screenshot({ path: f, type: 'jpeg', quality: 92 });
    files.push(f);
  }
  await page.close();
  if (reel) buildReel(post, files, out);
  console.log(`rendered ${id} (${post.type}, ${files.length} slides)`);
}

// Each slide holds for its own duration (default 3.5s, prompts longer), with a slow zoom and crossfades.
function buildReel(post, files, out) {
  const fade = 0.5;
  const durs = post.slides.map((s) => s.seconds || (s.kind === 'prompt' ? 6 : 3.5));
  const args = ['-y'];
  files.forEach((f, i) => args.push('-loop', '1', '-t', String(durs[i]), '-i', f));
  args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
  const parts = files.map((_, i) => {
    const frames = Math.round(durs[i] * 30);
    return `[${i}:v]scale=1188:2112,zoompan=z='min(1+0.0006*on,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,setsar=1,format=yuv420p[v${i}]`;
  });
  let last = 'v0', t = durs[0];
  for (let i = 1; i < files.length; i++) {
    const o = i === files.length - 1 ? 'vout' : `x${i}`;
    parts.push(`[${last}][v${i}]xfade=transition=fade:duration=${fade}:offset=${(t - fade).toFixed(2)}[${o}]`);
    last = o; t += durs[i] - fade;
  }
  if (files.length === 1) parts.push('[v0]null[vout]');
  args.push('-filter_complex', parts.join(';'), '-map', '[vout]', '-map', `${files.length}:a`,
    '-t', t.toFixed(2), '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-b:v', '6M',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(out, 'reel.mp4'));
  execFileSync('ffmpeg', args, { stdio: 'ignore' });
  fs.copyFileSync(files[0], path.join(out, 'cover.jpg'));
}

(async () => {
  let ids = process.argv.slice(2);
  if (!ids.length) {
    ids = fs.readdirSync(path.join(ROOT, 'posts')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
      .filter((id) => !fs.existsSync(path.join(ROOT, 'media', id)));
  }
  const browser = await chromium.launch();
  for (const id of ids) await renderPost(browser, id);
  await browser.close();
})();
