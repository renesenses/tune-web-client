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
}

const estDePassage = (v: View | null | undefined): boolean =>
  v != null && (VUES_DE_PASSAGE as readonly string[]).includes(v);

let memoire: MemoireStreaming | null = null;

// Relecture : streaming → Lecture en cours → Bibliothèque → Lecture en cours →
// barre latérale « Qobuz » est une arrivée DEPUIS AILLEURS (#3843). Toute vue
// autre que le service et la vue de passage oublie la page retenue.
activeView.subscribe((v) => {
  if (v !== 'streaming' && !estDePassage(v)) memoire = null;
});


/** À l'instant où l'on quitte l'écran du service, vers `vers`. */
export function retenirAuDepart(vers: View | null, etat: MemoireStreaming | null): void {
  memoire = estDePassage(vers) && etat && etat.active ? etat : null;
}

/**
 * Au remontage, une fois l'onglet de service connu : rend la page à rouvrir,
 * UNE fois, si l'on revient de la vue de passage sur le même service.
 */
export function reprendreAuRetour(depuis: View | null, active: string | null): MemoireStreaming | null {
  const m = memoire;
  memoire = null;
  if (!m || !estDePassage(depuis) || !active || m.active !== active) return null;
  return m;
}

/** Pour les tests. */
export function oublierMemoireStreaming(): void {
  memoire = null;
}
