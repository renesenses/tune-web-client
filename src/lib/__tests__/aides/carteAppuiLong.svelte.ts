/**
 * Banc de l'appui long (relecture de web#3452) : une carte d'album réduite à
 * ce qui compte, branchée comme dans `LibraryV2.svelte` — l'attachement est
 * rejoué par un `$effect` quand ce qu'il lit change, exactement comme
 * `{@attach …}`, et la case de sélection n'existe qu'en mode sélection.
 */
import { flushSync } from 'svelte';
import { appuiLong } from '../../appuiLong';

export function monterCarte(conditionInstable: boolean) {
  const etat = $state({ modeSelection: false, coche: false });
  const carte = document.createElement('div');
  const caseSel = document.createElement('button');
  caseSel.addEventListener('click', () => { etat.coche = !etat.coche; });
  carte.appendChild(caseSel);
  document.body.appendChild(carte);

  // `cocherDepuisPochette` : entre en sélection puis coche (bascule).
  const cocher = () => { etat.modeSelection = true; etat.coche = !etat.coche; };

  const defaire = $effect.root(() => {
    $effect(() => {
      const actif = conditionInstable ? !etat.modeSelection : true;
      return appuiLong(cocher, actif)(carte) ?? undefined;
    });
  });
  flushSync();

  return {
    etat,
    carte,
    caseSel,
    defaire() { defaire(); carte.remove(); },
  };
}
