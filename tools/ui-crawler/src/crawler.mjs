/**
 * Moteur d'exploration.
 *
 * Principe : l'automate ne connait aucun selecteur de l'application. Il entre
 * dans une vue, recense ce qui est actionnable, agit, observe, puis revient a
 * l'etat precedent. Les ecrans profonds (fiche album, modale d'edition) sont
 * atteints par recursion : un clic qui change l'ecran ouvre un nouvel etat a
 * explorer avant de revenir en arriere.
 *
 * C'est ce qui permet d'atteindre les etoiles de notation sans qu'aucune ligne
 * ne parle de notation.
 */
import { inventory, snapshotState, passiveScan, describeView, dismissOverlays } from './dom.mjs';
import { analyse } from './detect.mjs';
import { hardSkipPattern, RISKY, I18N_NAMESPACES, inputValue } from './config.mjs';

export class Crawler {
  constructor(page, issueLog, options) {
    this.page = page;
    this.issues = issueLog;
    this.opt = options;
    this.actions = 0;
    this.viewsVisited = 0;
    /** Motifs ecartes, avec leur nombre de rencontres. */
    this.skipped = new Map();
    /** Nombre d'actions deja menees sur chaque forme de controle, tout le passage. */
    this.shapeUsage = new Map();
    /** Etats deja explores : evite de re-descendre 36 fois dans la meme fiche. */
    this.exploredStates = new Set();
    /** Empreintes de constats passifs deja vus, pour ne pas les re-signaler. */
    this.knownPassive = new Set();
    /** Le chrome (barre de lecture, en-tete, selecteur de zone) ne se teste qu'une fois. */
    this.chromeDone = false;
    /** Plafond d'actions pour la vue courante — voir `run()`. */
    this.viewDeadline = Infinity;
    this.log = options.log || (() => {});
    this.skipPattern = hardSkipPattern({ allowDevices: options.allowDevices });
  }

  /**
   * Actions restantes : le minimum entre le budget global et la part allouee a
   * la vue courante. Sans cette part, les premieres vues consommeraient tout et
   * la moitie de l'application ne serait jamais visitee.
   */
  get budgetLeft() {
    return Math.min(this.opt.maxActions, this.viewDeadline) - this.actions;
  }

  // --------------------------------------------------------------- demarrage

  async boot() {
    await this.page.goto(this.opt.baseUrl, { waitUntil: 'domcontentloaded' });
    // L'application monte de facon asynchrone : attendre le menu, pas le DOM.
    await this.page.waitForSelector('.nav-item, .bottom-tab, main', { timeout: 15000 });
    await this.settle(1200);
    await this.drain(); // les erreurs du chargement initial sont traitees a part
  }

  /** Constats du chargement initial, avant toute interaction. */
  async auditStartup() {
    const signals = await this.drain();
    await this.record({ signals, action: null, trail: ['Charger l\'application'] });
  }

  // ------------------------------------------------------------------ boucle

  async run() {
    const views = await this.discoverViews();
    this.log(`${views.length} destinations detectees dans le menu`);

    for (const [i, view] of views.entries()) {
      if (this.opt.maxActions - this.actions <= 0) { this.log('budget d\'actions epuise'); break; }
      // Repartir ce qui reste sur les vues restantes, avec un plancher pour que
      // les dernieres ne soient pas visitees pour rien.
      const share = Math.floor((this.opt.maxActions - this.actions) / (views.length - i));
      this.viewDeadline = this.actions + Math.max(this.opt.minPerView, share);
      await this.visitView(view);
    }
    this.viewDeadline = Infinity;
    return {
      actions: this.actions,
      views: this.viewsVisited,
      skipped: [...this.skipped.entries()].map(([what, n]) => (n > 1 ? `${what} (×${n})` : what)),
    };
  }

  /** Destinations du menu lateral, dans l'ordre de priorite configure. */
  async discoverViews() {
    const items = await this.page.evaluate(() => {
      const seen = new Set();
      return [...document.querySelectorAll('.nav-item, .bottom-tab')]
        .filter((el) => el.offsetParent !== null)
        .map((el, i) => {
          if (!el.dataset.crawlNav) el.dataset.crawlNav = 'nav' + i;
          return { navId: el.dataset.crawlNav, label: (el.textContent || '').trim().slice(0, 40) };
        })
        .filter((v) => (seen.has(v.label) ? false : (seen.add(v.label), true)));
    });

    const rank = (item) => {
      // Sans depouiller les accents, « Bibliothèque » ne correspondrait a aucun
      // motif de priorite et la vue principale passerait en dernier.
      const label = item.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const idx = this.opt.priorityViews.findIndex((pattern) => new RegExp(pattern, 'i').test(label));
      return idx === -1 ? 99 : idx;
    };
    return items.sort((a, b) => rank(a) - rank(b));
  }

