/* The website editor's only door to the site's files. Lives at /api/editor.
   The pages themselves are the content: a Save changes the HTML in GitHub (one commit) and Vercel puts it live by itself.
   Settings live in Vercel, never in this public repo:
     EDITOR_GITHUB_TOKEN  fine grained token, only galobuilt/galobuilt-website, Contents read and write
     EDITOR_SECRET        a long random string that signs the login cookie
     EDITOR_LOGINS        who can log in: email:salt:hash, comma separated (made with: node editor/login.js <email>)
     EDITOR_REPO          optional, default galobuilt/galobuilt-website
     EDITOR_BRANCH        optional, default main */
const crypto = require("crypto");
const P = require("./_pages.js");

const REPO = process.env.EDITOR_REPO || "galobuilt/galobuilt-website";
const BRANCH = process.env.EDITOR_BRANCH || "main";
const SECRET = process.env.EDITOR_SECRET || "";
const COOKIE = "galo_editor";
const HOURS = 12;
const MAX_PHOTOS = 4;

/* ---------- GitHub ---------- */
async function gh(path, opts) {
  opts = opts || {};
  const r = await fetch("https://api.github.com" + path, {
    method: opts.method || "GET",
    headers: { authorization: "Bearer " + process.env.EDITOR_GITHUB_TOKEN, accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28", "user-agent": "galobuilt-editor", "content-type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error("GitHub said: " + (d.message || r.status)); e.gh = r.status; throw e; }
  return d;
}
async function readFiles(paths) {
  const head = await gh("/repos/" + REPO + "/git/ref/heads/" + BRANCH);
  const files = {};
  await Promise.all(paths.map(async (p) => {
    const d = await gh("/repos/" + REPO + "/contents/" + p + "?ref=" + head.object.sha);
    files[p] = { sha: d.sha, text: Buffer.from(d.content, "base64").toString("utf8") };
  }));
  return { head: head.object.sha, files };
}
/* One commit with every changed file. changes: [{ path, text } | { path, base64 }]. */
async function commit(head, changes, message, who) {
  const base = await gh("/repos/" + REPO + "/git/commits/" + head);
  const tree = [];
  for (const c of changes) {
    if (c.base64) {
      const blob = await gh("/repos/" + REPO + "/git/blobs", { method: "POST", body: { content: c.base64, encoding: "base64" } });
      tree.push({ path: c.path, mode: "100644", type: "blob", sha: blob.sha });
    } else tree.push({ path: c.path, mode: "100644", type: "blob", content: c.text });
  }
  const t = await gh("/repos/" + REPO + "/git/trees", { method: "POST", body: { base_tree: base.tree.sha, tree } });
  const made = await gh("/repos/" + REPO + "/git/commits", { method: "POST", body: {
    message, tree: t.sha, parents: [head], author: { name: who, email: who, date: new Date().toISOString() } } });
  try {
    await gh("/repos/" + REPO + "/git/refs/heads/" + BRANCH, { method: "PATCH", body: { sha: made.sha, force: false } });
  } catch (e) {
    if (e.gh === 422) { const x = new Error("Someone else saved a moment ago. Reload the editor, then make your change again."); x.status = 409; throw x; }
    throw e;
  }
  return made.sha;
}

/* ---------- logins ---------- */
function logins() {
  return String(process.env.EDITOR_LOGINS || "").split(",").map((x) => x.trim().split(":")).filter((x) => x.length === 3)
    .map(([email, salt, hash]) => ({ email: email.toLowerCase(), salt, hash }));
}
function sign(obj) { const p = Buffer.from(JSON.stringify(obj)).toString("base64url"); return p + "." + crypto.createHmac("sha256", SECRET).update(p).digest("base64url"); }
function unsign(tok) {
  const [p, s] = String(tok || "").split(".");
  if (!p || !s || !SECRET) return null;
  const want = crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
  if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
  try { const o = JSON.parse(Buffer.from(p, "base64url").toString()); return o.x > Date.now() ? o : null; } catch (e) { return null; }
}
function who(req) {
  const m = /(?:^|;\s*)galo_editor=([^;]+)/.exec(req.headers.cookie || "");
  const s = m && unsign(m[1]);
  return s && logins().some((l) => l.email === s.e) ? s.e : null;
}
const tries = new Map(); // slows down password guessing on one warm instance
function cookie(res, value, maxAge) {
  res.setHeader("set-cookie", COOKIE + "=" + value + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge);
}

/* ---------- request plumbing ---------- */
async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = typeof req.body === "string" ? req.body : "";
  if (!raw) for await (const c of req) raw += c;
  return JSON.parse(raw || "{}");
}
function send(res, status, obj) { res.statusCode = status; res.setHeader("content-type", "application/json"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(obj)); }

module.exports = async (req, res) => {
  try {
    if (!SECRET || !process.env.EDITOR_GITHUB_TOKEN) return send(res, 503, { error: "The editor is not switched on yet. Its settings are missing in Vercel." });
    const action = new URL(req.url, "http://x").searchParams.get("a") || "";

    if (action === "login" && req.method === "POST") {
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0];
      const t = tries.get(ip) || { n: 0, at: 0 };
      if (t.n >= 8 && Date.now() - t.at < 15 * 60000) return send(res, 429, { error: "Too many tries. Wait 15 minutes, then try again." });
      const b = await body(req);
      const l = logins().find((x) => x.email === String(b.email || "").trim().toLowerCase());
      const ok = l && crypto.timingSafeEqual(crypto.scryptSync(String(b.password || ""), Buffer.from(l.salt, "hex"), 64), Buffer.from(l.hash, "hex"));
      if (!ok) { tries.set(ip, { n: t.n + 1, at: Date.now() }); return send(res, 401, { error: "That email and password do not match." }); }
      tries.delete(ip);
      cookie(res, sign({ e: l.email, x: Date.now() + HOURS * 3600000 }), HOURS * 3600);
      return send(res, 200, { email: l.email });
    }
    if (action === "logout") { cookie(res, "", 0); return send(res, 200, {}); }

    const me = who(req);
    if (!me) return send(res, 401, { error: "Please log in." });

    if (action === "load") {
      const snap = await readFiles(P.PAGES);
      const pages = {}, shas = {};
      P.PAGES.forEach((p) => { pages[p] = snap.files[p].text; shas[p] = snap.files[p].sha; });
      return send(res, 200, { me, shas, pages, biz: P.readBiz(pages["index.html"]), projects: P.readProjects(pages["projects.html"]) });
    }

    if (action === "save" && req.method === "POST") {
      const b = await body(req);
      const snap = await readFiles(P.PAGES.concat(P.ALSO));
      // Stop if a page this person changed was saved by someone else after they opened the editor.
      const touched = new Set((b.edits || []).map((e) => e.file));
      if (b.photos && b.photos.length) touched.add("projects.html");
      if (b.biz) P.PAGES.forEach((f) => touched.add(f));
      if ([...touched].some((f) => b.shas && b.shas[f] && snap.files[f] && b.shas[f] !== snap.files[f].sha))
        return send(res, 409, { error: "Someone else saved a moment ago. Reload the editor, then make your change again." });
      const text = {};
      Object.keys(snap.files).forEach((f) => { text[f] = snap.files[f].text; });
      const notes = [];

      for (const e of b.edits || []) {
        if (P.PAGES.indexOf(e.file) < 0) return send(res, 400, { error: "Unknown page." });
        text[e.file] = P.setText(text[e.file], e.key, e.value);
      }
      if ((b.edits || []).length) notes.push((b.edits.length) + " text change" + (b.edits.length > 1 ? "s" : ""));

      if (b.biz) {
        const from = P.readBiz(text["index.html"]);
        const to = { phone: String(b.biz.phone || from.phone).trim(), email: String(b.biz.email || from.email).trim() };
        if (to.phone !== from.phone || to.email !== from.email) {
          Object.keys(text).forEach((f) => { text[f] = P.setBiz(text[f], from, to); });
          notes.push("business details");
        }
      }

      const extra = [];
      if (b.photos) {
        const projects = P.readProjects(text["projects.html"]);
        let added = 0;
        for (const p of b.photos) {
          const proj = projects.find((x) => x.slug === p.slug);
          if (!proj) return send(res, 400, { error: "Unknown project." });
          let tiles = proj.tiles.filter((t) => (p.remove || []).indexOf(t.full) < 0);
          if (Array.isArray(p.order)) tiles.sort((a, c) => p.order.indexOf(a.full) - p.order.indexOf(c.full));
          for (const n of p.add || []) {
            if (++added > MAX_PHOTOS) return send(res, 400, { error: "Add up to " + MAX_PHOTOS + " photos at a time, then save again for more." });
            if (!/^[A-Za-z0-9+/=]+$/.test(n.big || "") || !/^[A-Za-z0-9+/=]+$/.test(n.small || "")) return send(res, 400, { error: "A photo did not upload properly. Try it again." });
            const id = p.slug + "-" + Date.now().toString(36) + "-" + crypto.randomBytes(2).toString("hex");
            const ext = n.type === "jpg" ? "jpg" : "webp";
            const full = "assets/galo/up/" + id + "." + ext, small = "assets/galo/up/" + id + "-s." + ext;
            extra.push({ path: full, base64: n.big }, { path: small, base64: n.small });
            const cap = String(n.caption || "").replace(/\s+/g, " ").trim().slice(0, 140) || "Project photo";
            tiles.push({ full, w: n.w | 0, h: n.h | 0, small, sw: n.sw | 0, sh: n.sh | 0, cap: proj.name + ": " + cap, alt: cap });
          }
          text["projects.html"] = P.setTiles(text["projects.html"], p.slug, tiles);
        }
        notes.push("project photos");
      }

      const changes = Object.keys(text).filter((f) => text[f] !== snap.files[f].text).map((f) => ({ path: f, text: text[f] })).concat(extra);
      if (!changes.length) return send(res, 200, { nothing: true });
      const sha = await commit(snap.head, changes, "Editor: " + notes.join(", ") + " (" + me + ")", me);
      return send(res, 200, { ok: true, sha });
    }
    return send(res, 404, { error: "Unknown action." });
  } catch (e) {
    console.error("editor", e);
    return send(res, e.status || 500, { error: e.status ? e.message : (String(e.message || "").indexOf("A text box") === 0 || /phone|email|photo|project/.test(e.message || "") ? e.message : "Something went wrong saving. Nothing was changed. Try again in a minute.") });
  }
};
