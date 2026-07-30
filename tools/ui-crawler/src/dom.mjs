/**
 * Fonctions executees dans la page via `page.evaluate`.
 *
 * Contrainte : elles sont serialisees puis reevaluees cote navigateur — pas de
 * closure sur le scope Node, pas d'import. Tout ce dont elles ont besoin passe
 * en argument.
 */

/**
 * Recense les controles actionnables de la vue courante et les marque d'un
 * `data-crawl-id` stable, seule identite fiable : les selecteurs CSS de Svelte
 * changent au moindre re-rendu, un index de tableau ne survit pas a un tri.
 */
export function inventory(options) {
  const { scope, skipPatterns, riskyPatterns } = options;
  const root = scope ? document.querySelector(scope) : document.body;
  if (!root) return [];

  const SELECTOR = [
    'button', 'a[href]', '[role="button"]', '[role="tab"]', '[role="switch"]',
    'input:not([type="hidden"])', 'select', 'textarea', '[contenteditable="true"]',
    '[onclick]',
  ].join(',');

  const skipRe = new RegExp(skipPatterns, 'i');
  const riskyRe = new RegExp(riskyPatterns, 'i');
  const out = [];
  let counter = Number(document.body.dataset.crawlCounter || '0');

  // Svelte attache ses gestionnaires par addEventListener : une carte d'album
  // est un `div` sans attribut ni role, invisible pour le selecteur ci-dessus.
  // Le seul indice fiable qu'un element est cliquable est son curseur. On ne
  // garde que le conteneur le plus externe de chaque zone pointee, sinon on
  // recense aussi la pochette et le titre a l'interieur de la meme carte.
  const pointerTargets = [];
  for (const el of root.querySelectorAll('div, li, tr, article, section, figure, span, img')) {
    if (getComputedStyle(el).cursor !== 'pointer') continue;
    const parent = el.parentElement;
    if (parent && getComputedStyle(parent).cursor === 'pointer') continue;
    if (el.closest('button, a[href], [role="button"]')) continue;
    pointerTargets.push(el);
  }

  for (const el of [...root.querySelectorAll(SELECTOR), ...pointerTargets]) {
    // Un controle invisible ou hors ecran n'est pas actionnable par un humain.
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const visible = rect.width > 0 && rect.height > 0 &&
      style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
    if (!visible) continue;
    if (el.disabled) continue;
    // Le conteneur de toasts et la barre de lecture sont du chrome permanent :
    // les recenser dans chaque vue produirait le meme bruit partout.
    if (el.closest('.toast')) continue;
    // Les entrees de menu sont pilotees par la boucle de vues, pas par
    // l'exploration : les recliquer ferait deriver l'automate hors de la vue.
    if (el.classList.contains('nav-item') || el.classList.contains('bottom-tab')) continue;

    if (!el.dataset.crawlId) el.dataset.crawlId = 'c' + (++counter);

    const label = (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('placeholder') ||
      (el.textContent || '').trim() ||
      el.getAttribute('name') ||
      ''
    ).replace(/\s+/g, ' ').slice(0, 80);

    const tag = el.tagName.toLowerCase();
    const type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : null;
    const href = tag === 'a' ? el.getAttribute('href') : null;
    // Un lien qui sort du site emmene l'automate hors de l'application.
    const external = href
      ? /^(https?:)?\/\//i.test(href) && !href.includes(location.host)
      : false;
    const newTab = el.getAttribute('target') === '_blank';

    // « mettre à jour » doit correspondre au motif « mettre a jour » : sans
    // depouiller les accents, la liste d'exclusion laisserait passer l'action.
    const haystack = [label, el.className || '', el.id || '', href || '']
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const risk = skipRe.test(haystack) ? 'skip' : riskyRe.test(haystack) ? 'risky' : 'safe';

    out.push({
      crawlId: el.dataset.crawlId,
      tag, type, href, label,
      // Le chrome (menu, barre de lecture, en-tete) est identique partout : il
      // ne se teste qu'une fois, sinon il consomme le budget de chaque vue.
      region: el.closest('.main-content') ? 'main' : 'chrome',
      external: external || newTab,
      risk,
      kind: tag === 'input' || tag === 'textarea' ? 'input'
        : tag === 'select' ? 'select'
        : 'click',
      // Contexte de rendu : sert a decrire la reproduction dans l'issue.
      path: cssPath(el),
      // Un bouton-icone n'a ni texte ni aria-label : sans son rang parmi ses
      // freres, l'issue dirait « cliquer sur button.star-btn », ce qui
      // n'indique pas quelle etoile a ete cliquee.
      position: el.parentElement
        ? [...el.parentElement.children].filter((c) => c.tagName === el.tagName).indexOf(el) + 1
        : 0,
      container: el.parentElement
        ? (typeof el.parentElement.className === 'string' ? el.parentElement.className : '')
            .split(/\s+/).filter((c) => c && !c.startsWith('svelte-'))[0] || ''
        : '',
    });
  }
  document.body.dataset.crawlCounter = String(counter);
  return out;

  function cssPath(el) {
    const parts = [];
    let node = el;
    for (let depth = 0; node && node.nodeType === 1 && depth < 4; depth++) {
      let part = node.tagName.toLowerCase();
      const cls = (typeof node.className === 'string' ? node.className : '')
        .split(/\s+/).filter((c) => c && !c.startsWith('s-') && !c.startsWith('svelte-'))[0];
      if (cls) part += '.' + cls;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
}

/**
 * Empreinte de l'etat visible. Comparee avant/apres une action pour repondre a
 * « ce clic a-t-il produit quoi que ce soit ? ».
 */
export function snapshotState() {
  const main = document.querySelector('.main-content') || document.body;
  const text = (main.innerText || '').replace(/\s+/g, ' ').trim();

  const digest = (value) => {
    let h = 0;
    for (let i = 0; i < value.length; i++) h = ((h << 5) - h + value.charCodeAt(i)) | 0;
    return h;
  };

  // Deux empreintes : la vue, et la page entiere. Un repli de menu lateral ou
  // un changement dans la barre de lecture ne touchent pas la premiere — sans
  // la seconde, ces actions passeraient pour sans effet.
  const hash = digest(text);
  const pageHash = digest((document.body.innerText || '').replace(/\s+/g, ' ').trim());

  const overlay = findOverlay();

  return {
    hash,
    pageHash,
    length: text.length,
    location: location.hash || location.pathname,
    modalOpen: !!overlay,
    modalTitle: overlay ? overlayTitle(overlay) : '',
    scrollWidth: document.scrollingElement.scrollWidth,
    innerWidth: window.innerWidth,
  };

  /**
   * Reperage d'une couche par-dessus la vue, sans liste de classes : chaque
   * composant de Tune nomme la sienne autrement (`modal-overlay`, `sp-overlay`,
   * `wiz-backdrop`, `profile-picker-overlay`…), une enumeration serait
   * perpetuellement en retard. On part de ce qui est reellement affiche au
   * centre de l'ecran et on remonte jusqu'a un conteneur flottant.
   */
  function findOverlay() {
    const cx = Math.round(window.innerWidth / 2);
    const cy = Math.round(window.innerHeight / 2);
    for (const el of document.elementsFromPoint(cx, cy)) {
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.position !== 'fixed' && style.position !== 'absolute') continue;
        const z = Number(style.zIndex) || 0;
        const rect = node.getBoundingClientRect();
        const coverage = (rect.width * rect.height) / (window.innerWidth * window.innerHeight);
        const named = /modal|overlay|backdrop|dialog|sheet|popup|picker|wizard|drawer|lightbox/i
          .test(typeof node.className === 'string' ? node.className : '');
        const isDialog = node.getAttribute('role') === 'dialog' || node.tagName === 'DIALOG';
        if (isDialog || ((named || z >= 10) && coverage > 0.12)) {
          node.dataset.crawlOverlay = '1';
          return node;
        }
      }
    }
    // Nettoyer un marquage devenu obsolete : l'etat « modale ouverte » doit
    // retomber a faux des qu'elle est fermee.
    for (const stale of document.querySelectorAll('[data-crawl-overlay]')) {
      delete stale.dataset.crawlOverlay;
    }
    return null;
  }

  function overlayTitle(node) {
    const heading = node.querySelector('h1,h2,h3,.modal-title,[class*="title"]');
    const label = heading ? heading.textContent : node.getAttribute('aria-label');
    return (label || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  }
}

/**
 * Defauts observables sans rien cliquer : ils se voient a l'oeil nu sur la vue
 * et n'ont pas besoin d'etre correles a une action.
 */
export function passiveScan(options) {
  const { i18nNamespaces } = options;
  const findings = [];
  const main = document.querySelector('.main-content') || document.body;

  // 1. Cles de traduction affichees brutes : `library.ratingError` au lieu du
  //    texte traduit. Signe d'une cle absente du fichier de locale.
  const keyRe = new RegExp('^(' + i18nNamespaces.join('|') + ')\\.[A-Za-z0-9_.]+$');
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const seenKeys = new Set();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue || '').trim();
    if (!text || text.length > 60 || /\s/.test(text)) continue;
    if (!keyRe.test(text) || seenKeys.has(text)) continue;
    seenKeys.add(text);
    findings.push({
      category: 'i18n-key-visible',
      severity: 'medium',
      detail: text,
      snippet: outer(node.parentElement),
    });
  }

  // 2. Images cassees (pochettes manquantes, chemins d'artwork invalides).
  const brokenSrcs = new Set();
  for (const img of main.querySelectorAll('img')) {
    if (!img.complete || img.naturalWidth > 0) continue;
    const src = img.currentSrc || img.src;
    if (!src || brokenSrcs.has(src)) continue;
    brokenSrcs.add(src);
    findings.push({
      category: 'broken-image',
      severity: 'low',
      detail: src,
      snippet: outer(img),
    });
  }

  // 3. Debordement horizontal : la page se met a scroller lateralement, ce qui
  //    casse la mise en page sur ecran etroit.
  const doc = document.scrollingElement;
  if (doc.scrollWidth > window.innerWidth + 2) {
    const culprit = [...main.querySelectorAll('*')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.right > window.innerWidth + 2)
      .sort((a, b) => b.r.right - a.r.right)[0];
    findings.push({
      category: 'horizontal-overflow',
      severity: 'low',
      detail: `scrollWidth=${doc.scrollWidth} > viewport=${window.innerWidth}`,
      snippet: culprit ? outer(culprit.el) : '',
    });
  }

  // 4. Vue vide ou bloquee sur un indicateur de chargement.
  const visibleText = (main.innerText || '').trim();
  const spinner = main.querySelector('.spinner, .loading, [class*="skeleton"]');
  if (visibleText.length < 3 && !main.querySelector('img, canvas, svg')) {
    findings.push({ category: 'empty-view', severity: 'high', detail: 'vue sans contenu visible', snippet: outer(main).slice(0, 400) });
  } else if (spinner && visibleText.length < 40) {
    findings.push({ category: 'stuck-loading', severity: 'high', detail: 'indicateur de chargement toujours actif', snippet: outer(spinner) });
  }

  return findings;

  function outer(el) {
    if (!el) return '';
    return (el.outerHTML || '').replace(/\s+/g, ' ').slice(0, 300);
  }
}

