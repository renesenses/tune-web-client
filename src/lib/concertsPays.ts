/**
 * Le PAYS de la localisation des concerts : les codes proposés, et leur ordre.
 *
 * ── LE DÉFAUT (fil forum 2150, Tune 1.0.0-rc2, macOS) ─────────────────────
 *
 * « La recherche de concerts ne prend pas en compte une ville en Suisse. »
 * L'écran n'avait AUCUN champ pays : `ConcertsView` partait de `'FR'` et
 * l'envoyait tel quel au `POST /location`. Une commune suisse partait donc au
 * géocodeur du nuage avec `country=FR` (introuvable, ou un homonyme
 * français), et « Dans mon pays » filtrait les concerts… de France. Le nuage
 * et le greffon acceptent n'importe quel code ISO : seul le client fixait le
 * pays.
 *
 * ── CE QUE CE MODULE CONTIENT ─────────────────────────────────────────────
 *
 * Des CODES ISO 3166-1 alpha-2, jamais des noms : le nom affiché vient de
 * `Intl.DisplayNames` par `nomDuPays` (`lib/paysAffichage.ts`), dans la langue
 * de l'interface. Le client ne tient toujours pas de table de pays
 * (`radiosGenresBranchesSilviu.test.ts`).
 *
 * Le pays n'est jamais DÉDUIT (ni de l'adresse IP, ni de la langue du
 * navigateur) : comme la commune, il se choisit. Le défaut reste `FR`, celui
 * d'avant, tant que rien n'est enregistré.
 */
import { nomDuPays } from './paysAffichage';

export const PAYS_PAR_DEFAUT = 'FR';

/** Les pays proposés, en codes. Un pays déjà enregistré hors de cette liste
 *  reste proposé (`optionsDePays`). */
export const PAYS_CONCERTS: readonly string[] = [
  'AT', 'AU', 'BE', 'BG', 'BR', 'CA', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES',
  'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'JP', 'KR', 'LT', 'LU',
  'LV', 'MC', 'MT', 'MX', 'NL', 'NO', 'NZ', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
  'TR', 'US', 'ZA',
];

/** Un code ISO alpha-2 normalisé, ou `null`. */
export function codeDePays(brut: string | null | undefined): string | null {
  const c = (brut ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

/**
 * Les options du sélecteur, triées sur le nom affiché dans `langue`.
 * `courant` (le pays enregistré) est toujours présent, même hors liste : un
 * réglage enregistré ne doit pas disparaître du formulaire.
 */
export function optionsDePays(
  langue: string,
  courant?: string | null,
): { code: string; nom: string }[] {
  const codes = new Set(PAYS_CONCERTS);
  const c = codeDePays(courant);
  if (c) codes.add(c);
  return [...codes]
    .map((code) => ({ code, nom: nomDuPays(code, langue) || code }))
    .sort((a, b) => a.nom.localeCompare(b.nom, langue));
}
