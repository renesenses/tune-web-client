/**
 * Interface « Salon » — seconde coquille du client, choisie dans Réglages ›
 * Général › Interface (itération 1, 25/11/2026).
 *
 * Deux préférences, rangées dans `ui_preferences` comme le thème et la taille
 * du texte (donc par profil, synchronisées avec le serveur) :
 *
 *   - `interfaceStyle` : `actuelle` (défaut) ou `salon`. Désactivée par
 *     défaut : personne ne voit son interface changer sans l'avoir demandé ;
 *   - `salonTheme`     : `clair` (défaut) ou `sombre`, propre à Salon. Le
 *     thème de l'interface actuelle (`v2Theme`) n'est jamais réécrit.
 *
 * La bascule se fait sans recharger : `ShellV2` lit `interfaceStyle` et monte
 * l'une ou l'autre coquille ; les magasins (zones, bibliothèque, file) sont
 * les mêmes, seule la mise en page change.
 */
import type { V2Theme } from './v2Theme';

/**
 * LE REGISTRE DES INTERFACES — ajouter une interface = ajouter une entrée.
 *
 *   - `id`       : la valeur rangée dans `preferences.interfaceStyle` ;
 *   - `libelle` / `aide` : clés i18n du choix dans Réglages › Général ;
 *   - `coquille` : la mise en page montée (`actuelle` = celle de toujours,
 *                  `salon` = `components/salon/ShellSalon.svelte`) ;
 *   - `jetons`   : pour une coquille Salon, le jeu de jetons CSS qui l'habille
 *                  (`styles/salon/jetons-<jetons>.css`, chargé par
 *                  `components/salon/jetons.ts`). Un thème de plus sur la même
 *                  coquille = un jeu de jetons et une entrée ici, sans toucher
 *                  aux composants.
 *
 * L'ordre est celui de la liste à l'écran. `actuelle` reste la première et le
 * défaut.
 */
export interface DefinitionInterface {
  id: string;
  libelle: string;
  aide: string;
  coquille: 'actuelle' | 'salon';
  jetons?: string;
}

export const INTERFACES: readonly DefinitionInterface[] = [
  { id: 'actuelle', libelle: 'salon.reglage.actuelle', aide: 'salon.reglage.actuelleAide', coquille: 'actuelle' },
  { id: 'salon', libelle: 'salon.reglage.salon', aide: 'salon.reglage.salonAide', coquille: 'salon', jetons: 'salon' },
];

export type StyleInterface = string;
export const STYLE_INTERFACE_DEFAUT: StyleInterface = 'actuelle';

export const THEMES_SALON = ['clair', 'sombre'] as const;
export type ThemeSalon = (typeof THEMES_SALON)[number];
export const THEME_SALON_DEFAUT: ThemeSalon = 'clair';

export const LIBELLE_THEME_SALON: Record<ThemeSalon, string> = {
  clair: 'salon.reglage.themeClair',
  sombre: 'salon.reglage.themeSombre',
};

export function estStyleInterface(v: unknown): v is StyleInterface {
  return typeof v === 'string' && INTERFACES.some((i) => i.id === v);
}

export function estThemeSalon(v: unknown): v is ThemeSalon {
  return typeof v === 'string' && (THEMES_SALON as readonly string[]).includes(v);
}

/** La définition de l'interface choisie ; une valeur inconnue vaut l'actuelle. */
export function definitionInterface(style: unknown): DefinitionInterface {
  return INTERFACES.find((i) => i.id === style) ?? INTERFACES[0];
}

/**
 * La palette v2 posée sur `<html>` quand une coquille Salon est active. Les
 * écrans de Tune qu'elle monte tels quels (Réglages, Radios, Podcasts…) lisent
 * les jetons `--v2-*` : on leur donne la palette claire ou sombre la plus
 * proche, puis le jeu de jetons remplace l'accent par celui du thème.
 */
