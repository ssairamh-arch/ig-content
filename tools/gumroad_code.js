// Body of the n8n Code node "Create Gumroad drafts". Creates each product in gumroad/products.json as an UNPUBLISHED draft,
// skipping names that already exist, and returns Gumroad's answer (or its error text) per product.
const cfg = $('Config').first().json;
const products = $input.all().map(i => i.json);
const http = (method, url, form) => this.helpers.httpRequest({ method, url, headers: { Authorization: `Bearer ${cfg.gumroadToken}` }, form, json: true });

let existing = [];
try { existing = (await http('GET', 'https://api.gumroad.com/v2/products')).products.map(p => p.name); }
catch (e) { return [{ json: { step: 'list products', error: e.message, body: e.response?.body ?? e.description ?? null } }]; }

const out = [];
for (const p of products) {
  if (existing.includes(p.name)) { out.push({ json: { name: p.name, status: 'already exists, skipped' } }); continue; }
  try {
    const r = await http('POST', 'https://api.gumroad.com/v2/products', {
      name: p.name, price: Math.round(p.price_usd * 100), description: p.description,
      tags: (p.tags || []).join(','), published: 'false',
    });
    if (!r.success) { out.push({ json: { name: p.name, status: 'NOT created', gumroad_said: r } }); continue; }
    out.push({ json: { name: p.name, status: 'draft created', id: r.product?.id, url: r.product?.short_url, published: r.product?.published, raw: r.product } });
  } catch (e) { out.push({ json: { name: p.name, status: 'failed', error: e.message, body: e.response?.body ?? null } }); }
}
return out;
