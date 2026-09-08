/**
 * Le nom d'une fonctionnalité de licence, dans la langue de l'interface.
 *
 * #798, relevé en instruisant le retour d'un prospect (Claudio Osorio,
 * 08/09/2026) qui a conclu que **DLNA, AirPlay 2 et BluOS étaient payants**.
 * Ils ne le sont pas.
 *
 * ## Ce qu'il voyait
 *
 * L'écran de licence affichait `feat.display_name`, servi tel quel par le
 * serveur (`tune-core/src/license.rs`) : « Unlimited Zones », « Multiroom
 * Sync », « DSP & EQ »… **Vingt-cinq lignes anglaises frappées d'un cadenas**,
 * dans un écran par ailleurs traduit en onze langues.
 *
 * Et deux de ces lignes pointent vers l'écran des zones. « 🔒 Unlimited
 * Zones » dans une liste de cadenas, à côté de ses enceintes réseau, est très
 * exactement ce qui fait conclure qu'elles sont payantes.
 *
 * ## Le terme stable était déjà là
 *
 * `LicenseStatus.features` est indexé par le CODE de la fonctionnalité
 * (`unlimited_zones`, `multiroom_sync`…) — un identifiant qui ne bouge pas
 * avec la langue, et qui est fait pour ça. On traduit donc par le code.
 *
 * 🔴 `display_name` reste le REPLI, et il faut qu'il le reste : le serveur
 * peut livrer une fonctionnalité que ce client ne connaît pas encore, et il
 * vaut mieux un nom anglais qu'une ligne vide ou un code brut.
 */
import { get } from 'svelte/store';
import { t } from './i18n';

/** La clef de traduction d'un code de fonctionnalité. */
export function cleFonctionnalite(code: string): string {
  return `licenseFeature.${code}`;
}

/**
 * Le nom à afficher : la traduction si on la connaît, sinon ce que le serveur
 * a envoyé, sinon le code lui-même.
 *
 * `get(t)` rend la clef telle quelle quand elle est inconnue — c'est ainsi
 * qu'on distingue « traduit » de « pas encore traduit ».
 */
export function nomFonctionnalite(
  code: string,
  displayName?: string | null,
  traduire: (cle: string) => string = get(t) as (cle: string) => string,
): string {
  const cle = cleFonctionnalite(code);
  const traduit = traduire(cle);
  if (traduit && traduit !== cle) return traduit;
  const brut = (displayName ?? '').trim();
  return brut || code;
}