  async visitView(view) {
    const entered = await this.clickNav(view.navId);
    if (!entered) return;
    await this.settle();

    const descriptor = await this.page.evaluate(describeView);
    this.viewsVisited++;
    this.log(`▸ vue « ${view.label} » (${descriptor.hash || 'sans ancre'})`);

    // Le chargement de la vue peut a lui seul echouer.
    const signals = await this.drain();
    const trail = [`Ouvrir « ${view.label} » dans le menu`];
    await this.record({ signals, action: null, trail, view: descriptor });

    await this.exploreState({ depth: 0, trail, view: descriptor, scope: null, home: view });
    this.chromeDone = true;
  }

  /**
   * Explore un etat (vue, sous-ecran ou modale) : recense, agit, observe.
   *
   * @param {object} ctx
   * @param {number} ctx.depth  profondeur de recursion
   * @param {string[]} ctx.trail  chemin humain jusqu'ici, pour la reproduction
   * @param {string|null} ctx.scope  selecteur limitant le recensement (modale)
   * @param {object} ctx.home  destination de menu ou revenir en cas de derive
   */
  async exploreState(ctx) {
    const { depth, scope } = ctx;
    if (this.budgetLeft <= 0 || depth > this.opt.maxDepth) return;

    const stateKey = await this.stateKey();
    if (this.exploredStates.has(stateKey)) return;
    this.exploredStates.add(stateKey);

    await this.auditPassive(ctx);

    const elements = await this.page.evaluate(inventory, {
      scope,
      skipPatterns: this.skipPattern,
      riskyPatterns: RISKY,
    });
    const candidates = this.selectCandidates(elements, depth);

    for (const el of candidates) {
      if (this.budgetLeft <= 0) return;
      // Une action precedente a pu quitter l'etat : verifier avant d'agir.
      if (!(await this.exists(el.crawlId))) continue;
      await this.act(el, ctx);
    }
  }

  /** Consigne un controle ecarte, sans repeter la meme ligne a chaque vue. */
  note(reason) {
    this.skipped.set(reason, (this.skipped.get(reason) || 0) + 1);
  }

  /** Tri et filtrage des controles a actionner dans l'etat courant. */
  selectCandidates(elements, depth) {
    const kept = [];
    for (const el of elements) {
      if (el.region === 'chrome' && this.chromeDone) continue;
      if (el.risk === 'skip') {
        this.note(`« ${el.label || el.path} » — action hors bac a sable`);
        continue;
      }
      if (el.external) {
        this.note(`« ${el.label || el.href} » — lien externe`);
        continue;
      }
      if (el.kind === 'input' && inputValue(el) === null) {
        this.note(`« ${el.label} » — champ ${el.type} non renseignable sans risque`);
        continue;
      }
      kept.push(el);
    }

    // Regrouper par « forme » (meme type, meme place dans l'arbre) : les 30
    // puces de filtre d'une bibliotheque sont une seule fonctionnalite, les 36
    // cartes d'album une autre.
    const shapes = new Map();
    for (const el of kept) {
      const shape = `${el.region}|${el.kind}|${el.path}`;
      if (!shapes.has(shape)) shapes.set(shape, []);
      shapes.get(shape).push(el);
    }

    // Tirage a tour de role plutot que dans l'ordre du DOM : sinon le budget
    // part entierement dans l'en-tete de la vue et l'automate n'atteint jamais
    // la grille d'albums — donc jamais la fiche album, ni sa notation.
    // Le contenu de la vue d'abord, et parmi lui les formes les plus repetees :
    // une grille de 36 cartes est le coeur de l'ecran, un bouton isole de
    // l'en-tete peut attendre le tour suivant si le budget est serre.
    const groups = [...shapes.entries()]
      .sort(([keyA, a], [keyB, b]) => {
        const mainA = keyA.startsWith('main'), mainB = keyB.startsWith('main');
        if (mainA !== mainB) return mainA ? -1 : 1;
        return b.length - a.length;
      })
      .map(([, els]) => els);
    const allowance = depth === 0 ? 3 : 2;
    const picked = [];
    for (let round = 0; round < allowance && picked.length < this.opt.maxPerState; round++) {
      for (const group of groups) {
        if (picked.length >= this.opt.maxPerState) break;
        const el = group[round];
        if (!el) continue;
        // Certains controles (barre de lecture, en-tete de recherche) sont
        // presents dans toutes les vues : sans plafond a l'echelle du passage,
        // ils seraient reactionnes quinze fois pour le meme resultat.
        const shape = `${el.kind}|${el.path}`;
        const used = this.shapeUsage.get(shape) || 0;
        if (used >= this.opt.maxPerShape) {
          this.note(`« ${el.label || el.path} » — deja teste ${used} fois dans ce passage`);
          continue;
        }
        this.shapeUsage.set(shape, used + 1);
        picked.push(el);
      }
    }
    return picked;
  }

