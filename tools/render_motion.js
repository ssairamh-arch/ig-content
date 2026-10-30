// Motion reel renderer. posts/<id>.json with "type":"motion" -> media/<id>/reel.mp4 + cover.jpg
// Every scene is a pure function of time t, so frames are deterministic. Usage: node tools/render_motion.js <id> [--fps 30]
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const FPS = 30;

const PAGE = (post) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;background:#C6F43A;color:#0F1A12;font-family:Inter,sans-serif;overflow:hidden}
.handle{position:absolute;left:88px;top:150px;font:700 30px 'Inter Display';letter-spacing:-.01em;z-index:5;transition:none}
.scene{position:absolute;inset:0;padding:260px 88px 360px;display:flex;flex-direction:column;justify-content:center;visibility:hidden}
.lime{background:#C6F43A}.white{background:#fff}.tint{background:#F1F7DC}.ink{background:#0F1A12;color:#fff}
.big{font:800 150px/.95 'Inter Display';letter-spacing:-.05em}
.mid{font:800 96px/1 'Inter Display';letter-spacing:-.045em}
.w{display:inline-block;margin-right:.22em;will-change:transform}
.sub{font-size:44px;line-height:1.3;font-weight:600;margin-top:44px;color:inherit}
.card{background:#fff;border-radius:34px;padding:50px 52px;margin-top:40px;min-height:430px;font:500 40px/1.5 Inter}
.tint .card{background:#fff}.white .card{background:#F1F7DC}
.chip{background:#C6F43A;color:#0F1A12;border-radius:8px;padding:0 9px;font-weight:700}
.cur{display:inline-block;width:6px;height:46px;background:#0F1A12;vertical-align:-8px;margin-left:3px}
.tip{margin-top:38px;font-size:36px;line-height:1.4;color:#3A463D;font-weight:500}.tip b{color:#0F1A12}
.item{display:flex;gap:34px;align-items:center;background:#fff;border-radius:28px;padding:38px 44px;margin-top:24px;font:800 52px/1.1 'Inter Display';letter-spacing:-.025em}
.item i{display:inline-flex;align-items:center;justify-content:center;width:84px;height:84px;border-radius:99px;background:#0F1A12;color:#C6F43A;font:800 48px 'Inter Display';font-style:normal;flex:none}
.stat{font:800 300px/1 'Inter Display';letter-spacing:-.06em;color:#C6F43A;white-space:nowrap}
.field{background:#fff;color:#0F1A12;border-radius:70px;padding:36px 48px;font:600 52px Inter;margin-top:50px;display:flex;justify-content:space-between;align-items:center}
.field .send{color:#0F1A12;background:#C6F43A;border-radius:60px;padding:10px 34px;font-weight:800}
.dm{background:#C6F43A;color:#0F1A12;border-radius:36px;padding:38px 44px;font:700 44px/1.3 Inter;margin-top:36px}
</style></head><body>
<div class="handle" id="h">@prompt.stackdaily</div>
<div id="scenes"></div>
<script>
const POST=${JSON.stringify(post)};
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const easeOut=x=>1-Math.pow(1-clamp(x),3);
const easeInOut=x=>{x=clamp(x);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2};
const easeBack=x=>{x=clamp(x);const c=1.7;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const words=s=>s.replace(/\\*\\*/g,'').split(' ').filter(Boolean).map(w=>'<span class="w">'+esc(w)+'</span>').join('');
const chipify=s=>esc(s).replace(/\\[(.+?)\\]/g,'<span class="chip">[$1]</span>');
const FIELD={hook:'lime',text:'white',list:'tint',prompt:'white',stat:'ink',cta:'ink'};
let total=0;const starts=POST.scenes.map(s=>{const st=total;total+=s.seconds;return st});
const root=document.getElementById('scenes');
const els=POST.scenes.map((s,i)=>{const d=document.createElement('div');let f=FIELD[s.kind];if(s.kind==='prompt'&&i%2)f='tint';d.className='scene '+f;
  if(s.kind==='hook'||s.kind==='text')d.innerHTML='<div class="'+(s.kind==='hook'?'big':'mid')+'">'+words(s.title)+'</div>'+(s.sub?'<div class="sub">'+esc(s.sub)+'</div>':'');
  if(s.kind==='prompt')d.innerHTML='<div class="mid" style="font-size:104px">'+words(s.title)+'</div><div class="card"><div class="typed"></div></div>'+(s.tip?'<div class="tip"><b>Why it works:</b> '+esc(s.tip)+'</div>':'');
  if(s.kind==='list')d.innerHTML='<div class="mid" style="font-size:112px">'+words(s.title)+'</div>'+s.items.map((t,k)=>'<div class="item"><i>'+(k+1)+'</i><span>'+esc(t)+'</span></div>').join('');
  if(s.kind==='stat')d.innerHTML='<div class="stat"><span class="n">0</span>'+esc(s.suffix||'')+'</div><div class="mid" style="font-size:88px;margin-top:10px">'+words(s.title)+'</div>'+(s.sub?'<div class="sub">'+esc(s.sub)+'</div>':'');
  if(s.kind==='cta')d.innerHTML='<div class="mid" style="font-size:108px">'+words(s.title)+'</div><div class="field"><span class="ty"></span><span class="send">Post</span></div><div class="dm" style="opacity:0">Sent! Your link is in your DMs.</div>';
  root.appendChild(d);return d});
window.setT=function(t){
  let cur=-1;POST.scenes.forEach((s,i)=>{if(t>=starts[i]-.001)cur=i});
  POST.scenes.forEach((s,i)=>{const el=els[i],lt=t-starts[i];
    // each scene wipes up over the previous one in 0.45s; the previous stays visible beneath until covered
    const show=(i===cur)||(i===cur-1&&t-starts[cur]<.5);
    el.style.visibility=show?'visible':'hidden';el.style.zIndex=i;
    if(!show)return;
    if(i===cur&&i>0){const p=easeInOut(lt/.45);el.style.clipPath='inset('+((1-p)*100)+'% 0 0 0)'}else el.style.clipPath='none';
    const sl=Math.max(0,lt-.2);
    el.querySelectorAll('.big .w,.mid .w').forEach((w,k)=>{const p=easeBack((sl-k*.08)/.5);w.style.opacity=clamp(p*2.5);w.style.transform='translateY('+((1-p)*80)+'px)'});
    if(s.kind==='prompt'){const full=s.prompt,start=.9,cps=full.length/Math.max(1,s.seconds-start-1.8);const n=Math.floor(clamp((lt-start)*cps,0,full.length));
      el.querySelector('.typed').innerHTML=chipify(full.slice(0,n))+(Math.floor(lt*2)%2===0||n<full.length?'<span class="cur"></span>':'')}
    if(s.kind==='list')el.querySelectorAll('.item').forEach((it,k)=>{const p=easeOut((lt-.7-k*.55)/.4);it.style.opacity=p;it.style.transform='translateX('+((1-p)*140)+'px)'});
    if(s.kind==='stat')el.querySelector('.n').textContent=Math.round(s.value*easeOut((lt-.3)/1.4));
    if(s.kind==='cta'){const word=POST.keyword||'PROMPTS',n=Math.floor(clamp((lt-1)*9,0,word.length));
      el.querySelector('.ty').innerHTML=esc(word.slice(0,n))+(lt<1+word.length/9+.6?'<span class="cur"></span>':'');
      const p=easeBack((lt-(1.2+word.length/9+.6))/.5);const dm=el.querySelector('.dm');dm.style.opacity=clamp(p*2);dm.style.transform='scale('+(.88+.12*clamp(p,0,1.2))+')'}
  });
  document.getElementById('h').style.color=(POST.scenes[cur]&&['ink'].includes(FIELD[POST.scenes[cur].kind]))?'#fff':'#0F1A12';
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
  await page.evaluate((t) => window.setT(t), 1.6);
  await page.screenshot({ path: path.join(out, 'cover.jpg'), type: 'jpeg', quality: 92 });
  await browser.close();
  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'),
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-b:v', '5M', '-c:a', 'aac',
    '-movflags', '+faststart', path.join(out, 'reel.mp4')], { stdio: 'ignore' });
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(`rendered ${id}: ${n} frames, ${total}s`);
})();
