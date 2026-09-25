/**
 * Dates au format de la LANGUE CHOISIE, pas du français en dur.
 *
 * Six sites du client v2 appelaient `toLocaleDateString('fr-FR', …)` en dur :
 * un utilisateur en anglais lisait « 3 sept. 2026 » au milieu d'une interface
 * anglaise. Le contrôleur `check-i18n.mjs` ne peut pas l'attraper — il cherche
 * du texte français littéral, or la chaîne fautive est un code de langue.
 *
 * Même patron que `$t` : ce sont des stores DÉRIVÉS de `locale`, donc un
 * composant qui écrit `{$dateCourte(x)}` se redessine au changement de langue.
 * Un simple `get(locale)` figerait le format au premier rendu — la langue
 * changerait partout sauf sur les dates.
 *
 * PAS TOUCHÉ ICI, et c'est délibéré : `formatNumber` et `formatAlbumYear` dans
 * `lib/utils.ts` figent aussi `fr-FR`, mais ils sont partagés avec le client
 * actuel — les rendre sensibles à la langue change les séparateurs de milliers
 * dans TOUTE l'application. À traiter à part. (`formatAlbumYear` porte en plus
 * un « rééd. » en dur.)
 */
import { derived } from 'svelte/store';
import { locale } from './i18n';

/** Une entrée exploitable, ou `null` si la date est absente ou illisible. */
function versDate(v: string | number | Date | null | undefined): Date | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** « 3 sept. 2026 » / « Sep 3, 2026 ». Chaîne vide si la date est inutilisable. */
export const dateCourte = derived(locale, ($l) => (v: string | number | Date | null | undefined): string => {
  const d = versDate(v);
  return d ? d.toLocaleDateString($l, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
});

/** Date sans l'année, avec l'heure — pour un fil de discussion. */
export const dateEtHeure = derived(locale, ($l) => (v: string | number | Date | null | undefined): string => {
  const d = versDate(v);
  return d
    ? d.toLocaleString($l, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
});

/** L'heure seule — pour un horodatage de rafraîchissement. */
export const heureSeule = derived(locale, ($l) => (v: string | number | Date | null | undefined): string => {
  const d = versDate(v);
  return d ? d.toLocaleTimeString($l) : '';
});

/** Date simple, sans mois abrégé — pour une échéance. */
export const dateSimple = derived(locale, ($l) => (v: string | number | Date | null | undefined): string => {
  const d = versDate(v);
  return d ? d.toLocaleDateString($l) : '';
});

/**
 * Un JOUR calendaire `AAAA-MM-JJ` lu comme un jour LOCAL (#1578).
 *
 * `new Date('2026-09-24')` est minuit UTC : à l'ouest de Greenwich, la date
 * affichée serait la veille. Le serveur rend ici une date sans heure (la
 * dernière occurrence du scan programmé) ; on la construit donc à midi local.
 * `null` si la valeur est absente ou n'a pas cette forme.
 */
export function jourIsoLocal(v: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((v ?? '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}
