/**
 * rc14, refonte de l'ergonomie de TESS — LOT 1 : la POPUP DE CONFIGURATION
 * générique (spécification § 2.9). Le store et ses deux gestes sont ceux du
 * fichier contrat entre les lots (`stores/tessOuverture`) ; ce module tient
 * la règle de la COQUILLE autour.
 *
 * Elle occupe la zone à droite du menu vertical (`<main>`), se ferme par une
 * croix et par Échap, et garde le focus. Elle sert aux réglages complexes
 * d'un greffon : Crossfeed Pro et Crosstalk aujourd'hui, la correction de
 * pièce et le suréchantillonneur demain (les ajouter à `ECRANS_EN_POPUP` et
 * au rendu de `PopupConfiguration.svelte`).
 *
 * Ce n'est PAS un écran : `activeView` reste celui d'en dessous (TESS, le plus
 * souvent), l'adresse ne change pas. Le lot 2 appelle
 * `ouvrirPopupConfiguration(vue)` PUIS `activeView.set(vue)` (§ 3.4, pour
 * rester utilisable sans le lot 1) : la coquille voit la popup ouverte, et
 * revient sur l'écran d'en dessous (`suivrePopupConfiguration`). Les routes
 * historiques (`#crossfeedpro`, `#crosstalk`) restent servies telles quelles.
 */
import { get } from 'svelte/store';
import { activeView, type View } from './stores/navigation';
import { popupConfiguration, ouvrirPopupConfiguration, fermerPopupConfiguration } from './stores/tessOuverture';
import {
  coquilleBranchee, empilerMarqueurPopup, poserRedirectionDeVue, surMarqueurPopup,
} from './historiqueCoquille';

/** Les écrans de réglage qui s'ouvrent dans la popup plutôt qu'en plein écran. */
export const ECRANS_EN_POPUP = ['crossfeedpro', 'crosstalk'] as const;
export type EcranEnPopup = (typeof ECRANS_EN_POPUP)[number];

export function estEcranEnPopup(vue: unknown): vue is EcranEnPopup {
  return typeof vue === 'string' && (ECRANS_EN_POPUP as readonly string[]).includes(vue);
}

/**
 * Ouvre l'écran de réglage `vue` : dans la popup s'il y est rangé, sinon en
 * changeant d'écran comme avant.
 */
export function ouvrirEcranDeReglage(vue: View | string, zoneId: number | null = null): void {
  if (estEcranEnPopup(vue)) ouvrirPopupConfiguration(vue, zoneId);
  else activeView.set(vue as View);
}

/**
 * La règle de la coquille, branchée UNE fois par `ShellV2` (rend son
 * désabonnement) :
 *   - à l'ouverture, une entrée MARQUEUR est empilée (`empilerMarqueurPopup`) :
 *     le Retour du navigateur ferme alors la popup, et SEULEMENT elle ;
 *   - l'écran du greffon demandé pendant que la popup l'affiche (geste du
 *     lot 2, § 3.4) est REDIRIGÉ vers l'écran d'en dessous dans le même tour,
 *     sans rendu intermédiaire ni entrée d'historique (`poserRedirectionDeVue`) :
 *     TESS n'est jamais démonté, sa sélection reste ;
 *   - fermée par la croix ou Échap, la popup retire son marqueur
 *     (`history.back()` : on revient sur l'entrée de l'écran d'en dessous,
 *     même vue, rien ne se remonte) ;
 *   - partie vers un AUTRE écran (menu), elle se ferme ; la coquille remplace
 *     alors le marqueur par l'écran suivant : aucune entrée en trop.
 */
export function suivrePopupConfiguration(
  fenetre: Pick<Window, 'addEventListener' | 'removeEventListener'> & { history: History } | undefined =
    typeof window !== 'undefined' ? window : undefined,
): () => void {
  let dessous: View = get(activeView);
  let ouverte = false;
  /** La fermeture en cours ne doit PAS reculer (Retour déjà fait, ou navigation). */
  let sansRecul = false;

  const arretRedirection = poserRedirectionDeVue((v) => {
    const p = get(popupConfiguration);
    return p && v === p.vue && v !== dessous ? dessous : null;
  });

  const arretPopup = popupConfiguration.subscribe((p) => {
    if (p && !ouverte) {
      ouverte = true;
      dessous = get(activeView);
      empilerMarqueurPopup(p.vue);
    } else if (!p && ouverte) {
      ouverte = false;
      const reculer = !sansRecul && surMarqueurPopup();
      sansRecul = false;
      if (reculer) fenetre?.history.back();
    }
  });

  const arretVue = activeView.subscribe((v) => {
    const p = get(popupConfiguration);
    if (!p) { dessous = v; return; }
    if (v === p.vue) {
      // Sans coquille branchée (pas de redirection), on rétablit nous-mêmes.
      if (!coquilleBranchee() && v !== dessous) activeView.set(dessous);
      return;
    }
    if (v !== dessous) { sansRecul = true; fermerPopupConfiguration(); }
  });

  // Le Retour du navigateur : la popup se ferme, l'entrée est déjà reculée.
  const surRetour = () => {
    if (get(popupConfiguration) && !surMarqueurPopup()) { sansRecul = true; fermerPopupConfiguration(); }
  };
  fenetre?.addEventListener('popstate', surRetour);

  return () => {
    arretRedirection(); arretPopup(); arretVue();
    fenetre?.removeEventListener('popstate', surRetour);
  };
}
