/**
 * LES FLÈCHES PRÉCÉDENT / SUIVANT DE L'INTERFACE — web#3275 (alec_eiffel,
 * forum, fil 2953).
 *
 * « Revenir plusieurs écrans en arrière, et retrouver chaque écran COMME IL
 * ÉTAIT » : filtres, tri, onglet, sections dépliées, défilement.
 *
 * ## Pas de second historique
 *
 * La coquille v2 écrit déjà UNE entrée du navigateur par navigation interne
 * (`historiqueCoquille.ts`, #828) et repose la vue au `popstate`. Les flèches
 * de l'en-tête appellent donc `history.back()` / `history.forward()`, comme les
 * boutons du navigateur : un seul historique, une seule vérité, et les deux
 * jeux de boutons ne peuvent pas diverger. Un historique parallèle aurait dû
 * rester synchronisé avec celui du navigateur à chaque geste — c'est la classe
 * de défaut qu'on évite à trois jours d'un gel.
 *
 * Ce module n'ajoute que ce qui manquait :
 *
 *   1. un RANG et un IDENTIFIANT par entrée (posés par `historiqueCoquille`),
 *      pour savoir s'il y a quelque chose avant / après dans la session — les
 *      flèches se grisent aux extrémités ;
 *   2. une MÉMOIRE par entrée : le défilement des conteneurs de l'écran et
 *      l'état sérialisable que l'écran expose (`memoireEcran`). Elle est
 *      remplie au moment où l'on QUITTE l'entrée, et relue quand on y revient
 *      par Précédent / Suivant — jamais sur une arrivée délibérée (barre
 *      latérale, lien), qui repart de la racine (#3843).
 *
 * ## Ce que la mémoire ne fait JAMAIS
 *
 * Elle ne rejoue aucun geste : elle repose des valeurs (un filtre, un onglet,
 * une position). Lecture, suppression, ajout à la file ne passent pas par
 * elle — un retour ne relance rien.
 */
import { writable, get } from 'svelte/store';

/* ------------------------------------------------------------------ */
/* RANG DE L'ENTRÉE COURANTE — les flèches grisées aux extrémités       */
/* ------------------------------------------------------------------ */

/** Vrai s'il existe une entrée de Tune AVANT l'entrée courante. */
export const peutReculer = writable(false);
/** Vrai s'il existe une entrée de Tune APRÈS l'entrée courante (dans la session). */
export const peutAvancer = writable(false);

const CLE_RANG_MAX = 'tune.nav.rangMax';
let rangCourant = 0;
let rangMax = 0;

