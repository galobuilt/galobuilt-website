/* The GALO Built website editor. Talks only to /api/editor. Nothing is stored in the browser. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var API = "/api/editor?a=";
  var PAGES = [["index.html", "Home"], ["about.html", "About"], ["services.html", "Services"], ["projects.html", "Our Work"], ["contact.html", "Contact"]];
  var TABS = PAGES.concat([["photos", "Project photos"], ["biz", "Phone and email"]]);
  var MAX_NEW = 4;
  var data = null, tab = "index.html";
  var edits = {}, biz = null, photos = {};

  function call(action, body) {
    return fetch(API + action, { method: body ? "POST" : "GET", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || "Something went wrong."); e.status = r.status; throw e; } return d; }); });
  }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k]; else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function grow(t) { t.style.height = "auto"; t.style.height = (t.scrollHeight + 2) + "px"; }

  /* ---------- login ---------- */
  function showLogin() { $("#appWrap").hidden = true; $("#login").hidden = false; $("#loginForm input").focus(); }
  $("#loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, btn = $("button", f);
    btn.disabled = true; $("#loginErr").textContent = "";
    call("login", { email: f.email.value, password: f.password.value }).then(load).catch(function (err) { $("#loginErr").textContent = err.message; }).then(function () { btn.disabled = false; });
  });
  $("#logout").addEventListener("click", function () {
    if (count() && !confirm("You have changes that are not saved. Log out anyway?")) return;
    call("logout").then(function () { location.reload(); });
  });

  /* ---------- load ---------- */
  function load() {
    return call("load").then(function (d) {
      data = d; edits = {}; biz = null; photos = {};
      $("#login").hidden = true; $("#appWrap").hidden = false; $("#who").textContent = d.me;
      draw(); status();
    }).catch(function (err) { if (err.status === 401) showLogin(); else alert(err.message); });
  }

  /* ---------- fields per page ---------- */
  var ROLE = { H1: "Main headline", H2: "Heading", H3: "Small heading", LI: "List item", DD: "Detail", B: "Label", SPAN: "Line under the label" };
  function role(n) {
    if (n.tagName === "P") return n.classList.contains("lede") ? "Intro text" : n.classList.contains("tag") ? "Small line above a heading" : "Paragraph";
    return ROLE[n.tagName] || "Text";
  }
  function fieldsOf(file) {
    var doc = new DOMParser().parseFromString(data.pages[file], "text/html");
    var groups = [], byName = {};
    doc.querySelectorAll("main [data-k]").forEach(function (n) {
      var sec = n.closest("[data-sheet-name]");
      var name = sec ? sec.getAttribute("data-sheet-name") : "Top of the page";
      var art = n.closest("article[id], .svc__row, .who__item, .step, .course, .proj, .trade, .vals > div");
      if (art && art.querySelector("h2, h3, b")) { var h = art.querySelector("h2, h3, b"); if (h !== n) name = name + ": " + h.textContent.trim(); }
      if (!byName[name]) { byName[name] = { name: name, fields: [] }; groups.push(byName[name]); }
      byName[name].fields.push({ key: n.getAttribute("data-k"), role: role(n), value: n.textContent });
    });
    return groups;
  }
  function drawPage(file, label) {
    var main = $("#main");
    main.appendChild(el("h2", { text: label }));
    main.appendChild(el("p", { class: "lead", text: "Change any text below, then press Save and publish. The website updates by itself in about a minute." }));
    fieldsOf(file).forEach(function (g) {
      var box = el("section", { class: "group" }, [el("h3", { text: g.name })]);
      g.fields.forEach(function (f) {
        var id = file + "|" + f.key;
        var ta = el("textarea", { rows: 1 });
        ta.value = edits[id] !== undefined ? edits[id] : f.value;
        var wrap = el("label", { class: "field" + (edits[id] !== undefined ? " changed" : "") }, [el("span", { text: f.role }), ta]);
        ta.addEventListener("input", function () {
          grow(ta);
          if (ta.value.trim() === f.value.trim()) delete edits[id]; else edits[id] = ta.value;
          wrap.classList.toggle("changed", edits[id] !== undefined); status(); tabs();
        });
        box.appendChild(wrap);
        requestAnimationFrame(function () { grow(ta); });
      });
      main.appendChild(box);
    });
  }

  /* ---------- business ---------- */
  function drawBiz() {
    var main = $("#main"), cur = biz || data.biz;
    main.appendChild(el("h2", { text: "Phone and email" }));
    main.appendChild(el("p", { class: "lead", text: "These show on every page. The email is also where estimate requests are sent." }));
    var box = el("section", { class: "group" });
    [["phone", "Phone number", "tel"], ["email", "Email for estimate requests", "email"]].forEach(function (x) {
      var inp = el("input", { type: x[2], value: cur[x[0]] });
      inp.addEventListener("input", function () {
        biz = biz || { phone: data.biz.phone, email: data.biz.email };
        biz[x[0]] = inp.value.trim();
        if (biz.phone === data.biz.phone && biz.email === data.biz.email) biz = null;
        status(); tabs();
      });
      box.appendChild(el("label", { class: "field" }, [el("span", { text: x[1] }), inp]));
    });
    main.appendChild(box);
  }

  /* ---------- photos ---------- */
  function pState(slug) { return photos[slug] || (photos[slug] = { remove: [], add: [], cover: null }); }
  function newCount() { return Object.keys(photos).reduce(function (n, k) { return n + photos[k].add.length; }, 0); }
  function shrink(file, max, type) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (!b) return reject(new Error("This photo could not be read."));
          var r = new FileReader();
          r.onload = function () { resolve({ b64: String(r.result).split(",")[1], w: c.width, h: c.height, type: b.type === "image/webp" ? "webp" : "jpg", url: URL.createObjectURL(b) }); };
          r.readAsDataURL(b);
        }, type, 0.72);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(file.name + " could not be opened here. On iPhone, share it as a JPEG, or take a screenshot of it.")); };
      img.src = url;
    });
  }
  function addFiles(slug, files) {
    var room = MAX_NEW - newCount();
    var list = Array.prototype.slice.call(files, 0, Math.max(0, room));
    if (files.length > room) alert("You can add " + MAX_NEW + " photos at a time. Save, then add the rest.");
    $("#msg").textContent = "Preparing photos..."; $("#msg").className = "msg";
    Promise.all(list.map(function (f) {
      return shrink(f, 2000, "image/webp").then(function (big) {
        var t = big.type === "webp" ? "image/webp" : "image/jpeg";
        return shrink(f, 900, t).then(function (small) {
          return { big: big.b64, small: small.b64, w: big.w, h: big.h, sw: small.w, sh: small.h, type: big.type, url: small.url, caption: f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") };
        });
      });
    })).then(function (made) { pState(slug).add = pState(slug).add.concat(made); draw(); status(); tabs(); })
      .catch(function (err) { alert(err.message); status(); });
  }
  function drawPhotos() {
    var main = $("#main");
    main.appendChild(el("h2", { text: "Project photos" }));
    main.appendChild(el("p", { class: "lead", text: "Add or remove photos for each project. The first photo is the big one. Photos are made smaller before they upload, so they stay fast." }));
    data.projects.forEach(function (p) {
      var s = pState(p.slug);
      var order = p.tiles.map(function (t) { return t.full; });
      if (s.cover) { order.splice(order.indexOf(s.cover), 1); order.unshift(s.cover); }
      var box = el("section", { class: "proj" }, [el("h3", { text: p.name + " (" + (order.length - s.remove.length + s.add.length) + " photos)" })]);
      var grid = el("div", { class: "thumbs" });
      order.forEach(function (full, i) {
        var t = p.tiles.filter(function (x) { return x.full === full; })[0];
        var gone = s.remove.indexOf(full) >= 0;
        grid.appendChild(el("div", { class: "thumb" + (gone ? " gone" : "") }, [
          i === 0 && !gone ? el("span", { class: "badge", text: "Big photo" }) : null,
          el("img", { src: "/" + t.small, alt: t.alt, loading: "lazy" }),
          el("div", { class: "row" }, [
            el("button", { type: "button", text: gone ? "Keep it" : "Remove", onclick: function () {
              if (gone) s.remove.splice(s.remove.indexOf(full), 1); else s.remove.push(full);
              draw(); status(); tabs(); } }),
            !gone && i > 0 ? el("button", { type: "button", text: "Make it the big photo", onclick: function () { s.cover = full; draw(); status(); tabs(); } }) : null,
          ]),
        ]));
      });
      s.add.forEach(function (n, i) {
        var cap = el("input", { type: "text", value: n.caption, "aria-label": "Short description of this photo", placeholder: "Short description" });
        cap.addEventListener("input", function () { n.caption = cap.value; });
        grid.appendChild(el("div", { class: "thumb new" }, [
          el("span", { class: "badge", text: "New" }), el("img", { src: n.url, alt: "" }), cap,
          el("div", { class: "row" }, [el("button", { type: "button", text: "Take it out", onclick: function () { s.add.splice(i, 1); draw(); status(); tabs(); } })]),
        ]));
      });
      box.appendChild(grid);
      var inp = el("input", { type: "file", accept: "image/*", multiple: "", hidden: "" });
      inp.addEventListener("change", function () { addFiles(p.slug, inp.files); inp.value = ""; });
      box.appendChild(el("div", {}, [inp, el("button", { class: "btn btn--ghost add", type: "button", text: "+ Add photos", onclick: function () { inp.click(); } })]));
      main.appendChild(box);
    });
  }

  /* ---------- shell ---------- */
  function photoChanges() { return Object.keys(photos).filter(function (k) { var s = photos[k]; return s.remove.length || s.add.length || s.cover; }); }
  function count() { return Object.keys(edits).length + (biz ? 1 : 0) + photoChanges().length; }
  function dirty(key) {
    if (key === "biz") return !!biz;
    if (key === "photos") return photoChanges().length > 0;
    return Object.keys(edits).some(function (id) { return id.indexOf(key + "|") === 0; });
  }
  function tabs() {
    var nav = $("#tabs"); nav.innerHTML = "";
    TABS.forEach(function (t) {
      nav.appendChild(el("button", { class: "tab", role: "tab", type: "button", "aria-selected": String(t[0] === tab), onclick: function () { tab = t[0]; draw(); window.scrollTo(0, 0); } },
        [el("span", { text: t[1] }), dirty(t[0]) ? el("span", { class: "dot", "aria-label": "has changes" }) : null]));
    });
  }
  function draw() {
    tabs();
    var main = $("#main"); main.innerHTML = "";
    if (tab === "biz") drawBiz(); else if (tab === "photos") drawPhotos();
    else drawPage(tab, TABS.filter(function (t) { return t[0] === tab; })[0][1]);
  }
  function status(text, kind) {
    var n = count();
    $("#saveBtn").disabled = !n; $("#undo").hidden = !n;
    var m = $("#msg");
    m.className = "msg" + (kind ? " " + kind : "");
    m.textContent = text || (n ? n + " change" + (n > 1 ? "s" : "") + " not saved yet." : "No changes yet.");
  }
  $("#undo").addEventListener("click", function () { if (confirm("Undo every change you have not saved?")) { edits = {}; biz = null; photos = {}; draw(); status(); } });
  window.addEventListener("beforeunload", function (e) { if (count()) { e.preventDefault(); e.returnValue = ""; } });

  $("#saveBtn").addEventListener("click", function () {
    var body = { shas: data.shas, edits: Object.keys(edits).map(function (id) { var p = id.split("|"); return { file: p[0], key: p[1], value: edits[id] }; }) };
    if (biz) body.biz = biz;
    var ph = photoChanges().map(function (slug) {
      var s = photos[slug], p = data.projects.filter(function (x) { return x.slug === slug; })[0];
      var order = p.tiles.map(function (t) { return t.full; });
      if (s.cover) { order.splice(order.indexOf(s.cover), 1); order.unshift(s.cover); }
      return { slug: slug, remove: s.remove, order: order, add: s.add.map(function (n) { return { big: n.big, small: n.small, w: n.w, h: n.h, sw: n.sw, sh: n.sh, type: n.type, caption: n.caption }; }) };
    });
    if (ph.length) body.photos = ph;
    $("#saveBtn").disabled = true; status("Saving...");
    call("save", body).then(function (d) {
      return load().then(function () { status(d.nothing ? "Nothing to save." : "Saved. The website shows it in about a minute.", "ok"); });
    }).catch(function (err) { status(err.message, "bad"); $("#saveBtn").disabled = false; if (err.status === 401) showLogin(); });
  });

  load();
})();
