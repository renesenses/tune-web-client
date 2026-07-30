/**
 * Sonde injectee dans la page AVANT tout rendu (`addInitScript`).
 *
 * Tout ce qui doit observer l'application depuis l'interieur vit ici :
 * l'automate ne peut pas voir depuis Node les toasts qui apparaissent et
 * disparaissent en 5 s, ni le corps des reponses HTTP. On installe donc un
 * mouchard cote page, que l'automate vide apres chaque action.
 *
 * Contrat : la page expose `window.__tuneCrawl` avec
 *   - `toasts`   : tous les toasts apparus (jamais perdus par l'auto-dismiss)
 *   - `calls`    : requetes fetch avec methode, url, corps, statut, taille
 *   - `errors`   : exceptions JS et rejets de promesse non geres
 *   - `warnings` : messages console.error / console.warn
 *
 * La fonction est serialisee par Playwright : aucune reference au scope Node.
 */
export function installProbe() {
  if (window.__tuneCrawl) return;

  const bus = {
    toasts: [],
    calls: [],
    errors: [],
    warnings: [],
    seq: 0,
    /** Horodatage monotone, partage par tous les signaux d'une meme action. */
    now: () => Math.round(performance.now()),
  };
  window.__tuneCrawl = bus;

  // --- Erreurs JS -----------------------------------------------------------
  window.addEventListener('error', (e) => {
    // Les echecs de chargement de ressource portent sur un element et non sur
    // une exception : ils sont traites ailleurs (detection d'images cassees).
    if (!e.error && !e.message) return;
    bus.errors.push({
      at: bus.now(),
      kind: 'exception',
      message: String(e.message || e.error),
      stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 2000) : null,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    bus.errors.push({
      at: bus.now(),
      kind: 'unhandledrejection',
      message: reason && reason.message ? String(reason.message) : String(reason),
      stack: reason && reason.stack ? String(reason.stack).slice(0, 2000) : null,
    });
  });

  // --- console.error / console.warn ----------------------------------------
  const format = (value) => {
    if (value instanceof Error) {
      const head = value.message;
      const tail = value.stack ? '\n' + value.stack.split('\n').slice(0, 4).join('\n') : '';
      return head + tail;
    }
    if (typeof value === 'object' && value !== null) {
      try { return JSON.stringify(value).slice(0, 500); } catch { return String(value); }
    }
    return String(value);
  };

  for (const level of ['error', 'warn']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      try {
        bus.warnings.push({ at: bus.now(), level, message: args.map(format).join(' ').slice(0, 2000) });
      } catch { /* ne jamais casser la page pour un log */ }
      original(...args);
    };
  }

  // --- fetch ----------------------------------------------------------------
  // Le corps de la reponse est indispensable : c'est lui qui revele qu'un 2xx
  // renvoie un corps vide alors que le client en fait un JSON.parse.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const started = bus.now();
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const entry = {
      id: ++bus.seq,
      at: started,
      method,
      url,
      requestBody: init && typeof init.body === 'string' ? init.body.slice(0, 1000) : null,
      status: null, ok: null, bodyLength: null, bodyPreview: null,
      contentType: null, durationMs: null, failed: false,
    };
    bus.calls.push(entry);
    try {
      const response = await nativeFetch(input, init);
      entry.status = response.status;
      entry.ok = response.ok;
      entry.contentType = response.headers.get('content-type');
      entry.durationMs = bus.now() - started;
      try {
        // Cloner : lire le flux original priverait l'application de sa reponse.
        const text = await response.clone().text();
        entry.bodyLength = text.length;
        entry.bodyPreview = text.slice(0, 400);
      } catch {
        entry.bodyLength = -1;
      }
      return response;
    } catch (e) {
      entry.failed = true;
      entry.durationMs = bus.now() - started;
      entry.bodyPreview = String((e && e.message) || e);
      throw e;
    }
  };

  // --- Toasts ---------------------------------------------------------------
  // ToastContainer rend un element .toast (.toast-error / -success / -info)
  // puis le retire au bout de quelques secondes. Un MutationObserver le capte
  // a coup sur, la ou une inspection periodique du DOM en manquerait.
  const seen = new WeakSet();
  const harvest = (node) => {
    if (!(node instanceof HTMLElement)) return;
    const toasts = node.classList.contains('toast')
      ? [node]
      : [...node.querySelectorAll('.toast')];
    for (const el of toasts) {
      if (seen.has(el)) continue;
      seen.add(el);
      const level = el.classList.contains('toast-error') ? 'error'
        : el.classList.contains('toast-success') ? 'success'
        : 'info';
      const msg = el.querySelector('.toast-msg');
      bus.toasts.push({
        at: bus.now(),
        level,
        message: ((msg ? msg.textContent : el.textContent) || '').trim(),
      });
    }
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) harvest(node);
  });
  const observe = () => {
    observer.observe(document.body, { childList: true, subtree: true });
    harvest(document.body);
  };
  if (document.body) observe();
  else document.addEventListener('DOMContentLoaded', observe);

  // --- Etat initial force ---------------------------------------------------
  // Sans cela l'automate passerait tout son budget dans l'overlay d'accueil.
  try {
    localStorage.setItem('tune_onboarding_completed', 'true');
  } catch { /* stockage indisponible */ }
}
