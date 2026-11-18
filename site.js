/* GALO Built page behaviour: menu, title block sheet index, estimate form. */
(function () {
  // Mobile menu
  const bar = document.querySelector('.bar');
  const menuBtn = document.querySelector('.menu-btn');
  if (bar && menuBtn) {
    menuBtn.addEventListener('click', () => {
      const open = bar.toggleAttribute('data-open');
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.textContent = open ? 'Close' : 'Menu';
    });
  }

  // Title block: shows the sheet in view, opens the sheet index
  const tb = document.querySelector('.titleblock');
  const sheets = [...document.querySelectorAll('[data-sheet]')];
  if (tb && sheets.length) {
    const num = tb.querySelector('.titleblock__sheet');
    const name = tb.querySelector('.titleblock__name');
    const btn = tb.querySelector('button');
    const list = tb.querySelector('.sheets');
    list.innerHTML = sheets.map(s => `<li><a href="#${s.id}"><b>${s.dataset.sheet}</b><span>${s.dataset.sheetName}</span></a></li>`).join('');
    const set = s => { num.textContent = s.dataset.sheet; name.textContent = s.dataset.sheetName; };
    const pick = () => {
      const mid = innerHeight * 0.45;
      let cur = sheets[0];
      for (const s of sheets) if (s.getBoundingClientRect().top <= mid) cur = s;
      set(cur);
    };
    addEventListener('scroll', pick, { passive: true }); pick();
    // Phones: the stamp would cover the form and the footer, so it steps aside while they are on screen.
    const phone = matchMedia('(max-width: 760px)');
    const inView = new Set();
    const io = new IntersectionObserver(es => {
      es.forEach(e => e.isIntersecting ? inView.add(e.target) : inView.delete(e.target));
      tb.classList.toggle('is-away', phone.matches && inView.size > 0);
    }, { rootMargin: '0px 0px -60px 0px' });
    document.querySelectorAll('form, footer').forEach(el => io.observe(el));
    const close = () => { tb.removeAttribute('data-open'); btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', () => { const o = tb.toggleAttribute('data-open'); btn.setAttribute('aria-expanded', String(o)); });
    list.addEventListener('click', e => { if (e.target.closest('a')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.addEventListener('click', e => { if (!tb.contains(e.target)) close(); });
  }

  // Estimate form: sends to /api/lead (Resend), which emails estimates@galobuilt.com.
  // Spam: a hidden box bots fill in, plus the time taken to fill the form.
  const shrink = file => new Promise(resolve => {
    const done = blob => {
      const r = new FileReader();
      r.onload = () => resolve({ filename: file.name.replace(/\.(heic|png|webp)$/i, '.jpg'), content: String(r.result).split(',')[1] });
      r.readAsDataURL(blob);
    };
    if (!/^image\//.test(file.type) && !/\.heic$/i.test(file.name)) {
      const r = new FileReader();
      r.onload = () => resolve({ filename: file.name, content: String(r.result).split(',')[1] });
      return r.readAsDataURL(file);
    }
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob(b => b ? done(b) : resolve(null), 'image/jpeg', 0.8);
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });

  document.querySelectorAll('.order').forEach(order => {
    const form = order.querySelector('form');
    if (!form) return;
    const opened = Date.now();
    const status = form.querySelector('[data-form-status]');
    const btn = form.querySelector('button[type=submit]');
    const label = btn.textContent;
    const say = (msg, bad) => { status.textContent = msg; status.classList.toggle('is-error', !!bad); };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (form.querySelector('.hp input').value) return;
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const body = { _ms: Date.now() - opened, page: location.pathname };
      for (const [k, v] of fd.entries()) {
        if (k === 'files' || k === 'company_site') continue;
        body[k] = body[k] ? body[k] + ', ' + v : v;
      }
      btn.disabled = true; btn.textContent = 'Sending...'; say('');
      const picked = [...(form.querySelector('[name=files]')?.files || [])].slice(0, 6);
      const files = (await Promise.all(picked.map(shrink))).filter(Boolean);
      let size = 0;
      body.files = files.filter(f => (size += f.content.length * 0.75) <= 3 * 1024 * 1024);
      try {
        const r = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json();
        if (!j.success) throw j;
        const n = String(body.name || '').trim().split(' ')[0];
        order.querySelector('[data-first]').textContent = n || 'there';
        if (window.gtag) gtag('event', 'generate_lead', { form: 'consultation', page: location.pathname });
        order.setAttribute('data-done', '');
        order.querySelector('.form-done').focus();
      } catch (err) {
        btn.disabled = false; btn.textContent = label;
        say('Sorry, that did not go through. Please call us at (949) 847-2227 or email estimates@galobuilt.com.', true);
      }
    });
  });
})();
