/**
 * La page quittée d'un service de streaming, retrouvée après « Lecture en
 * cours » — web#2828.
 *
 * Ronin22 (ASR, fil « Mozaiklabs Tune player », p. 9, rc11) : Qobuz › Genres ›
 * un genre › un album › Lecture, puis « Lecture en cours », puis retour sur
 * Qobuz : l'écran repartait de l'accueil du service.
 *
 * Cause : `StreamingV2` est monté dans la chaîne de vues de `ShellV2` ; changer
 * de vue le DÉTRUIT, et son fil de genres, sa fiche d'album et son défilement
 * sont des `$state` locaux. La coquille ne garde que l'onglet et la CLÉ de la
 * fiche (`ongletCourant`, `detailOuvert`), et encore seulement au Précédent :
 * le clic sur « Qobuz » dans la barre latérale empile une entrée neuve, sans
 * onglet ni fiche. Rien ne rouvrait le genre ni l'album. Le défaut est le même
 * pour TOUS les services (TIDAL, Spotify, Deezer, Bandcamp…) : ils partagent
 * cet écran.
 *
 * La mémoire vit ICI, hors du composant, pour survivre à son démontage. Elle
 * n'est écrite qu'en partant vers une vue de PASSAGE (« Lecture en cours ») et
 * n'est relue qu'en revenant de cette même vue, sur le même service : la règle
 * de #3843 (un clic de barre latérale depuis un autre écran repart de la
 * racine) reste vraie partout ailleurs.
 */
import { activeView, type View } from './stores/navigation';
import type { StreamingGenre } from './types';
import type { TypeArrivee } from './historiqueCoquille';
import { currentProfileId } from './stores/profile';

/** Les vues d'où l'on « revient » au service plutôt que d'y « aller ». */
export const VUES_DE_PASSAGE: readonly View[] = ['nowplaying'];

export interface MemoireStreaming {
  /** L'onglet de service (`qobuz`, `tidal`, `__bandcamp__`…). */
  active: string;
  /** Le sous-onglet (Éditorial, Genres, Playlists…). */
  sub: string;
  genrePath: StreamingGenre[];
  subGenres: StreamingGenre[];
  genreId: string;
  /** La fiche d'album de service ouverte, et son service. */
  fiche: unknown | null;
  ficheService: string | null;
  /** La fiche d'album Bandcamp ouverte. */
  ficheBc: unknown | null;
  /** La fiche de playlist ouverte. */
  fichePlaylist: unknown | null;
  /** Le défilement de la zone de contenu. */
  defilement: number;
  /**
   * Fil 2694 — la recherche DANS le service : la saisie, les pages déjà
   * chargées et le décalage de la dernière. Facultatifs : une mémoire écrite
   * sans eux (les témoins de #2828) se relit comme avant.
   */
  q?: string;
  results?: unknown | null;
  rechOffset?: number;
  bcSearch?: unknown | null;
  /**
   * Fil 2694 — la fiche d'album REFERMÉE pour partir ailleurs (le lien de
   * l'artiste la referme avant de router, #1486). Elle était à l'écran au
   * moment du clic : le Précédent du navigateur la rouvre.
   */
  ficheQuittee?: unknown | null;
  ficheQuitteeService?: string | null;
  /**
   * Vrai quand le Retour de la page d'arrivée rouvre lui-même cette fiche
   * (`ficheAlbumDeRetour`, web#1602) : revenu par ce Retour, on ne la
   * rouvre pas une seconde fois.
   */
  ficheMontreeParLeRetour?: boolean;
  /**
   * Relecture de #2926 — l'IDENTIFIANT de l'entrée d'historique quittée
   * (`historiqueCoquille.pageQuittee`). Par Précédent/Suivant, la page n'est
   * rendue que sur CETTE entrée : une autre visite du même service (sa racine)
   * reste ce qu'elle était.
   */
  page?: string | null;
  /** Le compte du service au départ : un autre compte ne reprend rien. */
  compte?: string | null;
}

/** Ce que l'écran remonté sait de son arrivée. */
export interface ContexteArrivee {
  /** L'identifiant de l'entrée atteinte (`historiqueCoquille.pageCourante`). */
  page?: string | null;
  /** Le compte du service maintenant. */
  compte?: string | null;
}

const estDePassage = (v: View | null | undefined): boolean =>
  v != null && (VUES_DE_PASSAGE as readonly string[]).includes(v);

