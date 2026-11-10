/**
 * Le bouton Retour de « Lecture en cours » — web#2743.
 *
 * cpadiou77 (fil « Retour au début de la bibliothèque après la page écoute de
 * piste », rc10, tablette) :
 *   1. Bibliothèque, album choisi loin dans la liste, écran de lecture, Retour
 *      → la Bibliothèque repart du début ;
 *   2. Favoris Qobuz, même geste → retour sur l'accueil Qobuz.
 *
 * Cause : le bouton CHANGEAIT de vue (`activeView.set(previousView)`). La
 * coquille empile alors une entrée NEUVE, sans onglet ni fiche
 * (`brancherHistoriqueCoquille` remet `ongletCourant` et `detailOuvert` à
 * `null` à chaque changement de vue) : le sous-onglet « Favoris » de Qobuz et
 * la fiche d'album ouverte dans la Bibliothèque étaient perdus, l'écran
 * remonté repartait sur son état par défaut.
 *
 * L'entrée que l'on quitte, elle, portait tout (vue, onglet, fiche) : quand
 * on est arrivé ici depuis la vue de retour, RECULER d'un cran la repose —
 * exactement comme le Précédent du navigateur, qui marchait déjà.
 */
import { get } from 'svelte/store';
import { activeView, previousView, type View } from './stores/navigation';
import { destinationDeRetour } from './destinationDeRetour';
import { estEtatCoquille } from './historiqueCoquille';
import { reculerAvecIntention } from './historiqueNavigation';

export type DecisionRetour = { action: 'reculer' } | { action: 'aller'; vers: View };

/**
 * Reculer seulement si l'entrée courante est bien celle de « Lecture en
 * cours », posée par la coquille, et si la vue de retour est celle d'où l'on
 * vient : l'entrée d'en dessous est alors la sienne. Sinon (démarrage sur
 * cet écran, sortie du Grand écran, entrée étrangère), on change de vue
 * comme avant — reculer pourrait faire sortir de Tune.
 */
export function decisionRetourLectureEnCours(
  precedente: View | null,
  etatCourant: unknown,
  longueurHistorique: number,
): DecisionRetour {
  const vers = destinationDeRetour(precedente, { depuis: 'nowplaying', repli: 'library' });
  const entreeDeLecture = estEtatCoquille(etatCourant) && etatCourant.vue === 'nowplaying';
  if (entreeDeLecture && precedente != null && vers === precedente && longueurHistorique > 1) {
    return { action: 'reculer' };
  }
  return { action: 'aller', vers };
}

/** Le geste du bouton Retour (et de la vignette de la barre, sur cet écran). */
export function retourDepuisLectureEnCours(
  fenetre: Pick<Window, 'history'> | undefined = typeof window !== 'undefined' ? window : undefined,
): void {
  const d = decisionRetourLectureEnCours(
    get(previousView),
    fenetre?.history.state,
    fenetre?.history.length ?? 0,
  );
  if (d.action === 'reculer') {
    reculerAvecIntention(() => {}, { historique: fenetre!.history });
    return;
  }
  activeView.set(d.vers);
}
