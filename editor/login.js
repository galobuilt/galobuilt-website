/* Makes one editor login. Prints the line for EDITOR_LOGINS in Vercel (safe to store there, it is only a hash)
   and a new random password for that person. Nothing is saved here, the repo is public.
   node editor/login.js <email> */
const crypto = require("crypto");
const email = String(process.argv[2] || "").trim().toLowerCase();
if (!email) { console.error("usage: node editor/login.js <email>"); process.exit(1); }
const words = crypto.randomBytes(12).toString("base64url");
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(words, Buffer.from(salt, "hex"), 64).toString("hex");
console.log(JSON.stringify({ email, password: words, login: email + ":" + salt + ":" + hash }));
