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
