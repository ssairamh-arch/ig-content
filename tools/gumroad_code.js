// Body of the n8n Code node "Create Gumroad drafts". Creates each product in gumroad/products.json as an UNPUBLISHED draft.
// n8n's Code node has no URLSearchParams and ignores `form`, so the form body is built by hand. Arrays use key[]=value.
const cfg = $('Config').first().json;
const products = $input.all().map(i => i.json);
const headers = { Authorization: `Bearer ${cfg.gumroadToken}`, 'Content-Type': 'application/x-www-form-urlencoded' };
const show = (e) => ({ error: e.message, status: e.httpCode ?? e.statusCode ?? null, body: e.response?.body ?? e.cause?.response?.body ?? e.description ?? null });
const form = (o) => Object.entries(o).flatMap(([k, v]) => Array.isArray(v)
  ? v.map(x => `${encodeURIComponent(k)}[]=${encodeURIComponent(x)}`)
  : [`${encodeURIComponent(k)}=${encodeURIComponent(v)}`]).join('&');

const out = [];
let existing = [];
try { existing = (await this.helpers.httpRequest({ method: 'GET', url: 'https://api.gumroad.com/v2/products', headers, json: true })).products.map(p => p.name); }
catch (e) { return [{ json: { step: 'list products failed', ...show(e) } }]; }
for (const p of products) {
  if (existing.includes(p.name)) { out.push({ json: { name: p.name, status: 'already exists, skipped' } }); continue; }
  const body = form({
    name: p.name,
    price: String(Math.round(p.price_usd * 100)),
    description: p.description,
    tags: p.tags || [],
    published: 'false',
  });
  try {
    const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://api.gumroad.com/v2/products', headers, body, json: true });
    out.push({ json: { step: 'create', name: p.name, gumroad_said: r } });
  } catch (e) { out.push({ json: { step: 'create failed', name: p.name, ...show(e) } }); }
}
return out;