function lireRangMax(): number {
  try {
    const v = Number(globalThis.sessionStorage?.getItem(CLE_RANG_MAX));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}
function ecrireRangMax(v: number): void {
  try { globalThis.sessionStorage?.setItem(CLE_RANG_MAX, String(v)); } catch { /* navigation privée */ }
}

function publier(): void {
  peutReculer.set(rangCourant > 0);
  peutAvancer.set(rangCourant < rangMax);
}

/**
 * L'entrée de DÉMARRAGE (montage de la coquille) : son rang est celui que
 * porte déjà l'entrée (rechargement en cours de session), 0 sinon. Le rang
 * maximal survit au rechargement par `sessionStorage` — les entrées suivantes
 * du navigateur, elles, y survivent aussi — mais seulement si l'entrée de
 * démarrage était déjà l'une des nôtres.
 */
export function demarrerAuRang(rang: number, entreeDeTune = true): void {
  rangCourant = Math.max(0, Math.floor(rang));
  // Une entrée qui n'était pas à nous (adresse tapée, lien) ouvre une session
  // neuve : le rang maximal d'avant ne décrit plus rien.
  rangMax = entreeDeTune ? Math.max(rangCourant, lireRangMax()) : rangCourant;
  ecrireRangMax(rangMax);
  publier();
}

/** Une entrée EMPILÉE au rang `rang` : tout ce qui suivait est oublié. */
export function empilerAuRang(rang: number): void {
  rangCourant = rang;
  rangMax = rang;
  ecrireRangMax(rangMax);
  publier();
}

/** Une entrée ATTEINTE par Précédent / Suivant. */
export function atteindreLeRang(rang: number): void {
  rangCourant = Math.max(0, Math.floor(rang));
  if (rangCourant > rangMax) { rangMax = rangCourant; ecrireRangMax(rangMax); }
  publier();
}

/**
 * Une entrée qui n'est PAS à nous (`popstate` sans état : une ancre, une
 * page d'avant Tune). On ne sait plus ce qu'il y a de part et d'autre : les
 * deux flèches s'éteignent plutôt que de promettre une entrée de Tune.
 */
export function atteindreEntreeEtrangere(): void {
  rangCourant = 0;
  rangMax = 0;
  peutReculer.set(false);
  peutAvancer.set(false);
}

/**
 * La page est quittée (lien vers un autre site, onglet fermé). Si l'on y
 * revient, les entrées qui suivaient la courante ont pu être remplacées par
 * le site externe : le rang maximal retenu redescend au rang courant. Au pire,
 * Suivant reste éteint alors qu'une entrée de Tune existe encore — jamais
 * l'inverse (une flèche allumée qui mènerait hors de Tune).
 */
export function quitterLaPage(): void {
  rangMax = rangCourant;
  ecrireRangMax(rangMax);
  publier();
}

/** Remise à zéro — tests uniquement. */
export function _reinitialiserRangs(): void {
  rangCourant = 0;
  rangMax = 0;
  ecrireRangMax(0);
  publier();
}

let compteurEntrees = 0;
/** L'identifiant d'une entrée neuve. Une chaîne : `history.state` refuse les proxies. */
export function nouvelleEntree(): string {
  compteurEntrees += 1;
  return `${Date.now().toString(36)}.${compteurEntrees}`;
}

/* ------------------------------------------------------------------ */
/* LES FLÈCHES ET LEURS RACCOURCIS                                      */
/* ------------------------------------------------------------------ */

export type Sens = 'reculer' | 'avancer';

/** Le geste des flèches : celui du navigateur, rien de plus. */
export function naviguer(sens: Sens, historique: Pick<History, 'back' | 'forward'> | undefined =
  typeof window !== 'undefined' ? window.history : undefined): boolean {
  if (!historique) return false;
  if (sens === 'reculer') {
    if (!get(peutReculer)) return false;
    historique.back();
  } else {
    if (!get(peutAvancer)) return false;
    historique.forward();
  }
  return true;
}

const ROLES_DE_SAISIE = new Set(['textbox', 'searchbox', 'combobox', 'slider', 'spinbutton']);

/** Vrai si la frappe vise un champ : Alt+← y déplace le curseur, il n'y navigue pas. */
export function estChampDeSaisie(cible: EventTarget | null | undefined): boolean {
  const el = cible as HTMLElement | null;
  if (!el || typeof el !== 'object') return false;
  const tag = String(el.tagName ?? '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
  return !!role && ROLES_DE_SAISIE.has(role);
}

/**
 * Une fenêtre modale, un dialogue ou un menu est ouvert : les raccourcis ne
 * naviguent pas derrière lui. Les écrans de Tune ne montent ces éléments que
 * lorsqu'ils sont ouverts (`{#if}`) ; plusieurs dialogues n'ont pas
 * `aria-modal` (assistant d'import, sélecteur d'émoji), d'où les rôles.
 */
const SELECTEUR_MODALES = '[aria-modal="true"], dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"]';
export function modaleOuverte(doc: Pick<Document, 'querySelectorAll'> | undefined =
  typeof document !== 'undefined' ? document : undefined): boolean {
  if (!doc) return false;
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(SELECTEUR_MODALES))) {
    if (el.closest('[hidden], [aria-hidden="true"], [inert]')) continue;
    if (el.tagName === 'DIALOG' && !(el as HTMLDialogElement).open) continue;
    return true;
  }
  return false;
}

