/**
 * 🔴 LA LANGUE PAR DÉFAUT EST CELLE DU NAVIGATEUR, JAMAIS LE FRANÇAIS.
 *
 * Jusqu'au 06/10/2026, `defaults.language` valait `'fr'` et `main.ts`
 * retombait sur `?? 'fr'` : tout nouvel utilisateur, où qu'il soit, ouvrait
 * Tune en français — le jour du lancement public anglophone. La langue du
 * navigateur n'était lue nulle part.
 *
 * ## « Choisie » ou « par défaut » : le champ `langueAuto`
 *
 * `createPreferences` sérialise le blob ENTIER dès la première émission, et
 * `syncPreferencesFromServer` fusionne `{ ...defaults, ...server, ...local }` :
 * tout navigateur qui a affiché Tune une fois porte `language: 'fr'`, choisi
 * ou non (le piège de `avatarImage: ''`, #1673). La valeur seule ne dit donc
 * rien. `langueAuto` le dit :
 *
 *   - `langueAuto: null`  → la langue a été CHOISIE (écran Réglages) ;
 *   - `langueAuto: 'xx'`  → Tune a posé `'xx'` lui-même, d'après le
 *     navigateur. Si `language` vaut encore `'xx'`, ce n'est pas un choix ;
 *     s'il vaut autre chose, c'est qu'un client plus ancien (qui ne connaît
 *     pas `langueAuto` mais le recopie tel quel) l'a changé par ses Réglages :
 *     c'est un choix ;
 *   - `langueAuto` ABSENT → blob écrit avant ce correctif. `'fr'` y était le
 *     défaut : il n'est PAS tenu pour un choix. Toute autre langue n'a pu être
 *     posée que par les Réglages : elle est tenue pour un choix.
 *
 * Seul coût de la règle « ancien `'fr'` = défaut » : quelqu'un qui avait
 * choisi le français sur un navigateur réglé dans une autre langue le perd
 * une fois, et le repose dans les Réglages. Un navigateur français, lui,
 * retombe sur le français.
 */
import { CHARGEURS, type Locale } from './locales';

/** L'ancienne valeur de `defaults.language`, avant ce correctif. */
const ANCIEN_DEFAUT: Locale = 'fr';
/** La langue quand le navigateur n'en propose aucune que l'interface parle. */
export const LANGUE_DE_REPLI: Locale = 'en';

export function estLocale(v: unknown): v is Locale {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CHARGEURS, v);
}

type NavigateurLangues = { languages?: readonly string[]; language?: string } | undefined;

/** La première langue du navigateur que l'interface parle (`fr-FR` → `fr`,
 *  `zh-TW` → `zh`), dans l'ordre de `navigator.languages` puis
 *  `navigator.language` ; l'anglais sinon. */
export function langueDuNavigateur(
  nav: NavigateurLangues = typeof navigator === 'undefined' ? undefined : navigator,
): Locale {
  const etiquettes = [...(nav?.languages ?? []), nav?.language];
  for (const e of etiquettes) {
    if (typeof e !== 'string' || !e) continue;
    const base = e.trim().toLowerCase().split(/[-_]/)[0];
    if (estLocale(base)) return base;
  }
  return LANGUE_DE_REPLI;
}

export type BlobLangue = { language?: unknown; langueAuto?: unknown } | null | undefined;

/** La langue que ce blob porte COMME UN CHOIX, ou `null` s'il n'en porte pas. */
export function langueChoisie(b: BlobLangue): Locale | null {
  if (!b || !estLocale(b.language)) return null;
  if (b.langueAuto === null) return b.language;
  if (b.langueAuto === undefined) return b.language === ANCIEN_DEFAUT ? null : b.language;
  return b.language === b.langueAuto ? null : b.language;
}

/**
 * La langue à appliquer : le premier CHOIX trouvé parmi les blobs, dans
 * l'ordre donné (local avant serveur, comme la fusion), sinon celle du
 * navigateur. Un choix ressort normalisé (`langueAuto: null`).
 */
export function resoudreLangue(
  blobs: BlobLangue[],
  nav?: NavigateurLangues,
): { language: Locale; langueAuto: Locale | null } {
  for (const b of blobs) {
    const choix = langueChoisie(b);
    if (choix) return { language: choix, langueAuto: null };
  }
  const auto = langueDuNavigateur(nav);
  return { language: auto, langueAuto: auto };
}
