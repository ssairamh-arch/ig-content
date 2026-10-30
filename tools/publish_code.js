// Body of the n8n Code node "Publish due post". Runs once per schedule tick.
const cfg = $('Config').first().json;
const queue = $input.first().json.queue ?? $input.all().map(i => i.json);
const store = $getWorkflowStaticData('global');
store.posted = store.posted || [];
const API = 'https://graph.instagram.com/v21.0';
const today = new Date().toLocaleDateString('en-CA', { timeZone: cfg.timezone });

const due = queue.filter(p => p.date <= today && !store.posted.includes(p.id)).sort((a, b) => a.date.localeCompare(b.date))[0];
if (!due) return [{ json: { status: 'nothing due', today } }];

const call = (method, path, qs) => this.helpers.httpRequest({ method, url: `${API}${path}`, qs: { access_token: cfg.token, ...qs }, json: true });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function ready(id) {
  for (let i = 0; i < 40; i++) {
    const s = await call('GET', `/${id}`, { fields: 'status_code' });
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`container ${id}: ${s.status_code}`);
    await wait(5000);
  }
  throw new Error(`container ${id} not ready in time`);
}

let creation;
if (due.type === 'reel') {
  const c = await call('POST', `/${cfg.igUserId}/media`, { media_type: 'REELS', video_url: due.media[0], caption: due.caption, share_to_feed: true });
  await ready(c.id); creation = c.id;
} else {
  const kids = [];
  for (const url of due.media) { const c = await call('POST', `/${cfg.igUserId}/media`, { image_url: url, is_carousel_item: true }); kids.push(c.id); }
  for (const k of kids) await ready(k);
  const c = await call('POST', `/${cfg.igUserId}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption: due.caption });
  await ready(c.id); creation = c.id;
}
const pub = await call('POST', `/${cfg.igUserId}/media_publish`, { creation_id: creation });
store.posted.push(due.id);
return [{ json: { status: 'published', id: due.id, instagramMediaId: pub.id } }];
