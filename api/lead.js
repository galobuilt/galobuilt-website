/* Sends every estimate request from the website to GALO Built's inbox through Resend.
   Lives at /api/lead. Same pattern as the APS site (FormSubmit went offline in October 2026).
   Settings live in Vercel, never in this public repo:
     RESEND_API_KEY  required, a sending only key
     LEAD_TO         optional, default estimates@galobuilt.com
     LEAD_FROM       optional, default below */
const TO = process.env.LEAD_TO || "estimates@galobuilt.com";
const FROM = process.env.LEAD_FROM || "GALO Built Website <website@solumbra.ai>";

const LABELS = { name: "Name", phone: "Phone", email: "Email", city: "Project location", who: "I am a",
                 work: "Work needed", budget: "Approximate budget", message: "About the project", page: "Sent from" };
const ALLOWED_HOSTS = /^(galobuilt\.com|www\.galobuilt\.com|[a-z0-9-]+\.vercel\.app|localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/;
const MAX_FILES = 6;
const MAX_FILE_BYTES = 3 * 1024 * 1024;   // Vercel takes about 4.5 MB per request in total
const FILE_TYPES = /\.(jpe?g|png|webp|heic|pdf)$/i;

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = typeof req.body === "string" ? req.body : "";
  if (!raw) for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || "{}");
}

function reply(res, status, ok) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ success: ok }));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return reply(res, 405, false);
  const origin = req.headers.origin || req.headers.referer || "";
  let host = "";
  try { host = new URL(origin).host; } catch (e) { /* no origin */ }
  if (!ALLOWED_HOSTS.test(host)) return reply(res, 403, false);

  let body;
  try { body = await readJson(req); } catch (e) { return reply(res, 400, false); }

  // Spam checks: the hidden box must be empty, and a person takes more than 3 seconds to fill the form.
  if (body._honey || body.company_site) return reply(res, 200, true);
  if (Number(body._ms) > 0 && Number(body._ms) < 3000) return reply(res, 200, true);

  const fields = {};
  for (const k of Object.keys(LABELS)) {
    const v = Array.isArray(body[k]) ? body[k].join(", ") : body[k];
    if (v !== undefined && String(v).trim()) fields[k] = String(v).trim().slice(0, 4000);
  }
  if (!fields.name || (!fields.phone && !fields.email)) return reply(res, 400, false);
  const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email || "") ? fields.email : undefined;

  const attachments = [];
  let total = 0;
  for (const f of (Array.isArray(body.files) ? body.files : []).slice(0, MAX_FILES)) {
    if (!f || !FILE_TYPES.test(String(f.filename || "")) || typeof f.content !== "string") continue;
    const bytes = Math.floor(f.content.length * 3 / 4);
    if (bytes > MAX_FILE_BYTES || total + bytes > MAX_FILE_BYTES) continue;
    total += bytes;
    attachments.push({ filename: String(f.filename).replace(/[^\w.\- ]/g, "_").slice(0, 120), content: f.content });
  }

  const rows = Object.keys(fields).map((k) =>
    '<tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f6f6f4;font-weight:bold;vertical-align:top">' + esc(LABELS[k]) +
    '</td><td style="padding:8px 12px;border:1px solid #ddd">' + esc(fields[k]).replace(/\n/g, "<br>") + "</td></tr>").join("");
  const note = attachments.length ? '<p style="font-family:Arial,sans-serif;font-size:14px">' + attachments.length + " file(s) attached.</p>" : "";
  const html = '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' + rows + "</table>" + note;
  const text = Object.keys(fields).map((k) => LABELS[k] + ": " + fields[k]).join("\n");

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + process.env.RESEND_API_KEY, "content-type": "application/json", "user-agent": "galobuilt-website" },
    body: JSON.stringify({ from: FROM, to: [TO], reply_to: replyTo,
                           subject: ("New estimate request: " + fields.name + (fields.city ? ", " + fields.city : "")).slice(0, 200),
                           html, text, attachments: attachments.length ? attachments : undefined }),
  }).catch(() => null);
  if (!r || !r.ok) console.error("resend", r && r.status, r && (await r.text()));
  reply(res, r && r.ok ? 200 : 502, !!(r && r.ok));
};
