// Motion reel renderer. posts/<id>.json with "type":"motion" -> media/<id>/reel.mp4 + cover.jpg
// Every scene is a pure function of time t, so frames are deterministic. Usage: node tools/render_motion.js <id> [--fps 30]
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const FPS = 30;

const PAGE = (post) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;background:#0B0D12;color:#F4F1EA;font-family:Inter,sans-serif;overflow:hidden}
#bg{position:absolute;inset:-120px;background-image:linear-gradient(#ffffff09 1px,transparent 1px),linear-gradient(90deg,#ffffff09 1px,transparent 1px);background-size:60px 60px}
#glow{position:absolute;width:1100px;height:1100px;border-radius:50%;background:radial-gradient(circle,#C6F43A26,transparent 65%)}
#bar{position:absolute;left:84px;top:96px;height:6px;background:#C6F43A;border-radius:3px}
#bartrack{position:absolute;left:84px;right:84px;top:96px;height:6px;background:#ffffff14;border-radius:3px}
.hdr{position:absolute;left:84px;top:130px;font:500 26px 'JetBrains Mono';color:#9AA0AA;letter-spacing:.05em}.hdr b{color:#C6F43A}
.ftr{position:absolute;left:84px;right:84px;bottom:230px;display:flex;justify-content:space-between;font:24px 'JetBrains Mono';color:#6B7280}
.scene{position:absolute;left:84px;right:84px;top:330px;bottom:330px;display:flex;flex-direction:column;justify-content:center;opacity:0}
.kicker{font:600 32px 'JetBrains Mono';color:#C6F43A;letter-spacing:.08em;text-transform:uppercase;margin-bottom:36px}
.big{font:800 118px/1.0 'Inter Display';letter-spacing:-.04em}
.mid{font:800 84px/1.04 'Inter Display';letter-spacing:-.035em}
.w{display:inline-block;margin-right:.24em;will-change:transform}
.hl{color:#C6F43A}
.sub{font-size:40px;line-height:1.35;color:#B9BEC7;margin-top:44px}
.card{background:#151922;border:2px solid #262C38;border-radius:28px;padding:48px;margin-top:36px;min-height:420px;font:34px/1.55 'JetBrains Mono';color:#E8E6DF;position:relative}
.card .tag{position:absolute;top:-20px;left:40px;background:#C6F43A;color:#0B0D12;font:700 22px 'JetBrains Mono';padding:6px 16px;border-radius:8px}
.chip{color:#0B0D12;background:#F4F1EA;border-radius:6px;padding:0 8px}
.cur{display:inline-block;width:16px;height:38px;background:#C6F43A;vertical-align:-6px;margin-left:2px}
.item{display:flex;gap:30px;align-items:center;background:#151922;border:2px solid #262C38;border-radius:24px;padding:34px 38px;margin-top:22px;font:700 46px/1.15 'Inter Display';letter-spacing:-.02em}
.item i{font:800 60px 'Inter Display';color:#C6F43A;font-style:normal;min-width:80px}
.stat{font:800 340px/1 'Inter Display';letter-spacing:-.06em;color:#C6F43A}
.field{background:#151922;border:2px solid #262C38;border-radius:60px;padding:34px 44px;font:500 44px 'Inter';margin-top:50px;display:flex;justify-content:space-between;align-items:center}
.field span.send{color:#C6F43A;font-weight:700}
.dm{background:#C6F43A;color:#0B0D12;border-radius:32px;padding:34px 40px;font:600 40px/1.3 'Inter';margin-top:34px}
</style></head><body>
<div id="bg"></div><div id="glow"></div><div id="bartrack"></div><div id="bar"></div>
<div class="hdr"><b>●</b> PROMPT STACK DAILY</div>
<div class="ftr"><span>@prompt.stackdaily</span><span id="fr">♥ save this</span></div>
<div id="scenes"></div>
<script>
const POST=${JSON.stringify(post)};
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const easeOut=x=>1-Math.pow(1-clamp(x),3);
const easeBack=x=>{x=clamp(x);const c=1.9;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const words=(s,cls)=>s.split(/(\\*\\*.+?\\*\\*)/).filter(Boolean).flatMap(seg=>{const hl=seg.startsWith('**');const t=hl?seg.slice(2,-2):seg;return t.split(' ').filter(Boolean).map(w=>'<span class="w'+(hl?' hl':'')+'">'+esc(w)+'</span>')}).join('');
const chipify=s=>esc(s).replace(/\\[(.+?)\\]/g,'<span class="chip">[$1]</span>');
let total=0;const starts=POST.scenes.map(s=>{const st=total;total+=s.seconds;return st});
const root=document.getElementById('scenes');
const els=POST.scenes.map(s=>{const d=document.createElement('div');d.className='scene';
  if(s.kind==='hook'||s.kind==='text')d.innerHTML=(s.kicker?'<div class="kicker">'+esc(s.kicker)+'</div>':'')+'<div class="'+(s.kind==='hook'?'big':'mid')+'">'+words(s.title)+'</div>'+(s.sub?'<div class="sub">'+esc(s.sub)+'</div>':'');
  if(s.kind==='prompt')d.innerHTML='<div class="kicker">'+esc(s.kicker||'Copy this prompt')+'</div><div class="mid" style="font-size:70px">'+words(s.title)+'</div><div class="card"><span class="tag">PROMPT</span><div class="typed"></div></div>'+(s.tip?'<div class="sub tip" style="margin-top:36px;font-size:34px"><b style="color:#F4F1EA">Why it works:</b> '+esc(s.tip)+'</div>':'');
  if(s.kind==='list')d.innerHTML='<div class="kicker">'+esc(s.kicker||'')+'</div><div class="mid" style="font-size:72px">'+words(s.title)+'</div>'+s.items.map((t,i)=>'<div class="item"><i>'+(i+1)+'</i><span>'+esc(t)+'</span></div>').join('');
  if(s.kind==='stat')d.innerHTML='<div class="kicker">'+esc(s.kicker||'')+'</div><div class="stat"><span class="n">0</span>'+esc(s.suffix||'')+'</div><div class="mid" style="font-size:64px;margin-top:20px">'+words(s.title)+'</div>'+(s.sub?'<div class="sub">'+esc(s.sub)+'</div>':'');
  if(s.kind==='cta')d.innerHTML='<div class="kicker">'+esc(s.kicker||'Want the full pack?')+'</div><div class="mid" style="font-size:78px">'+words(s.title)+'</div><div class="field"><span class="ty"></span><span class="send">Post</span></div><div class="dm" style="opacity:0">📩 Sent! Here is your pack: link in your DMs</div>';
  root.appendChild(d);return d});
window.setT=function(t){
  document.getElementById('bar').style.width=(912*clamp(t/total))+'px';
  document.getElementById('bg').style.transform='translate('+(-(t*14)%60)+'px,'+(-(t*22)%60)+'px)';
  const g=document.getElementById('glow');g.style.left=(560+Math.sin(t*.6)*220)+'px';g.style.top=(-300+Math.cos(t*.5)*160)+'px';
  POST.scenes.forEach((s,i)=>{const el=els[i],lt=t-starts[i];
    if(lt<-.01||lt>s.seconds+.01){el.style.opacity=0;return}
    const fin=easeOut(lt/.35),fout=clamp((s.seconds-lt)/.25);
    el.style.opacity=Math.min(fin,fout);el.style.transform='translateY('+((1-fin)*40-(1-fout)*30)+'px)';
    el.querySelectorAll('.big .w,.mid .w').forEach((w,k)=>{const p=easeBack((lt-.1-k*.09)/.45);w.style.opacity=clamp(p*2);w.style.transform='translateY('+((1-p)*70)+'px) scale('+(1+(1-p)*.25)+')'});
    if(s.kind==='prompt'){const full=s.prompt,start=.9,cps=full.length/Math.max(1,s.seconds-start-1.8);const n=Math.floor(clamp((lt-start)*cps,0,full.length));
      el.querySelector('.typed').innerHTML=chipify(full.slice(0,n))+(Math.floor(lt*2)%2===0||n<full.length?'<span class="cur"></span>':'')}
    if(s.kind==='list')el.querySelectorAll('.item').forEach((it,k)=>{const p=easeOut((lt-.7-k*.5)/.4);it.style.opacity=p;it.style.transform='translateX('+((1-p)*120)+'px)'});
    if(s.kind==='stat')el.querySelector('.n').textContent=Math.round(s.value*easeOut(lt/1.4));
    if(s.kind==='cta'){const word=POST.keyword||'PROMPTS',n=Math.floor(clamp((lt-.9)*9,0,word.length));
      el.querySelector('.ty').innerHTML=esc(word.slice(0,n))+(lt<.9+word.length/9+.6?'<span class="cur" style="height:44px"></span>':'');
      const p=easeBack((lt-(1.1+word.length/9+.6))/.5);const dm=el.querySelector('.dm');dm.style.opacity=clamp(p*2);dm.style.transform='scale('+(.85+.15*clamp(p,0,1.2))+')'}
  });
};
</script></body></html>`;

(async () => {
  const id = process.argv[2];
  const post = JSON.parse(fs.readFileSync(path.join(ROOT, 'posts', `${id}.json`), 'utf8'));
  const out = path.join(ROOT, 'media', id), frames = path.join(out, '_frames');
  fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
  const total = post.scenes.reduce((a, s) => a + s.seconds, 0);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.setContent(PAGE(post), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const n = Math.round(total * FPS);
  for (let f = 0; f < n; f++) {
    await page.evaluate((t) => window.setT(t), f / FPS);
    await page.screenshot({ path: path.join(frames, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88 });
  }
  // cover = hook scene once its words have landed
  await page.evaluate((t) => window.setT(t), 1.3);
  await page.screenshot({ path: path.join(out, 'cover.jpg'), type: 'jpeg', quality: 92 });
  await browser.close();
  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'),
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-b:v', '5M', '-c:a', 'aac',
    '-movflags', '+faststart', path.join(out, 'reel.mp4')], { stdio: 'ignore' });
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(`rendered ${id}: ${n} frames, ${total}s`);
})();