  // ------------------------------------------------------------------ action

  async act(el, ctx) {
    const label = el.label || positional(el);
    const step = describeStep(el);
    const trail = [...ctx.trail, step];
    const before = await this.page.evaluate(snapshotState);
    await this.drain(); // repartir d'un journal vide : un signal = cette action

    this.actions++;
    let interactionError = null;
    try {
      await this.perform(el);
    } catch (e) {
      interactionError = e;
    }
    await this.settle();

    const after = await this.page.evaluate(snapshotState);
    const signals = await this.drain();
    const view = await this.page.evaluate(describeView);

    // Un controle toujours present mais qui refuse le clic (recouvert par un
    // autre element, hors ecran, jamais stable) est en soi un defaut : un
    // utilisateur clique dessus sans que rien ne se passe.
    const unclickable = interactionError && (await this.exists(el.crawlId))
      ? interactionError.message.split('\n')[0]
      : null;

    const passive = await this.newPassive(view);
    await this.record({
      signals, passive, before, after, view, trail, unclickable,
      action: { kind: el.kind, label, path: el.path },
    });

    // --- suites : modale ouverte, ou changement d'ecran ---------------------
    const modalOpened = after.modalOpen && !before.modalOpen;
    const navigated = !after.modalOpen &&
      (after.location !== before.location || Math.abs(after.length - before.length) > 120);

    if (modalOpened) {
      await this.exploreState({ ...ctx, depth: ctx.depth + 1, trail, view, scope: '[data-crawl-overlay]' });
      await this.closeModal({ ...ctx, trail, action: { kind: el.kind, label, path: el.path }, view, after });
    } else if (navigated) {
      await this.exploreState({ ...ctx, depth: ctx.depth + 1, trail, view, scope: null });
      await this.goBack(ctx);
    }
  }

