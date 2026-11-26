/**
 * Les listes au style Tune de l'écran Concerts (rc14) remplacent les
 * `<select>` natifs du pays et du rayon : ces aides les manipulent dans les
 * bancs comme le ferait l'utilisateur — ouvrir la liste, cliquer l'option.
 */
import { flushSync } from 'svelte';

/** Le bouton qui ouvre la liste, dans le conteneur `.cc-pays` ou `.cc-rayon`. */
export const boutonChoix = (conteneur: Element | null | undefined) =>
  (conteneur?.querySelector('.cc-choix-bouton') ?? null) as HTMLButtonElement | null;

/** La valeur affichée dans le champ (« France », « 100 km »). */
export const valeurAffichee = (conteneur: Element | null | undefined) =>
  (conteneur?.querySelector('.cc-choix-valeur')?.textContent ?? '').trim();

/** Ouvre la liste et rend les valeurs proposées (`data-valeur`), dans l'ordre. */
export function valeursProposees(conteneur: Element): string[] {
  ouvrir(conteneur);
  const v = [...conteneur.querySelectorAll('.cc-choix-option')].map((o) => o.getAttribute('data-valeur') ?? '');
  boutonChoix(conteneur)!.click();
  flushSync();
  return v;
}

function ouvrir(conteneur: Element) {
  const b = boutonChoix(conteneur);
  if (!b) throw new Error('liste introuvable');
  if (b.getAttribute('aria-expanded') !== 'true') b.click();
  flushSync();
}

/** Ouvre la liste et choisit l'option `valeur`. */
export function choisirDans(conteneur: Element, valeur: string | number) {
  ouvrir(conteneur);
  const o = conteneur.querySelector(`.cc-choix-option[data-valeur="${valeur}"]`) as HTMLElement | null;
  if (!o) throw new Error(`option ${valeur} absente`);
  o.click();
  flushSync();
}
