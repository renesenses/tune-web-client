/**
 * Quelle interface monter : l'actuelle, ou la future v1.
 *
 * ## Pourquoi une clé À PART, et pas une préférence de plus
 *
 * `tune-preferences` suit le PROFIL (#1134) : ce qu'on y range se retrouve sur
 * tous les appareils. Or le choix d'interface est propre à l'appareil — on
 * essaie la future v1 sur le portable sans l'imposer à la tablette posée près
 * de la chaîne.
 *
 * Elle doit surtout être lisible AVANT tout le reste : `main.ts` décide quoi
 * monter à la première ligne, quand ni le profil ni les préférences
 * synchronisées ne sont chargés.
 *
 * ## L'URL reste maîtresse
 *
 * `?v2` force la future v1, `?v2=0` force l'actuelle — l'un et l'autre sans
 * rien écrire. C'est l'issue de secours : si un écran de la future v1 se
 * bloquait au point de rendre le menu inatteignable, `?v2=0` ramène à
 * l'interface actuelle sans avoir à vider quoi que ce soit.
 *
 * Sans paramètre, le choix mémorisé décide. Sans choix mémorisé, l'interface
 * ACTUELLE — la future v1 ne s'impose à personne.
 */

const CLE = 'tune-interface';

/** Ce que l'URL impose, ou `null` si elle ne dit rien. */
function forcageUrl(recherche: string): boolean | null {
  const p = new URLSearchParams(recherche);
  if (!p.has('v2')) return null;
  const v = p.get('v2');
  // `?v2` nu, `?v2=1`, `?v2=true` → la future. `?v2=0` / `?v2=false` → l'actuelle.
  return v === null || v === '' || (v !== '0' && v !== 'false');
}

/** Le choix mémorisé, ou `null` si l'appareil n'en a jamais fait. */
export function choixMemorise(): boolean | null {
  try {
    const v = localStorage.getItem(CLE);
    return v === null ? null : v === 'future';
  } catch {
    // Navigation privée, stockage refusé : on ne se souvient de rien, et
    // l'interface actuelle reste le défaut. Jamais d'exception ici — cette
    // fonction est appelée avant que quoi que ce soit ne soit monté.
    return null;
  }
}

/** Faut-il monter la future v1 ? */
export function futureInterface(recherche: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  const force = forcageUrl(recherche);
  if (force !== null) return force;
  return choixMemorise() === true;
}

/**
 * L'adresse où aller après un choix, et s'il faut recharger explicitement.
 *
 * 🔴 LE PIÈGE, ET LE BOGUE QU'IL A PRODUIT (Bertrand, 04/09/2026 : « v0 → v1
 * ne marche pas »). On retire `?v2` de l'adresse — sinon un forçage d'hier
 * l'emporterait sur le choix d'aujourd'hui. Mais depuis l'interface ACTUELLE
 * il n'y a rien à retirer : l'adresse calculée est identique à l'adresse
 * courante, et affecter `location.href` à la MÊME adresse ne recharge pas.
 *
 * Le sens v1 → v0 marchait — l'adresse portait `?v2`, donc elle changeait — et
 * le sens v0 → v1 ne faisait rien du tout. Une asymétrie invisible à la
 * lecture, d'où cette fonction pure, éprouvable sans navigateur.
 */
export function cibleApresChoix(href: string): { url: string; memeAdresse: boolean } {
  const url = new URL(href);
  url.searchParams.delete('v2');
  const cible = url.toString();
  return { url: cible, memeAdresse: cible === href };
}

/**
 * Mémorise le choix et recharge.
 *
 * On RECHARGE parce que le choix se joue au montage : les deux interfaces sont
 * deux arbres de composants distincts, et Svelte ne remplace pas l'un par
 * l'autre à chaud. Un rechargement est honnête — l'utilisateur vient de
 * demander à changer d'interface.
 */
export function choisirInterface(future: boolean): void {
  try { localStorage.setItem(CLE, future ? 'future' : 'actuelle'); } catch { /* stockage refusé */ }
  const { url, memeAdresse } = cibleApresChoix(location.href);
  if (memeAdresse) location.reload();
  else location.href = url;
}