/**
 * L'élément focalisé déclare SON usage d'Alt+flèche (`aria-keyshortcuts`) :
 * l'ordre des étiquettes (`EtiquettesV2`), l'ordre des colonnes
 * (`ListePistesV2`). Il garde la touche. Nos propres flèches exceptées.
 */
export function declareAltFleche(cible: EventTarget | null | undefined): boolean {
  const el = cible as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  const porteur = el.closest('[aria-keyshortcuts*="Alt+Arrow"]');
  return !!porteur && !porteur.hasAttribute('data-fleche-nav');
}

/**
 * Le sens d'un raccourci clavier, ou `null` s'il n'en est pas un.
 *
 * - Alt+← / Alt+→ (Windows, Linux — et Mac) ;
 * - Cmd+[ / Cmd+] (Mac, l'usage de Safari et du Finder). La touche est lue
 *   par son CARACTÈRE ou par sa position QWERTY : le crochet de l'AZERTY Mac
 *   demande Option+Maj, `e.key` ne le donnerait jamais avec Cmd seul.
 *
 * Jamais dans un champ de saisie, jamais sous une modale, jamais pendant une
 * composition (saisie IME).
 */
export function sensDuRaccourci(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target' | 'defaultPrevented' | 'isComposing'>,
  doc?: Pick<Document, 'querySelectorAll'>,
): Sens | null {
  if (e.defaultPrevented || e.isComposing) return null;
  let sens: Sens | null = null;
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    if (e.key === 'ArrowLeft' || e.code === 'ArrowLeft') sens = 'reculer';
    else if (e.key === 'ArrowRight' || e.code === 'ArrowRight') sens = 'avancer';
  } else if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    if (e.key === '[' || e.code === 'BracketLeft') sens = 'reculer';
    else if (e.key === ']' || e.code === 'BracketRight') sens = 'avancer';
  }
  if (!sens) return null;
  if (estChampDeSaisie(e.target)) return null;
  if (e.altKey && declareAltFleche(e.target)) return null;
  if (modaleOuverte(doc ?? (typeof document !== 'undefined' ? document : undefined))) return null;
  return sens;
}

/**
 * Brancher les raccourcis. En phase de BOUILLONNEMENT, sur `window` : tout
 * composant qui consomme Alt+flèche (`preventDefault`) passe avant et garde
 * la touche — l'ordre des étiquettes, enregistré sur le serveur, et celui des
 * colonnes ne doivent pas faire reculer l'écran en plus. Les raccourcis de
 * lecture (`keyboard.ts`) laissent Alt+flèche à la navigation
 * (`flecheDeLecture`), quel que soit l'ordre des écouteurs.
 *
 * Le défaut du navigateur est empêché même à l'extrémité : Alt+← sur la
 * première entrée quitterait Tune (#828), alors que la flèche est grisée.
 */
export function brancherRaccourcisNavigation(
  fenetre: Pick<Window, 'addEventListener' | 'removeEventListener'> & { history: Pick<History, 'back' | 'forward'> }
    | undefined = typeof window !== 'undefined' ? window : undefined,
): () => void {
  if (!fenetre) return () => {};
  const surTouche = (e: KeyboardEvent) => {
    const sens = sensDuRaccourci(e);
    if (!sens) return;
    e.preventDefault();
    naviguer(sens, fenetre.history);
  };
  // Quitter la page : le rang maximal redescend (voir `quitterLaPage`).
  const surDepart = () => quitterLaPage();
  fenetre.addEventListener('keydown', surTouche as EventListener);
  fenetre.addEventListener('pagehide', surDepart as EventListener);
  return () => {
    fenetre.removeEventListener('keydown', surTouche as EventListener);
    fenetre.removeEventListener('pagehide', surDepart as EventListener);
  };
}

/* ------------------------------------------------------------------ */
/* LA MÉMOIRE PAR ENTRÉE                                               */
/* ------------------------------------------------------------------ */

/** Un conteneur défilé : retrouvé par son sélecteur et son rang parmi ses semblables. */
export interface Defilement { sel: string; i: number; top: number }

interface MemoireEntree {
  vue: string;
  ecran?: unknown;
  defilements: Defilement[];
}

