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

function css(w, h) {
  const tall = h > 1500;
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${w}px;height:${h}px}
  body{background:#0B0D12;color:#F4F1EA;font-family:'Inter',sans-serif;overflow:hidden;position:relative}
  .grid{position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:60px 60px}
  .glow{position:absolute;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,#C6F43a22,transparent 65%);right:-380px;top:-380px}
  .frame{position:absolute;inset:0;padding:${tall ? '200px 80px 260px' : '90px 84px'};display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font-family:'JetBrains Mono';font-size:26px;color:#9AA0AA;letter-spacing:.04em}
  .top b{color:#C6F43A;font-weight:600}
  .body{flex:1;display:flex;flex-direction:column;justify-content:center}
  mark{background:none;color:#C6F43A}
  .kicker{font-family:'JetBrains Mono';font-size:30px;color:#C6F43A;letter-spacing:.08em;text-transform:uppercase;margin-bottom:36px}
  h1{font-family:'Inter Display';font-weight:800;font-size:${tall ? 104 : 96}px;line-height:1.02;letter-spacing:-.035em}
  .sub{font-size:38px;line-height:1.35;color:#B9BEC7;margin-top:44px;max-width:860px}
  .num{font-family:'Inter Display';font-weight:800;font-size:150px;line-height:1;color:#C6F43A;letter-spacing:-.04em}
  h2{font-family:'Inter Display';font-weight:700;font-size:62px;line-height:1.08;letter-spacing:-.025em;margin:18px 0 40px}
  .card{background:#151922;border:2px solid #262C38;border-radius:28px;padding:44px 46px;position:relative}
  .card .label{position:absolute;top:-20px;left:40px;background:#C6F43A;color:#0B0D12;font-family:'JetBrains Mono';font-weight:700;font-size:22px;padding:6px 16px;border-radius:8px;letter-spacing:.06em}
  .card p{font-family:'JetBrains Mono';font-size:${tall ? 33 : 31}px;line-height:1.5;color:#E8E6DF}
  .fill{color:#0B0D12;background:#F4F1EA;border-radius:6px;padding:0 8px}
  .tip{margin-top:36px;font-size:30px;line-height:1.4;color:#9AA0AA}
  .tip b{color:#F4F1EA}
  .cta-box{border:3px dashed #C6F43A;border-radius:32px;padding:60px 56px;margin-top:20px}
  .cta-word{display:inline-block;background:#C6F43A;color:#0B0D12;font-family:'Inter Display';font-weight:800;font-size:110px;letter-spacing:-.03em;padding:4px 30px;border-radius:18px;margin:26px 0}
  .cta-box p{font-size:38px;line-height:1.35;color:#B9BEC7}
  .foot{display:flex;justify-content:space-between;align-items:center;font-family:'JetBrains Mono';font-size:24px;color:#6B7280}
  .dots{display:flex;gap:10px}.dots i{width:12px;height:12px;border-radius:50%;background:#2A303C}.dots i.on{background:#C6F43A;width:36px;border-radius:8px}
  .swipe{color:#C6F43A}
  `;
}

function slideHTML(post, slide, i, total, w, h) {
  const dots = Array.from({ length: total }, (_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  const isReel = post.type === 'reel';
  let inner = '';
  if (slide.kind === 'hook') {
    inner = `${slide.kicker ? `<div class="kicker">${esc(slide.kicker)}</div>` : ''}<h1>${rich(slide.title)}</h1>${slide.sub ? `<div class="sub">${rich(slide.sub)}</div>` : ''}`;
  } else if (slide.kind === 'prompt') {
    inner = `<div class="num">${String(slide.n).padStart(2, '0')}</div><h2>${rich(slide.title)}</h2>
      <div class="card"><span class="label">PROMPT</span><p>${promptText(slide.prompt)}</p></div>
      ${slide.tip ? `<div class="tip"><b>Why it works:</b> ${rich(slide.tip)}</div>` : ''}`;
  } else if (slide.kind === 'text') {
    inner = `${slide.kicker ? `<div class="kicker">${esc(slide.kicker)}</div>` : ''}<h2 style="font-size:72px">${rich(slide.title)}</h2>${slide.sub ? `<div class="sub">${rich(slide.sub)}</div>` : ''}`;
  } else if (slide.kind === 'cta') {
    inner = `<div class="kicker">${esc(slide.kicker || 'Want all of them?')}</div>
      <h2 style="font-size:70px">${rich(slide.title || 'Get the full prompt pack free in your DMs')}</h2>
      <div class="cta-box"><p>Comment</p><div class="cta-word">${esc(post.keyword || 'PROMPTS')}</div><p>${rich(slide.sub || "and I'll send you the link.")}</p></div>`;
  }
  const last = i === total - 1;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css(w, h)}</style></head><body>
    <div class="grid"></div><div class="glow"></div>
    <div class="frame">
      <div class="top"><span><b>●</b> PROMPT STACK DAILY</span><span>${isReel ? '' : `${i + 1}/${total}`}</span></div>
      <div class="body">${inner}</div>
      <div class="foot"><span>${HANDLE}</span>${isReel ? '' : `<div class="dots">${dots}</div>`}<span class="swipe">${last || isReel ? '♥ save this' : 'swipe →'}</span></div>
    </div></body></html>`;
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
