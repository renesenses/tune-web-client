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
 *                  (`styles/roon-like/jetons-<jetons>.css`, chargé par
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
  /** Clé i18n d'une mention affichée sous le choix (marque citée, par ex.). */
  mention?: string;
}

export const INTERFACES: readonly DefinitionInterface[] = [
  { id: 'actuelle', libelle: 'roonLike.reglage.actuelle', aide: 'roonLike.reglage.actuelleAide', coquille: 'actuelle' },
  // Itération 7 (27/11/2026) : le thème « Salon » s'appelle « Roon-like »
  // (décision de Bertrand). La coquille garde son nom interne `salon`.
  { id: 'roon-like', libelle: 'roonLike.reglage.roonLike', aide: 'roonLike.reglage.roonLikeAide', coquille: 'salon', jetons: 'roon-like', mention: 'roonLike.reglage.mentionMarque' },
  // « Néomorphique » (idée de Levente, itérations 1 et 2, 26-27/11/2026) : un
  // thème de la coquille Salon. Ses jetons (`styles/neomorphique/`) habillent
  // toute l'app ; la coquille monte sa barre de transport et son écran
  // « Lecture en cours » en relief (`components/neomorphique/`).
  { id: 'neomorphique', libelle: 'neomorphique.reglage.neomorphique', aide: 'neomorphique.reglage.neomorphiqueAide', coquille: 'salon', jetons: 'neomorphique' },
];

/** Le jeu de jetons est-il celui du thème « Néomorphique » ? */
export function estJeuNeomorphique(jeu: string | null | undefined): boolean {
  return jeu === 'neomorphique';
}

export type StyleInterface = string;
export const STYLE_INTERFACE_DEFAUT: StyleInterface = 'actuelle';

export const THEMES_SALON = ['clair', 'sombre'] as const;
export type ThemeSalon = (typeof THEMES_SALON)[number];
export const THEME_SALON_DEFAUT: ThemeSalon = 'clair';

export const LIBELLE_THEME_SALON: Record<ThemeSalon, string> = {
  clair: 'roonLike.reglage.themeClair',
  sombre: 'roonLike.reglage.themeSombre',
};

/**
 * Anciens identifiants d'interface → identifiant actuel. Une préférence
 * enregistrée avant le renommage (« salon », itérations 1 à 6) garde le choix
 * de l'utilisateur : elle bascule sur « roon-like ».
 */
export const ALIAS_INTERFACES: Readonly<Record<string, string>> = { salon: 'roon-like' };

/** L'identifiant d'interface à ranger : un alias est traduit, un inconnu vaut `null`. */
export function normaliserStyleInterface(v: unknown): StyleInterface | null {
  const id = typeof v === 'string' ? (ALIAS_INTERFACES[v] ?? v) : v;
  return estStyleInterface(id) ? id : null;
}

export function estStyleInterface(v: unknown): v is StyleInterface {
  return typeof v === 'string' && INTERFACES.some((i) => i.id === v);
}

export function estThemeSalon(v: unknown): v is ThemeSalon {
  return typeof v === 'string' && (THEMES_SALON as readonly string[]).includes(v);
}