/** Au-delà, les entrées les plus anciennes sont oubliées (une session très longue). */
const LIMITE_ENTREES = 200;
const memoire = new Map<string, MemoireEntree>();

/** L'écran monté de chaque vue, qui sait dire son état. */
const capteurs = new Map<string, () => unknown>();

/**
 * Les vues qui reposent DÉJÀ leur défilement elles-mêmes au retour (fil 2694 :
 * `StreamingV2`, `PageWidgets`), et celles dont la position suit la lecture
 * (la file, « Lecture en cours ») : la mémoire générique ne s'en mêle pas.
 */
// Relecture de #3278 — et celles qui en tiennent un à elles : l'annuaire des
// Radios (`RadiosV2`, contexte de vue) et la messagerie du Cercle, qui se
// cale en bas sur le dernier message (`MessagerieCercleV2`).
const VUES_SANS_DEFILEMENT: ReadonlySet<string> = new Set([
  'streaming', 'home', 'tableaudebord', 'queue', 'nowplaying', 'tv', 'radios', 'circle',
]);

/**
 * LES CONTENEURS QUI ONT DÉFILÉ, suivis au fil de l'eau (relecture de #3278).
 *
 * Parcourir tout l'écran (`querySelectorAll('*')` et un `scrollTop` par nœud)
 * à chaque navigation coûtait un passage sur des milliers de nœuds — une
 * grille d'albums, une liste de pistes. Un seul écouteur `scroll` en CAPTURE
 * sur le document entend tous les conteneurs (l'événement ne bouillonne pas,
 * la capture le voit) : la mesure ne lit plus que ceux qui ont bougé.
 */
const defiles = new Set<Element>();
let suiviBranche = 0;
const surDefilement = (e: Event) => {
  const el = e.target;
  if (el && (el as Element).nodeType === 1) defiles.add(el as Element);
};
export function suivreLesDefilements(doc: Pick<Document, 'addEventListener' | 'removeEventListener'> | undefined =
  typeof document !== 'undefined' ? document : undefined): () => void {
  if (!doc) return () => {};
  if (suiviBranche++ === 0) doc.addEventListener('scroll', surDefilement, { capture: true, passive: true });
  let arrete = false;
  return () => {
    if (arrete) return;
    arrete = true;
    if (--suiviBranche === 0) {
      doc.removeEventListener('scroll', surDefilement, { capture: true } as EventListenerOptions);
      defiles.clear();
    }
  };
}

/** La racine où chercher les conteneurs défilés : la zone des écrans de la coquille. */
let racineParDefaut: () => ParentNode | null = () =>
  typeof document !== 'undefined' ? document.querySelector('.v2-shell main.main') : null;

/** Tests : désigner la racine des écrans. */
export function _poserRacine(f: () => ParentNode | null): void { racineParDefaut = f; }

function selecteurDe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList ?? [])
    .filter((c) => /^[A-Za-z_][\w-]*$/.test(c))
    .map((c) => `.${c}`)
    .join('');
  return `${tag}${classes}`;
}

/** Les conteneurs défilés verticalement sous `racine`, au plus douze. */
export function mesurerDefilements(racine: ParentNode | null = racineParDefaut()): Defilement[] {
  if (!racine || typeof (racine as ParentNode).querySelectorAll !== 'function') return [];
  const sortie: Defilement[] = [];
  for (const el of Array.from(defiles) as HTMLElement[]) {
    // Démonté avec son écran : il ne reviendra pas, on l'oublie.
    if (!el.isConnected) { defiles.delete(el); continue; }
    if (sortie.length >= 12) break;
    if (!(racine as Node).contains?.(el)) continue;
    const top = el.scrollTop;
    if (!(top > 0)) continue;
    const sel = selecteurDe(el);
    let freres: NodeListOf<Element>;
    try { freres = racine.querySelectorAll(sel); } catch { continue; }
    const i = Array.prototype.indexOf.call(freres, el);
    if (i < 0) continue;
    sortie.push({ sel, i, top: Math.round(top) });
  }
  return sortie;
}