/**
 * Point ou cliquer un conteneur cliquable, en coordonnees de page.
 *
 * Playwright vise le centre de l'element. Sur une carte d'album, le centre est
 * la pochette — que recouvre au survol une pastille « lecture » qui arrete la
 * propagation : le clic lance l'album au lieu d'ouvrir sa fiche, et
 * l'exploration n'atteint jamais l'ecran de detail. On cherche donc un point
 * qui appartienne au conteneur et a aucun bouton interne.
 *
 * Renvoie `null` quand le centre convient — le cas courant.
 */
export function safeClickPoint(crawlId) {
  const el = document.querySelector(`[data-crawl-id="${crawlId}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();

  const blockers = [...el.querySelectorAll('button, a[href], [role="button"], input, select')]
    .map((child) => child.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  if (!blockers.length) return null;

  const covered = (x, y) => blockers.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
  const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  if (!covered(centre.x, centre.y)) return null;

  // Balayer l'element de bas en haut : le texte (titre, artiste) se trouve
  // presque toujours sous la vignette, la ou aucun bouton ne s'interpose.
  for (let dy = rect.height - 4; dy > 0; dy -= Math.max(4, rect.height / 20)) {
    for (const fx of [0.5, 0.15, 0.85]) {
      const x = rect.left + rect.width * fx;
      const y = rect.top + dy;
      if (!covered(x, y)) return { x: Math.round(x - rect.left), y: Math.round(y - rect.top) };
    }
  }
  return null;
}

/** Etat courant de la vue : sert d'entete de contexte dans les issues. */
export function describeView() {
  const active = document.querySelector('.nav-item.active');
  const heading = document.querySelector('.main-content h1, .main-content h2, .view-title');
  return {
    hash: location.hash,
    nav: active ? (active.textContent || '').trim().slice(0, 40) : '',
    heading: heading ? (heading.textContent || '').trim().slice(0, 60) : '',
  };
}

/**
 * Ferme la couche ouverte, pour repartir d'un etat propre.
 *
 * Trois tentatives, de la plus propre a la plus brutale : le bouton de
 * fermeture de la couche, puis son fond, puis le premier bouton qui ressemble
 * a une annulation. Echap est tente par l'appelant avant d'arriver ici.
 */
export function dismissOverlays() {
  const overlay = document.querySelector('[data-crawl-overlay]');
  const scope = overlay || document;

  const closeButton = [...scope.querySelectorAll('button, [role="button"]')].find((el) => {
    const label = `${el.getAttribute('aria-label') || ''} ${el.className || ''} ${(el.textContent || '').trim()}`;
    return /close|fermer|annuler|cancel|retour|^[×✕✖x]$/i.test(label);
  });
  if (closeButton) { closeButton.click(); return 'bouton'; }

  if (overlay) {
    // Beaucoup de couches se ferment en cliquant leur fond : viser un coin, la
    // ou le contenu de la boite ne s'etend pas.
    overlay.click();
    return 'fond';
  }
  return 'aucun';
}