let memoire: MemoireStreaming | null = null;
/**
 * Fil 2694 — la DERNIÈRE page quittée, quelle que soit la vue d'arrivée. Elle
 * n'est relue que par un RETOUR (`typeArrivee` : Retour d'une page,
 * Précédent/Suivant du navigateur) : une arrivée délibérée (barre latérale,
 * raccourci) ne la voit jamais, et #3843 tient.
 */
let derniere: MemoireStreaming | null = null;

// Relecture : streaming → Lecture en cours → Bibliothèque → Lecture en cours →
// barre latérale « Qobuz » est une arrivée DEPUIS AILLEURS (#3843). Toute vue
// autre que le service et la vue de passage oublie la page retenue.
activeView.subscribe((v) => {
  if (v !== 'streaming' && !estDePassage(v)) memoire = null;
});

/** À l'instant où l'on quitte l'écran du service, vers `vers`. */
export function retenirAuDepart(vers: View | null, etat: MemoireStreaming | null): void {
  memoire = estDePassage(vers) && etat && etat.active ? etat : null;
  derniere = etat && etat.active ? etat : null;
}

/**
 * Au remontage, une fois l'onglet de service connu : rend la page à rouvrir,
 * UNE fois, si l'on revient de la vue de passage sur le même service.
 */
export function reprendreAuRetour(
  depuis: View | null,
  active: string | null,
  arrivee: TypeArrivee = 'geste',
  contexte: ContexteArrivee = {},
): MemoireStreaming | null {
  const m = memoire;
  const d = derniere;
  memoire = null;
  derniere = null;
  if (!active) return null;
  const memeCompte = (x: MemoireStreaming) =>
    !('compte' in contexte) || (x.compte ?? null) === (contexte.compte ?? null);
  // Fil 2694 — revenu par l'historique : la page quittée, et seulement sur
  // l'entrée même qu'on avait quittée.
  if (arrivee === 'historique') {
    return d && d.active === active && memeCompte(d) && d.page != null && d.page === (contexte.page ?? null) ? d : null;
  }
  // Revenu par le Retour d'une page : la dernière page quittée du service.
  if (arrivee === 'retour') return d && d.active === active && memeCompte(d) ? d : null;
  if (!m || !estDePassage(depuis) || m.active !== active || !memeCompte(m)) return null;
  return m;
}

/* ------------------------------------------------------------------ */
/* La page à widgets (éditorial d'un service, Accueil) — fil 2694       */
/* ------------------------------------------------------------------ */

/**
 * Ce que `PageWidgets` avait à l'écran en partant : la page « Voir tout »
 * ouverte (les nouveautés Qobuz…), la fiche d'album posée dessus, et les
 * défilements. Rangée par CLÉ de page (`qobuz_widgets`, `home_widgets`) : la
 * clé porte le service, une page n'en reprend jamais une autre.
 */
export interface MemoirePageWidgets {
  voirTout: string | null;
  defilement: number;
  defilementAvant: number;
  fiche: unknown | null;
  ficheService: string | null;
  ficheQuittee: unknown | null;
  ficheQuitteeService: string | null;
  ficheMontreeParLeRetour: boolean;
  /** L'identifiant de l'entrée quittée (voir `MemoireStreaming.page`). */
  page?: string | null;
}

let pagesWidgets = new Map<string, MemoirePageWidgets>();

/** Au départ de la vue qui porte la page `cle`. */
export function retenirPageWidgets(cle: string, etat: MemoirePageWidgets | null): void {
  // Une seule page retenue : celle que l'on quitte en dernier.
  pagesWidgets = new Map();
  if (etat) pagesWidgets.set(cle, etat);
}

/** Au montage de la page `cle` : rend sa page quittée, UNE fois, sur un retour. */
export function reprendrePageWidgets(cle: string, arrivee: TypeArrivee, page: string | null = null): MemoirePageWidgets | null {
  const m = pagesWidgets.get(cle) ?? null;
  pagesWidgets = new Map();
  if (!m || arrivee === 'geste') return null;
  if (arrivee === 'historique' && (m.page == null || m.page !== page)) return null;
  return m;
}

/**
 * Tout oublier : changement de profil, de compte d'un service, et tests. Une
 * page retenue sous un profil (ses favoris, sa recherche) ne se rend jamais à
 * un autre.
 */
export function oublierMemoireStreaming(): void {
  memoire = null;
  derniere = null;
  pagesWidgets = new Map();
}

let profilConnu: unknown;
let profilLu = false;
currentProfileId.subscribe((p) => {
  if (profilLu && p !== profilConnu) oublierMemoireStreaming();
  profilLu = true;
  profilConnu = p;
});