/**
 * Retenir l'entrée qu'on QUITTE : appelé par la coquille juste avant d'en
 * empiler une autre ou au `popstate`, quand l'écran quitté est encore à
 * l'écran (le DOM ne change qu'au tour suivant).
 */
export function retenirEntree(ent: string | null | undefined, vue: string | null | undefined): void {
  if (!ent || !vue) return;
  const avant = memoire.get(ent);
  const capteur = capteurs.get(vue);
  let ecran: unknown = avant?.vue === vue ? avant.ecran : undefined;
  // Pas de capteur : l'écran n'est pas (encore) remonté — deux Précédent
  // d'affilée. Ce qu'on savait de l'entrée reste vrai, on le garde.
  if (capteur) {
    try { ecran = capteur(); } catch { /* on garde l'ancien */ }
  }
  // Même règle pour le défilement : tant que sa reprise n'est pas finie, le
  // DOM ne dit pas encore la position de cette entrée.
  const defilements = VUES_SANS_DEFILEMENT.has(vue) ? []
    : ent === entEnRestauration && avant ? avant.defilements : mesurerDefilements();
  memoire.delete(ent);
  memoire.set(ent, { vue, ecran, defilements });
  while (memoire.size > LIMITE_ENTREES) {
    const plusAncienne = memoire.keys().next().value as string;
    memoire.delete(plusAncienne);
  }
}

/** Ce qui a été retenu pour une entrée. */
export function memoireDe(ent: string | null | undefined): Readonly<MemoireEntree> | null {
  return ent ? memoire.get(ent) ?? null : null;
}

/**
 * L'entrée atteinte par Précédent / Suivant dont l'écran va être REMONTÉ (la
 * vue a changé). Consommée par le premier `memoireEcran` de cette vue, ou
 * effacée par la navigation suivante.
 */
let aReprendre: { ent: string; vue: string } | null = null;

/** Appelé par la coquille au `popstate`, AVANT de reposer la vue. */
export function arriverParHistorique(ent: string | null | undefined, vue: string, vueQuittee: string | null): void {
  aReprendre = ent && vue !== vueQuittee ? { ent, vue } : null;
}

/** Appelé par la coquille sur toute écriture qui n'est pas un retour. */
export function arriverParGeste(): void {
  aReprendre = null;
}

/**
 * L'API des ÉCRANS : déclarer de quoi l'écran est fait, et le reprendre.
 *
 * À appeler à l'initialisation du composant. `capturer` rend un objet SIMPLE
 * (passez-le par `$state.snapshot`) : il est relu plus tard, l'écran démonté.
 * `reprise` vaut ce qui a été retenu quand l'écran est remonté par
 * Précédent / Suivant sur une entrée qu'il avait quittée, `null` sinon.
 * `arreter` se pose dans le démontage (`$effect(() => m.arreter)`).
 */
export function memoireEcran<T>(vue: string, capturer: () => T | null): { reprise: T | null; arreter: () => void } {
  capteurs.set(vue, capturer);
  let reprise: T | null = null;
  const r = aReprendre;
  if (r && r.vue === vue) {
    aReprendre = null;
    const m = memoire.get(r.ent);
    if (m && m.vue === vue && m.ecran != null) reprise = m.ecran as T;
  }
  return {
    reprise,
    arreter: () => { if (capteurs.get(vue) === capturer) capteurs.delete(vue); },
  };
}

/* ------------------------------------------------------------------ */
/* REPOSER LE DÉFILEMENT                                                */
/* ------------------------------------------------------------------ */