  async perform(el) {
    const target = this.page.locator(`[data-crawl-id="${el.crawlId}"]`).first();
    const opts = { timeout: this.opt.actionTimeoutMs };

    if (el.kind === 'select') {
      // Choisir une valeur differente de la valeur courante, sinon `change` ne
      // se declenche pas et l'on ne teste rien.
      const next = await target.evaluate((s) => {
        const other = [...s.options].find((o) => o.value !== s.value && !o.disabled);
        return other ? other.value : null;
      });
      if (next === null) return;
      await target.selectOption(next, opts);
      return;
    }

    if (el.kind === 'input') {
      const value = inputValue(el);
      if (value === 'toggle') {
        await target.click(opts);
        return;
      }
      if (value === 'range') {
        await target.evaluate((input) => {
          const min = Number(input.min || 0), max = Number(input.max || 100);
          input.value = String(Math.round((min + max) / 2));
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        return;
      }
      await target.fill(value, opts);
      // Beaucoup de champs ne declenchent leur enregistrement qu'a Entree ou au
      // blur : sans cela on ne testerait que la saisie, pas la fonction.
      await target.press('Enter', opts).catch(() => {});
      await target.evaluate((input) => input.blur());
      return;
    }

    await target.click(opts);
  }

  // ------------------------------------------------------------- navigation

  async clickNav(navId) {
    try {
      await this.page.locator(`[data-crawl-nav="${navId}"]`).first().click({ timeout: 4000 });
      return true;
    } catch {
      return false;
    }
  }

  async closeModal(ctx) {
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.settle(250);
    let state = await this.page.evaluate(snapshotState);
    if (!state.modalOpen) return;

    await this.page.evaluate(dismissOverlays).catch(() => {});
    await this.settle(250);
    state = await this.page.evaluate(snapshotState);
    if (!state.modalOpen) return;

    // Toujours ouverte : l'utilisateur serait coince.
    await this.record({
      signals: await this.drain(),
      before: ctx.after, after: state, view: ctx.view, trail: ctx.trail,
      action: ctx.action, modalStuck: true,
    });
    // Recharger pour ne pas explorer le reste du site derriere une modale.
    await this.page.goto(this.opt.baseUrl, { waitUntil: 'domcontentloaded' });
    await this.settle(900);
    await this.drain();
  }

  async goBack(ctx) {
    await this.page.goBack({ timeout: 4000 }).catch(() => {});
    await this.settle(300);
    const view = await this.page.evaluate(describeView);
    if (ctx.home && view.hash !== ctx.view?.hash) {
      // L'historique n'a pas ramene au bon endroit : repasser par le menu.
      await this.clickNav(ctx.home.navId);
      await this.settle(300);
    }
    await this.drain();
  }

  // -------------------------------------------------------------- observation

  async settle(ms) {
    await this.page.waitForTimeout(ms ?? this.opt.settleMs);
  }

  async drain() {
    return this.page.evaluate(() => {
      const bus = window.__tuneCrawl;
      if (!bus) return { toasts: [], calls: [], errors: [], warnings: [] };
      return {
        toasts: bus.toasts.splice(0),
        calls: bus.calls.splice(0),
        errors: bus.errors.splice(0),
        warnings: bus.warnings.splice(0),
      };
    });
  }

  async exists(crawlId) {
    return this.page.locator(`[data-crawl-id="${crawlId}"]`).first().isVisible({ timeout: 500 }).catch(() => false);
  }

  async stateKey() {
    const s = await this.page.evaluate(snapshotState);
    return `${s.location}|${s.modalOpen ? s.modalTitle : ''}|${s.hash}`;
  }

  /** Constats passifs de l'etat courant, dedupliques a l'echelle du passage. */
  async newPassive(view) {
    const found = await this.page.evaluate(passiveScan, { i18nNamespaces: I18N_NAMESPACES });
    const fresh = [];
    for (const f of found) {
      const key = `${f.category}|${view.hash}|${f.detail}`;
      if (this.knownPassive.has(key)) continue;
      this.knownPassive.add(key);
      fresh.push(f);
    }
    return fresh;
  }

  async auditPassive(ctx) {
    const view = ctx.view || (await this.page.evaluate(describeView));
    const passive = await this.newPassive(view);
    if (passive.length) {
      await this.record({ signals: emptySignals(), passive, view, trail: ctx.trail, action: null });
    }
  }

  // ------------------------------------------------------------------ rapport

  async record(ctx) {
    const view = ctx.view || (await this.page.evaluate(describeView));
    const findings = analyse({
      action: ctx.action,
      view,
      before: ctx.before,
      after: ctx.after,
      signals: ctx.signals || emptySignals(),
      passive: ctx.passive,
      modalStuck: ctx.modalStuck,
      unclickable: ctx.unclickable,
    });

    for (const finding of findings) {
      const issue = this.issues.record(finding, { view, trail: ctx.trail || [], action: ctx.action });
      if (!issue) continue;
      // Une capture par defaut distinct : la preuve visuelle de l'etat fautif.
      const path = this.issues.screenshotPath(issue.id, issue.title);
      try {
        await this.page.screenshot({ path, animations: 'disabled' });
        issue.screenshot = path;
      } catch { /* page en cours de navigation */ }
      this.log(`  ✗ [${issue.severity}] ${issue.title}`);
    }
  }
}

function emptySignals() {
  return { toasts: [], calls: [], errors: [], warnings: [] };
}

function describeStep(el) {
  const label = el.label || positional(el);
  if (el.kind === 'input') {
    const value = inputValue(el);
    if (value === 'toggle') return `Basculer « ${label} »`;
    if (value === 'range') return `Deplacer le curseur « ${label} » a mi-course`;
    return `Saisir « ${value} » dans « ${label} » puis Entree`;
  }
  if (el.kind === 'select') return `Changer la valeur de la liste « ${label} »`;
  return `Cliquer sur ${el.label ? `« ${label} »` : label}`;
}

/**
 * Description d'un controle sans libelle : « le 3e bouton de "album-stars" »
 * se relit et se retrouve a l'ecran, contrairement a un selecteur CSS.
 */
function positional(el) {
  const rank = el.position > 1 ? `le ${el.position}e` : 'le 1er';
  const kind = el.tag === 'a' ? 'lien' : el.tag === 'div' ? 'element' : 'bouton';
  return el.container
    ? `${rank} ${kind} de « ${el.container} »`
    : `${rank} ${kind} de « ${el.path} »`;
}
