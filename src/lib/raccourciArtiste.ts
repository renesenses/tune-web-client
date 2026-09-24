/**
 * UN RACCOURCI SUR UN ARTISTE — #1501.
 *
 * Bertrand, 23/09/2026, point 3 de #1501 : « les raccourcis enregistrés sur un
 * artiste rouvrent la page commune, pas une fiche disparue ».
 *
 * ## Ce qui existait, mesuré avant d'écrire
 *
 * RIEN ne visait la fiche retirée. `captureCurrentView` (`stores/shortcuts`)
 * ne fige pour la Bibliothèque que l'ONGLET et la PORTÉE de répertoire ; la
 * fiche d'artiste d'`ArtistesV2` n'a jamais publié de cible
 * (`setShortcutTarget`), et aucune forme `library:artiste:<id>` n'a jamais été
 * écrite. Un raccourci posé sur l'onglet Artistes rouvre donc la grille, hier
 * comme aujourd'hui.
 *
 * Mais un raccourci posé SUR LA PAGE COMMUNE ne retenait que sa vue
 * (`streamingartist`) : le rouvrir montait la page sans cible, vide. C'est ce
 * que cette fonction règle, pour un artiste local comme pour un artiste de
 * service — la page commune est désormais la seule page d'artiste, et la seule
 * qu'un raccourci puisse viser.
 *
 * ## La forme
 *
 * `restore` est EXACTEMENT ce que [`ouvrirArtisteDepuis`] attend : un artiste
 * de la bibliothèque (`id` + `source: 'local'`) ou un artiste de service
 * (`source` + `source_id`). Le raccourci rouvre la page par le chemin UNIQUE
 * de #1494, et ne recopie pas la bifurcation local / service — la garde
 * `vueArtisteUnique1494.test.ts` l'interdirait.
 *
 * `key` est l'identité STABLE de la cible, pour que deux raccourcis sur le
 * même artiste n'en fassent qu'un (`shortcutKey`). Le service en fait partie :
 * l'identifiant `42` de Qobuz n'est pas le `42` de la bibliothèque.
 */
import type { ShortcutTarget } from './stores/shortcuts';

export interface FicheArtiste {
  service: string | null;
  id: string;
  nom?: string | null;
}

export function cibleRaccourciArtiste(fiche: FicheArtiste, nom?: string | null): ShortcutTarget | null {
  const id = String(fiche?.id ?? '').trim();
  if (!id) return null;
  const label = (nom ?? fiche.nom ?? '').trim() || undefined;
  if (fiche.service == null) {
    const n = Number(id);
    // Un identifiant local qui n'est pas un nombre n'est pas une route.
    if (!Number.isFinite(n)) return null;
    return { key: `artiste:local:${n}`, restore: { id: n, name: label ?? '', source: 'local' }, label };
  }
  return {
    key: `artiste:${fiche.service}:${id}`,
    restore: { name: label ?? '', source: fiche.service, source_id: id },
    label,
  };
}
