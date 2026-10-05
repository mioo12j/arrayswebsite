// ============================================================================
//  Download language chooser — a small promise-based modal shown before every
//  document/report/quote download. Resolves to 'en' | 'hi' | null (cancelled).
//  Built as a self-contained DOM overlay so the plain `download()` / `gstDownload()`
//  helpers can `await` it without wiring a React modal through ~15 call-sites.
// ============================================================================

// Some downloads (signed JSON, raw config) aren't language-bearing — skip them.
export function isTranslatableDownload(path) {
  const p = String(path || '');
  if (/\/json(\b|\?)|format=json/i.test(p)) return false;
  if (/\.docx(\b|\?)/i.test(p)) return false;   // Word exports are English-only — no language prompt
  return /\/pdf(\b|\?)|format=(pdf|xlsx)|\/reports\/|\/quotes\//i.test(p);
}

let openOverlay = null; // ensure only one prompt at a time

export function chooseDownloadLanguage() {
  return new Promise((resolve) => {
    if (openOverlay) { openOverlay(); openOverlay = null; }
    const dark = document.documentElement.classList.contains('dark');
    const C = dark
      ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', sub: '#94a3b8', border: '#334155', hover: '#334155' }
      : { bg: 'rgba(15,23,42,.45)', card: '#ffffff', text: '#0f172a', sub: '#64748b', border: '#e2e8f0', hover: '#f1f5f9' };
    const pref = localStorage.getItem('epc_lang') === 'hi' ? 'hi' : 'en';

    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: dark ? 'rgba(0,0,0,.6)' : C.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '9999',
      backdropFilter: 'blur(2px)', animation: 'epcFade .12s ease-out',
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      width: '380px', maxWidth: 'calc(100vw - 32px)', background: C.card, color: C.text,
      borderRadius: '14px', border: `1px solid ${C.border}`, padding: '22px',
      boxShadow: '0 20px 60px rgba(0,0,0,.25)', fontFamily: 'inherit',
    });

    card.innerHTML = `
      <div style="font-size:16px;font-weight:700;margin-bottom:4px;">Choose download language</div>
      <div style="font-size:13px;font-weight:600;color:${C.sub};margin-bottom:18px;">डाउनलोड की भाषा चुनें</div>
      <div style="display:flex;gap:12px;">
        <button data-lang="en" style="flex:1;cursor:pointer;text-align:left;padding:14px;border-radius:10px;border:1.5px solid ${C.border};background:transparent;color:${C.text};transition:all .12s;">
          <div style="font-size:15px;font-weight:700;">English</div>
          <div style="font-size:12px;color:${C.sub};margin-top:2px;">Standard document</div>
        </button>
        <button data-lang="hi" style="flex:1;cursor:pointer;text-align:left;padding:14px;border-radius:10px;border:1.5px solid ${C.border};background:transparent;color:${C.text};transition:all .12s;">
          <div style="font-size:15px;font-weight:700;">हिन्दी</div>
          <div style="font-size:12px;color:${C.sub};margin-top:2px;">Hindi document</div>
        </button>
      </div>
      <button data-lang="cancel" style="margin-top:16px;width:100%;cursor:pointer;padding:8px;border:none;background:transparent;color:${C.sub};font-size:13px;">Cancel</button>
    `;

    if (!document.getElementById('epc-lang-anim')) {
      const s = document.createElement('style');
      s.id = 'epc-lang-anim';
      s.textContent = '@keyframes epcFade{from{opacity:0}to{opacity:1}}';
      document.head.appendChild(s);
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const close = (val) => {
      window.removeEventListener('keydown', onKey);
      overlay.remove();
      openOverlay = null;
      resolve(val);
    };
    openOverlay = () => close(null);

    // hover + preferred-language highlight
    card.querySelectorAll('button[data-lang="en"],button[data-lang="hi"]').forEach((btn) => {
      const isPref = btn.dataset.lang === pref;
      if (isPref) { btn.style.borderColor = '#2563eb'; btn.style.boxShadow = '0 0 0 3px rgba(37,99,235,.15)'; }
      btn.addEventListener('mouseenter', () => { btn.style.background = C.hover; btn.style.borderColor = '#2563eb'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; if (!isPref) btn.style.borderColor = C.border; });
    });

    card.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-lang]');
      if (!b) return;
      const v = b.dataset.lang;
      close(v === 'cancel' ? null : v);
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') close(pref);
    };
    window.addEventListener('keydown', onKey);
  });
}

// Append the chosen language to a URL's query string.
export function withLang(path, lang) {
  if (!lang) return path;
  return path + (path.includes('?') ? '&' : '?') + 'lang=' + lang;
}