export interface OptionsRestauration {
  racine?: () => ParentNode | null;
  programmer?: (cb: () => void, ms: number) => unknown;
  maintenant?: () => number;
  fenetre?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

/** Durée pendant laquelle on attend que le contenu soit assez haut. */
const DELAI_MAX = 2500;
/** Après la pose, on la tient encore un instant : un écran qui remonte en tête au chargement la perdrait. */
const DELAI_TENUE = 400;
const PAS = 50;
let jetonRestauration = 0;
/** L'entrée dont le défilement est en train d'être reposé. */
let entEnRestauration: string | null = null;
/**
 * Arrêter TOUT DE SUITE la reprise en cours : écouteurs de gestes retirés,
 * passe programmée oubliée. Sans lui, une reprise annulée tournait encore une
 * passe — et, coquille débranchée, touchait une fenêtre qui n'était plus là.
 */
let arreterLaReprise: (() => void) | null = null;

/**
 * Reposer les positions retenues pour `ent`. L'écran remonté charge ses
 * données APRÈS son montage : on attend que chaque conteneur existe et soit
 * assez haut, au plus 2,5 s. Le moindre geste de l'utilisateur (molette,
 * toucher, clic, touche) arrête tout : on ne lui arrache jamais la main.
 */
export function restaurerDefilements(ent: string | null | undefined, options: OptionsRestauration = {}): void {
  arreterLaReprise?.();
  const jeton = ++jetonRestauration;
  entEnRestauration = null;
  const m = ent ? memoire.get(ent) : null;
  if (!ent || !m || m.defilements.length === 0) return;
  entEnRestauration = ent;
  const racine = options.racine ?? racineParDefaut;
  // La minuterie par défaut se retire à l'arrêt ; un `programmer` injecté
  // (tests) voit sa passe rendre la main d'elle-même (`arrete`).
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const programmer = options.programmer ?? ((cb: () => void, ms: number) => { minuterie = setTimeout(cb, ms); });
  const maintenant = options.maintenant ?? (() => Date.now());
  const fenetre = options.fenetre ?? (typeof window !== 'undefined' ? window : undefined);
  const debut = maintenant();
  const poses = new Map<number, number>();
  let arrete = false;
  const GESTES = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
  const arreter = () => {
    if (arrete) return;
    arrete = true;
    if (minuterie !== undefined) { clearTimeout(minuterie); minuterie = undefined; }
    if (arreterLaReprise === arreter) arreterLaReprise = null;
    if (jeton === jetonRestauration) entEnRestauration = null;
    for (const g of GESTES) fenetre?.removeEventListener(g, arreter, true);
  };
  arreterLaReprise = arreter;
  for (const g of GESTES) fenetre?.addEventListener(g, arreter, { capture: true, passive: true } as AddEventListenerOptions);

  const passe = () => {
    minuterie = undefined;
    if (arrete) return;
    if (jeton !== jetonRestauration) { arreter(); return; }
    const t = maintenant();
    const r = racine();
    const fin = t - debut >= DELAI_MAX;
    let enCours = false;
    m.defilements.forEach((d, k) => {
      let el: HTMLElement | undefined;
      try { el = r?.querySelectorAll<HTMLElement>(d.sel)[d.i]; } catch { el = undefined; }
      const pose = poses.get(k);
      if (pose == null) {
        if (el && (el.scrollHeight - el.clientHeight >= d.top - 1 || fin)) {
          el.scrollTop = d.top;
          poses.set(k, t);
          enCours = true;
        } else if (!fin) enCours = true;
      } else if (t - pose < DELAI_TENUE) {
        if (el && Math.abs(el.scrollTop - d.top) > 1 && el.scrollHeight - el.clientHeight >= d.top - 1) el.scrollTop = d.top;
        enCours = true;
      }
    });
    if (enCours && !fin) programmer(passe, PAS);
    else arreter();
  };
  programmer(passe, 0);
}

/**
 * L'écran remet LUI-MÊME son défilement (la liste des pistes repart en tête
 * après un tri ou une recherche) : la reprise en cours s'efface, elle ne
 * doit pas le contredire.
 */
export function annulerRestaurationDefilement(): void {
  jetonRestauration++;
  entEnRestauration = null;
  arreterLaReprise?.();
}

/** Tests : tout oublier. */
export function _reinitialiserMemoire(): void {
  memoire.clear();
  capteurs.clear();
  aReprendre = null;
  entEnRestauration = null;
  defiles.clear();
  jetonRestauration++;
  arreterLaReprise?.();
}