/** La définition de l'interface choisie ; une valeur inconnue vaut l'actuelle. */
export function definitionInterface(style: unknown): DefinitionInterface {
  const id = typeof style === 'string' ? (ALIAS_INTERFACES[style] ?? style) : style;
  return INTERFACES.find((i) => i.id === id) ?? INTERFACES[0];
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

/**
 * Itération 6 — l'interface active, posée sur `<html>` :
 *   - `data-interface` = le jeu de jetons (`salon`…) quand une coquille Salon
 *     est choisie, absent sinon ;
 *   - `data-salon-theme` = `clair` ou `sombre`.
 * Les jetons du thème (`jetons-roon-like.css`) et la couche commune des écrans de
 * Tune (`styles/roon-like/ecrans-tune.css`) s'y accrochent : ainsi les calques
 * posés HORS de la coquille (dialogues, bandeaux, menus, session expirée)
 * prennent la même allure. Rien n'est posé pour l'interface actuelle.
 */
export function attributsRacine(style: unknown, theme: unknown): { interface: string; theme: ThemeSalon } | null {
  const def = definitionInterface(style);
  if (def.coquille !== 'salon') return null;
  return { interface: def.jetons ?? def.id, theme: estThemeSalon(theme) ? theme : THEME_SALON_DEFAUT };
}

export function poserInterfaceSurRacine(style: unknown, theme: unknown, racine?: HTMLElement): void {
  let el = racine;
  try { el ??= document.documentElement; } catch { return; }
  if (!el) return;
  const a = attributsRacine(style, theme);
  if (!a) {
    el.removeAttribute('data-interface');
    el.removeAttribute('data-salon-theme');
    return;
  }
  el.setAttribute('data-interface', a.interface);
  el.setAttribute('data-salon-theme', a.theme);
}

/** Itération 7 : les icônes de zone de Rémi s'affichent dans le thème Roon-like,
 *  et dans le thème Néomorphique (itération 2, 27/11/2026). */
export function iconesDeZoneActives(style: unknown): boolean {
  const id = definitionInterface(style).id;
  return id === 'roon-like' || id === 'neomorphique';
}

/** Les clés i18n du réglage « clair / sombre » de la coquille Salon : celles
 *  du thème choisi (« Thème Roon-like », « Thème Néomorphique »). */
export function libellesThemeCoquille(style: unknown): { titre: string; aide: string } {
  return definitionInterface(style).id === 'neomorphique'
    ? { titre: 'neomorphique.reglage.theme', aide: 'neomorphique.reglage.themeAide' }
    : { titre: 'roonLike.reglage.theme', aide: 'roonLike.reglage.themeAide' };
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
  | { page: 'lecture' }
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
    // Itération 8 : « Lecture en cours » a sa page Roon-like.
    case 'nowplaying': return { page: 'lecture' };
    // Itération 8 : les quatre vues sans écran dans la coquille ouvrent
    // l'écran de Tune qui les contient (la vue est complétée par ShellSalon).
    case 'services': case 'bandcamp': return { page: 'tune', vue: 'streaming' };
    case 'radiofavorites': return { page: 'tune', vue: 'radios' };
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

/**
 * Au-delà de ce nombre de caractères, le titre d'une fiche d'album passe en
 * « titre long » : police plus petite sur une colonne plus large, coupé après
 * quelques lignes (`--s-taille-titre-album-long`, `--s-lignes-titre-album`).
 * En deçà, il garde la grande police et se replie sur deux lignes, comme la
 * référence (« I Am / Alicia »).
 */
export const TITRE_ALBUM_LONG = 24;
export function titreAlbumLong(titre: string | null | undefined): boolean {
  return [...(titre ?? '').trim()].length > TITRE_ALBUM_LONG;
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

/* ── Lecture en cours (itération 8) ─────────────────────────────────── */

/** « FLAC · 96 kHz · 24 bit » : ce que la piste porte, sans rien inventer. */
export function qualiteDeLaPiste(p: { format?: unknown; sample_rate?: number | null; bit_depth?: number | null } | null | undefined): string {
  if (!p) return '';
  const morceaux: string[] = [];
  if (typeof p.format === 'string' && p.format.trim()) morceaux.push(p.format.trim().toUpperCase());
  if (p.sample_rate && p.sample_rate > 0) {
    const khz = p.sample_rate / 1000;
    morceaux.push(`${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`);
  }
  if (p.bit_depth && p.bit_depth > 0) morceaux.push(`${p.bit_depth} bit`);
  return morceaux.join(' · ');
}

export type EtatSignal = 'bitPerfect' | 'sansPerte' | 'traite';

/** L'état du chemin du signal, en un mot (clé `roonLike.lecture.<état>`). */
export function etatDuSignal(sp: { bit_perfect?: boolean; lossless?: boolean | null } | null | undefined): EtatSignal | null {
  if (!sp) return null;
  if (sp.bit_perfect) return 'bitPerfect';
  if (sp.lossless) return 'sansPerte';
  return 'traite';
}

/* ── Discographie d'un artiste en sections (27/11/2026) ──────────────── */

export type SectionDiscographie = 'albums' | 'singles' | 'compilations';

/**
 * Comme la référence : albums principaux, singles et EP, compilations. Le
 * type vient de `release_type` (sinon `inferred_release_type`, sinon le
 * drapeau `is_compilation`) ; sans type, c'est un album. L'ordre d'entrée
 * est gardé dans chaque section ; une section vide n'est pas rendue.
 */
export function sectionsDiscographie<T extends { release_type?: string | null; inferred_release_type?: string | null; is_compilation?: boolean | null }>(
  albums: readonly T[],
): { section: SectionDiscographie; albums: T[] }[] {
  const par: Record<SectionDiscographie, T[]> = { albums: [], singles: [], compilations: [] };
  for (const a of albums) {
    const t = String(a.release_type ?? a.inferred_release_type ?? '').toLowerCase();
    if (t === 'single' || t === 'ep') par.singles.push(a);
    else if (t === 'compilation' || a.is_compilation) par.compilations.push(a);
    else par.albums.push(a);
  }
  return (['albums', 'singles', 'compilations'] as const).filter((k) => par[k].length).map((k) => ({ section: k, albums: par[k] }));
}
