/* Shared by the editor: reads and changes the site's HTML in place. No build step, the pages are the content.
   Text:     any element with data-k="<page>-<n>" (added by editor/mark.py).
   Business: <a data-biz="phone|email">, plus the same values anywhere else in the site files.
   Photos:   the tiles inside <article class="set" id="<project>"> on projects.html. */

const PAGES = ["index.html", "about.html", "services.html", "projects.html", "contact.html"];
const ALSO = ["site.js", "api/lead.js"]; // hold the phone or email in plain text

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }
function unesc(s) { return String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"); }
function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/* ---------- text ---------- */
function setText(html, key, value) {
  const re = new RegExp('(<(h1|h2|h3|p|li|dd|b|span)\\b[^>]*\\sdata-k="' + reEsc(key) + '"[^>]*>)([^<]*)(</\\2>)');
  if (!re.test(html)) throw new Error("Could not find the text " + key + ". Reload the editor and try again.");
  const clean = String(value).replace(/\s+/g, " ").trim().slice(0, 1200);
  if (!clean) throw new Error("A text box was left empty. Every text needs at least a few words.");
  return html.replace(re, (m, open, tag, old, close) => open + esc(clean) + close);
}

/* ---------- business details ---------- */
function digits(p) { return String(p).replace(/\D/g, ""); }
function telOf(p) { const d = digits(p); return "+" + (d.length === 10 ? "1" + d : d); }
function readBiz(html) {
  const ph = /<a href="tel:([^"]+)" data-biz="phone">([^<]*)<\/a>/.exec(html);
  const em = /<a href="mailto:([^"]+)" data-biz="email">([^<]*)<\/a>/.exec(html);
  return { phone: ph ? unesc(ph[2]) : "", email: em ? unesc(em[1]) : "" };
}
function setBiz(text, from, to) {
  let s = text;
  if (to.phone && to.phone !== from.phone) {
    if (digits(to.phone).length < 10) throw new Error("The phone number needs at least 10 digits.");
    s = s.split(esc(from.phone)).join(esc(to.phone)).split(from.phone).join(to.phone);
    s = s.split(telOf(from.phone)).join(telOf(to.phone));
    const dashed = "+1-" + digits(from.phone).slice(-10).replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
    s = s.split(dashed).join("+1-" + digits(to.phone).slice(-10).replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3"));
  }
  if (to.email && to.email !== from.email) {
    if (!/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(to.email)) throw new Error("That email address does not look right.");
    s = s.split(from.email).join(to.email.toLowerCase());
  }
  return s;
}

/* ---------- project photos ---------- */
const TILE = /<button class="tile[^"]*" type="button" data-full="([^"]+)" data-w="(\d+)" data-h="(\d+)" data-cap="([^"]*)" aria-label="[^"]*">\s*<img [^>]*src="([^"]+)" width="(\d+)" height="(\d+)"[^>]*alt="([^"]*)"[^>]*>\s*<\/button>/g;

function projectBlock(html, slug) {
  const re = new RegExp('<article class="set" id="' + reEsc(slug) + '" data-set>[\\s\\S]*?</article>');
  const m = re.exec(html);
  if (!m) throw new Error("Could not find the project " + slug + ".");
  return m;
}
function readProjects(html) {
  const out = [];
  const re = /<article class="set" id="([^"]+)" data-set>[\s\S]*?<h2[^>]*>([^<]*)<\/h2>[\s\S]*?<\/article>/g;
  let m;
  while ((m = re.exec(html))) {
    const tiles = [];
    let t;
    TILE.lastIndex = 0;
    while ((t = TILE.exec(m[0]))) tiles.push({ full: t[1], w: +t[2], h: +t[3], cap: unesc(t[4]), small: t[5], sw: +t[6], sh: +t[7], alt: unesc(t[8]) });
    out.push({ slug: m[1], name: unesc(m[2]), tiles });
  }
  return out;
}
function tileHtml(t, i) {
  return '<button class="tile' + (i === 0 ? " tile--cover" : "") + '" type="button" data-full="' + escAttr(t.full) + '" data-w="' + t.w + '" data-h="' + t.h +
    '" data-cap="' + escAttr(t.cap) + '" aria-label="Open photo: ' + escAttr(t.alt) + '"><img loading="lazy" src="' + escAttr(t.small) + '" width="' + t.sw +
    '" height="' + t.sh + '" alt="' + escAttr(t.alt) + '"></button>';
}
function setTiles(html, slug, tiles) {
  if (!tiles.length) throw new Error("A project needs at least one photo.");
  const m = projectBlock(html, slug);
  let block = m[0].replace(/<div class="set__grid set__grid--\d+">[\s\S]*<\/div>(\s*<\/article>)$/,
    '<div class="set__grid set__grid--' + Math.min(tiles.length, 5) + '">' + tiles.map(tileHtml).join("") + "</div>$1");
  block = block.replace(/(<dt>Photos<\/dt><dd[^>]*>)\d+(<\/dd>)/, "$1" + tiles.length + "$2");
  return html.slice(0, m.index) + block + html.slice(m.index + m[0].length);
}

module.exports = { PAGES, ALSO, setText, readBiz, setBiz, readProjects, setTiles, esc, unesc };