export function paletteV2DuSalon(theme: unknown): V2Theme {
  return theme === 'sombre' ? 'dark-grey' : 'clear-white';
}

/** Une coquille Salon est-elle l'interface choisie ? */
export function salonActif(style: unknown): boolean {
  return definitionInterface(style).coquille === 'salon';
}

/* ── Navigation interne de Salon ─────────────────────────────────────── */

/**
 * Les pages que Salon dessine lui-même. `tune` : un écran de Tune monté tel
 * quel dans la coquille (la vue est alors `activeView`).
 */
export type PageSalon =
  | { page: 'accueil' }
  | { page: 'albums' }
  | { page: 'artistes' }
  | { page: 'morceaux' }
  | { page: 'genres' }
  | { page: 'genre'; nom: string }
  | { page: 'album'; id: number }
  | { page: 'artiste'; id: number }
  | { page: 'file' }
  | { page: 'tune'; vue: string };

export function memePage(a: PageSalon, b: PageSalon): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Une vue de Tune demandée de l'extérieur (un composant partagé qui fait
 * `activeView.set(…)`) : la page Salon qui lui correspond. Les vues que Salon
 * redessine retombent sur sa page ; les autres sont montées telles quelles.
 */
export function pageDeLaVue(vue: string, opts: { album?: number | null; artiste?: number | null } = {}): PageSalon {
  if (vue === 'library' && opts.album != null) return { page: 'album', id: opts.album };
  if (vue === 'library' && opts.artiste != null) return { page: 'artiste', id: opts.artiste };
  switch (vue) {
    case 'home': return { page: 'accueil' };
    case 'library': return { page: 'albums' };
    case 'genres': return { page: 'genres' };
    case 'queue': return { page: 'file' };
    default: return { page: 'tune', vue };
  }
}

/** Initiales d'un nom (deux au plus), pour les ronds d'artiste sans photo. */
export function initiales(nom: string | null | undefined): string {
  const mots = (nom ?? '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!mots.length) return '?';
  if (mots.length === 1) return mots[0].slice(0, 2).toLocaleUpperCase();
  return (mots[0][0] + mots[1][0]).toLocaleUpperCase();
}

/** Durée en m:ss (ou h:mm:ss) depuis des millisecondes. */
export function duree(ms: number | null | undefined): string {
  if (!ms || ms < 0 || !Number.isFinite(ms)) return '0:00';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Durée totale arrondie en minutes. */
export function minutesTotales(msListe: (number | null | undefined)[]): number {
  const total = msListe.reduce<number>((acc, v) => acc + (v && v > 0 ? v : 0), 0);
  return Math.round(total / 60000);
}

/**
 * La disposition de la mosaïque des genres : trois colonnes, une tuile large
 * (deux colonnes) par rangée, qui glisse de gauche à droite d'une rangée à
 * l'autre (motif des captures de référence).
 */
export function tuileLarge(index: number): boolean {
  const rangee = Math.floor(index / 3);
  const position = index % 3;
  const motif = rangee % 3; // 0 : large en 1re position, 1 : en 2e, 2 : en 3e
  return position === motif;
}

/**
 * Jours écoulés depuis `added_at` (secondes ou millisecondes depuis l'époque :
 * les deux formes existent selon la route). `null` si la date est absente.
 */
export function joursDepuis(addedAt: number | null | undefined, maintenant = Date.now()): number | null {
  if (addedAt == null || !Number.isFinite(addedAt) || addedAt <= 0) return null;
  const ms = addedAt < 1e12 ? addedAt * 1000 : addedAt;
  return Math.max(0, Math.floor((maintenant - ms) / 86_400_000));
}

/** Le prénom à saluer : le nom affichable du profil, sinon son identifiant
 *  sans le domaine d'une adresse. */
export function prenomDuProfil(p: { name?: string | null; display_name?: string | null } | null | undefined): string {
  const n = (p?.display_name ?? '').trim() || (p?.name ?? '').trim();
  return n.includes('@') ? n.split('@')[0] : n;
}
