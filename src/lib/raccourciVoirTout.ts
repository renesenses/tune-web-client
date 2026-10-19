/**
 * UN RACCOURCI SUR LA PAGE « VOIR TOUT » D'UN WIDGET — web#2112 (FabienM,
 * rc4, fil 2236 point 12).
 *
 * « Je clique sur "Voir Tout" de la section "Nouveautés de vos artistes". Je
 * crée un raccourci sur cette page, malheureusement le raccourci renvoie sur
 * la page d'accueil. »
 *
 * La page « Voir tout » n'est pas une vue : c'est un état local de
 * `PageWidgets` (#51). `captureCurrentView` ne la voyait donc pas et figeait
 * la seule vue dessous (`home`, ou `streaming` + le service). La page publie
 * désormais une CIBLE de raccourci, comme une fiche d'album ou une playlist :
 *
 *   clé      `voirtout:<page>:<widget>` — `page` est la clé de rangement de la
 *            `PageWidgets` hôte (`home_widgets`, celle d'un service…), qui
 *            distingue l'Accueil, Qobuz, Tidal et le Tableau de bord ;
 *   restore  `{ page, widget }`.
 *
 * 🔴 La DEMANDE est gardée ici, pas seulement diffusée. `navigateToShortcut`
 * envoie `tune:shortcut-restore` 150 ms après le changement de vue ; la page
 * éditoriale d'un service ne monte qu'une fois son catalogue chargé, et un
 * widget de catégorie de playlists n'existe qu'une fois appris (#987). Un
 * évènement manqué ne laisserait que l'Accueil — le défaut d'origine. La page
 * consomme donc la demande quand elle est prête, et une demande trop vieille
 * ne rouvre plus rien.
 */
import { writable } from 'svelte/store';

export const PREFIXE_VOIR_TOUT = 'voirtout:';

export interface CibleVoirTout {
  /** La clé de rangement de la page hôte (`PageWidgets.cle`). */
  page: string;
  /** L'identifiant du widget dont on montre tout. */
  widget: string;
}

/** La clé de cible d'une page « Voir tout ». */
export function cleVoirTout(page: string, widget: string): string {
  return `${PREFIXE_VOIR_TOUT}${page}:${widget}`;
}

export function estCibleVoirTout(cle: unknown): cle is string {
  return typeof cle === 'string' && cle.startsWith(PREFIXE_VOIR_TOUT);
}

/** La cible portée par un `restore` de raccourci, ou `null` s'il est abîmé. */
export function cibleVoirTout(restore: unknown): CibleVoirTout | null {
  const r = restore as Partial<CibleVoirTout> | null | undefined;
  if (!r || typeof r.page !== 'string' || !r.page || typeof r.widget !== 'string' || !r.widget) return null;
  return { page: r.page, widget: r.widget };
}

/** Au-delà, une demande n'est plus celle d'un raccourci qu'on vient de cliquer. */
export const DUREE_DEMANDE_MS = 15_000;

interface Demande extends CibleVoirTout { at: number }

/** La dernière demande de réouverture, en attente de sa page. */
export const demandeVoirTout = writable<Demande | null>(null);

export function demanderVoirTout(c: CibleVoirTout, maintenant = Date.now()): void {
  demandeVoirTout.set({ ...c, at: maintenant });
}

/** La demande vaut-elle pour CETTE page, et est-elle encore fraîche ? */
export function demandePour(d: Demande | null, page: string, maintenant = Date.now()): string | null {
  if (!d || d.page !== page) return null;
  if (maintenant - d.at > DUREE_DEMANDE_MS) return null;
  return d.widget;
}

let ecouteInstallee = false;
/** L'écoute de `tune:shortcut-restore`, une fois pour tout le client. */
export function installerEcouteVoirTout(): void {
  if (ecouteInstallee || typeof window === 'undefined') return;
  ecouteInstallee = true;
  window.addEventListener('tune:shortcut-restore', (ev: Event) => {
    const cible = (ev as CustomEvent).detail?.target;
    if (!estCibleVoirTout(cible?.key)) return;
    const c = cibleVoirTout(cible.restore);
    if (c) demanderVoirTout(c);
  });
}
