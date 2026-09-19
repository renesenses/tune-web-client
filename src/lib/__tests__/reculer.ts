/**
 * Le Précédent du navigateur, attendu sur son ÉVÉNEMENT et non sur une durée
 * (#1308).
 *
 * jsdom livre le `popstate` de `history.back()` de façon asynchrone. Les bancs
 * d'historique attendaient 60 ms « pour laisser passer » : sous la charge de
 * la porte (quatre portes simultanées sur Shrek, 19/09/2026), le `popstate`
 * arrivait après, et le témoin lisait encore la vue d'avant —
 * `historiqueCoquilleV2_828_867` : « expected 'settings' to be 'queue' ».
 *
 * Cet écouteur est posé APRÈS celui de la coquille (`historiqueCoquille.ts`,
 * `surRetour`, synchrone) : quand il se déclenche, l'état est reposé. Un filet
 * de 4 s rend un échec LISIBLE, avant le chronomètre du test.
 */
export function reculer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const filet = setTimeout(() => reject(new Error('aucun popstate après history.back()')), 4_000);
    window.addEventListener('popstate', () => { clearTimeout(filet); resolve(); }, { once: true });
    history.back();
  });
}
