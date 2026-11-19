/**
 * tune-server-rust#7901 (fil 2658, revenu en rc12) — QUAND « LECTURE EN
 * COURS » OUVRE LA FICHE DE CE QUI JOUE, C'EST ELLE QUI RESTE SURLIGNÉE.
 *
 * Avec le réglage « Lecture en cours ouvre l'album ou la playlist »
 * (`lienLectureVersSource`, web#1784), un clic sur l'entrée « Lecture en
 * cours » n'affiche pas l'écran dédié : il ouvre la fiche de l'album dans la
 * Bibliothèque (ou la playlist, ou l'album du service). La route devient
 * alors `library` et la barre allumait « Bibliothèque » — exactement la
 * capture du fil : on vient de demander Lecture en cours, et la barre dit
 * qu'on est ailleurs.
 *
 * Ce module retient que la fiche affichée a été ouverte PAR Lecture en cours.
 * La marque tombe dès qu'on en sort : autre vue, autre fiche (ou retour à la
 * liste), ou n'importe quel clic de la barre.
 */
import { get, writable } from 'svelte/store';
import { activeView, type View } from './stores/navigation';
import { detailOuvert } from './historiqueCoquille';

export interface OuvertureLectureEnCours {
  /** La vue où Lecture en cours a mené (`library`, `playlists`, `streaming`…). */
  vue: View;
  /**
   * La fiche ouverte sur cette vue, relevée à sa première apparition :
   * l'écran la pose APRÈS le changement de vue (`pendingLibraryAlbum`).
   * `undefined` tant qu'elle n'est pas apparue.
   */
  fiche?: string;
  /** La clé de fiche au moment de la marque : une fiche qui ne change pas n'est pas « la nouvelle ». */
  avant: string | null;
}

export const ouvertureLectureEnCours = writable<OuvertureLectureEnCours | null>(null);

/** À appeler juste après que Lecture en cours a mené sur la fiche de ce qui joue. */
export function marquerOuvertureLectureEnCours(): void {
  const vue = get(activeView);
  ouvertureLectureEnCours.set(vue === 'nowplaying' ? null : { vue, avant: get(detailOuvert) });
}

export function oublierOuvertureLectureEnCours(): void {
  ouvertureLectureEnCours.set(null);
}

activeView.subscribe((v) => {
  const m = get(ouvertureLectureEnCours);
  if (m && m.vue !== v) ouvertureLectureEnCours.set(null);
});

detailOuvert.subscribe((d) => {
  const m = get(ouvertureLectureEnCours);
  if (!m) return;
  if (m.fiche === undefined) {
    if (d != null && d !== m.avant) ouvertureLectureEnCours.set({ ...m, fiche: d });
  } else if (d !== m.fiche) {
    ouvertureLectureEnCours.set(null);
  }
});

/**
 * La vue que la barre latérale doit allumer : `nowplaying` tant que l'écran
 * affiché est la fiche ouverte par Lecture en cours, la route sinon.
 */
export function vueAllumee(vue: View, marque: OuvertureLectureEnCours | null): View {
  return marque && marque.vue === vue ? 'nowplaying' : vue;
}
