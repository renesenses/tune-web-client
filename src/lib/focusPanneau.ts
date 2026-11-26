/**
 * Le focus des panneaux de la barre de la Bibliothèque (« Filtres »,
 * « Affichage ») — relecture de web#3452, accessibilité.
 *
 * À l'ouverture, le focus va au premier élément du panneau qu'on peut
 * atteindre ; à la fermeture (Échap, bouton « Voir », bouton de fermeture),
 * il revient au bouton qui l'a ouvert. Sans cela, au clavier ou au lecteur
 * d'écran, le panneau s'ouvre derrière le focus et le referme sur `body`.
 *
 * Un clic AILLEURS qui ferme le panneau garde son focus : on ne le vole que
 * s'il est resté dans le panneau (ou retombé sur `body`).
 *
 * Usage : `<div class="menu panneau" {@attach focusPanneau()}>`, le panneau
 * étant rendu dans le même `.drop` que son bouton d'ouverture.
 */
const FOCALISABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Le premier élément atteignable, en sautant ceux qui ne sont pas affichés
 *  (la poignée de la feuille n'existe qu'au téléphone). */
export function premierFocalisable(panneau: HTMLElement): HTMLElement | null {
  const tous = [...panneau.querySelectorAll<HTMLElement>(FOCALISABLES)];
  return tous.find((el) => el.getClientRects().length > 0) ?? tous[0] ?? null;
}

export function focusPanneau() {
  return (panneau: HTMLElement) => {
    const bouton = panneau.closest('.drop')?.querySelector<HTMLElement>(':scope > button') ?? null;
    premierFocalisable(panneau)?.focus({ preventScroll: true });
    return () => {
      const ici = document.activeElement;
      if (!ici || ici === document.body || panneau.contains(ici)) bouton?.focus({ preventScroll: true });
    };
  };
}
