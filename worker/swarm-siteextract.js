// swarm-siteextract v1.0 - generic site extraction lane of the ReStructure swarm.
// Auth: x-intake-key (same vault intake key as the orchestrator, houseimg lane unchanged).
// POST /extract/job {items:[{url,id?}], job_id?} -> queues extraction (max 50/job)
// GET  /extract/job/<id>         -> {done, failed, keys}
// GET  /extract/job/<id>/results -> combined records JSON
const UA = "restructure-swarm/1.0 (+https://restructure.cloud)";

function json(o, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: { "content-type": "application/json" } });
}
function stripHtml(h) {
  return h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/\s+/g, " ").trim();
}
function keyFor(u) {
  let h = 5381; for (let i = 0; i < u.length; i++) h = ((h << 5) + h + u.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
async function runJob(jobId, items, env) {
  for (const it of items) {
    const k = jobId + "/" + keyFor(it.url) + ".json";
    try {
      const res = await fetch(it.url, { headers: { "user-agent": UA, accept: "text/html,application/json,*/*" }, redirect: "follow" });
      const ct = res.headers.get("content-type") || "";
      const raw = await res.text();
      const rec = { url: it.url, id: it.id || null, status: res.status, content_type: ct, fetched_at: new Date().toISOString(), bytes: raw.length };
      if (ct.includes("json")) { try { rec.data = JSON.parse(raw); } catch (e) { rec.text = raw.slice(0, 200000); } }
      else { rec.title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ""])[1].trim(); rec.text = stripHtml(raw).slice(0, 60000); }
      await env.BUCKET.put(k, JSON.stringify(rec), { httpMetadata: { contentType: "application/json" } });
    } catch (e) {
      await env.BUCKET.put(k, JSON.stringify({ url: it.url, id: it.id || null, error: String(e), fetched_at: new Date().toISOString() }));
    }
    await new Promise(r => setTimeout(r, 500)); // politeness, <=2 rps
  }
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.headers.get("x-intake-key") !== env.INTAKE_KEY) return json({ error: "unauthorized" }, 401);
    if (url.pathname === "/extract/job" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
      if (!items.length) return json({ error: "no_items" }, 400);
      const jobId = body.job_id || ("sx-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6));
      ctx.waitUntil(runJob(jobId, items, env));
      return json({ ok: true, job_id: jobId, total: items.length });
    }
    const m = url.pathname.match(/^\/extract\/job\/([A-Za-z0-9-]+)(\/results)?$/);
    if (m && request.method === "GET") {
      const jobId = m[1];
      let keys = [], cursor;
      do {
        const l = await env.BUCKET.list({ prefix: jobId + "/", cursor, limit: 1000 });
        keys = keys.concat(l.objects.map(o => o.key)); cursor = l.truncated ? l.cursor : undefined;
      } while (cursor);
      if (!m[2]) return json({ job_id: jobId, done: keys.length, keys });
      const out = [];
      for (const k of keys) { const o = await env.BUCKET.get(k); if (o) out.push(await o.json()); }
      return json({ job_id: jobId, count: out.length, records: out });
    }
    return json({ error: "not_found" }, 404);
  }
}
