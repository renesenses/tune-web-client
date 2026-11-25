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
import { reculerUneEtape } from './historiqueCoquille';

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
 *   - popup ouverte, l'écran demandé est celui de la popup ⇒ on revient sur
 *     l'écran d'en dessous (en reculant d'une entrée quand c'est possible :
 *     l'historique ne garde pas la trace d'un écran jamais montré) ;
 *   - popup ouverte, on part vers un AUTRE écran (menu, Précédent) ⇒ elle se
 *     ferme : elle appartient à l'écran d'où on l'a ouverte.
 */
export function suivrePopupConfiguration(): () => void {
  let dessous: View = get(activeView);
  let precedente: View = dessous;
  const arretPopup = popupConfiguration.subscribe((p) => {
    if (!p) return;
    const v = get(activeView);
    // Ouverte alors que l'écran du greffon est déjà affiché (ordre inverse) :
    // l'écran d'en dessous est celui d'avant.
    dessous = v === p.vue ? (precedente === p.vue ? 'tess' : precedente) : v;
  });
  const arretVue = activeView.subscribe((v) => {
    const avant = precedente;
    precedente = v;
    const p = get(popupConfiguration);
    if (!p) { dessous = v; return; }
    if (v === p.vue) {
      if (!reculerUneEtape(v)) activeView.set(dessous);
      return;
    }
    if (v !== dessous && avant !== p.vue) fermerPopupConfiguration();
  });
  return () => { arretPopup(); arretVue(); };
}
