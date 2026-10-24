/**
 * web#2190 — LES BROUILLONS DE L'ÉCRAN SUPPORT.
 *
 * Fil forum 2276 : « il est ennuyeux que le texte disparaisse avant l'envoi si
 * l'on doit se déplacer dans une autre section pour valider ou récupérer
 * l'information à envoyer. » Les champs de `SupportV2` étaient des `$state`
 * du composant : quitter l'écran le démonte, et le texte partait avec lui.
 *
 * Le brouillon vit donc HORS du composant, pour la durée de l'onglet :
 *  - en mémoire du module, ce qui suffit à survivre à un changement d'écran ;
 *  - recopié dans `sessionStorage` quand il est disponible, ce qui le fait
 *    survivre aussi à un rechargement de la page dans le même onglet.
 * Pas de `localStorage` : un texte de rapport n'a pas à traîner d'un jour à
 * l'autre, ni à passer d'un onglet à l'autre.
 *
 * Le brouillon n'est vidé qu'après un envoi ACCEPTÉ, ou à la demande
 * (« Effacer le brouillon »).
 */

export type ChampBrouillon = 'bogueDesc' | 'sujet' | 'corps' | `reponse:${string}`;

const PREFIXE = 'tune-support-brouillon:';
const memoire = new Map<string, string>();

function stockage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null; // stockage interdit (navigation privée stricte, iframe…)
  }
}

export function lireBrouillon(champ: ChampBrouillon): string {
  if (memoire.has(champ)) return memoire.get(champ)!;
  try {
    const v = stockage()?.getItem(PREFIXE + champ);
    if (typeof v === 'string') {
      memoire.set(champ, v);
      return v;
    }
  } catch { /* lecture impossible : brouillon vide */ }
  return '';
}

export function ecrireBrouillon(champ: ChampBrouillon, valeur: string): void {
  if (!valeur) return effacerBrouillon(champ);
  memoire.set(champ, valeur);
  try { stockage()?.setItem(PREFIXE + champ, valeur); } catch { /* quota, interdit : la mémoire suffit */ }
}

export function effacerBrouillon(champ: ChampBrouillon): void {
  memoire.delete(champ);
  try { stockage()?.removeItem(PREFIXE + champ); } catch { /* idem */ }
}

/** Témoins seulement : repartir d'un état vierge entre deux cas. */
export function viderTousLesBrouillons(): void {
  for (const k of [...memoire.keys()]) effacerBrouillon(k as ChampBrouillon);
  const s = stockage();
  if (!s) return;
  try {
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k?.startsWith(PREFIXE)) s.removeItem(k);
    }
  } catch { /* idem */ }
}
