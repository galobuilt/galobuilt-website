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
    const close = () => { tb.removeAttribute('data-open'); btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', () => { const o = tb.toggleAttribute('data-open'); btn.setAttribute('aria-expanded', String(o)); });
    list.addEventListener('click', e => { if (e.target.closest('a')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.addEventListener('click', e => { if (!tb.contains(e.target)) close(); });
  }

  // Estimate form: demo only, nothing is sent. Honeypot blocks simple bots.
  document.querySelectorAll('.order').forEach(order => {
    const form = order.querySelector('form');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (form.querySelector('.hp input').value) return;
      if (!form.reportValidity()) return;
      const n = form.querySelector('[name=name]').value.trim().split(' ')[0];
      order.querySelector('[data-first]').textContent = n || 'there';
      order.setAttribute('data-done', '');
      order.querySelector('.form-done').focus();
    });
  });
})();
