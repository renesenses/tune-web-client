/**
 * tune-server-rust#5593 — le périmètre des analyses de fond (ReplayGain,
 * plage dynamique, empreintes, analyse acoustique), étape 1 du chantier.
 *
 * - `background_analysis_excluded_roots` : les DOSSIERS exclus. Le serveur
 *   compare chaque entrée comme un préfixe de chemin borné par le séparateur,
 *   les deux séparateurs (`\` et `/`) confondus : une racine de bibliothèque
 *   ou n'importe quel sous-dossier. Les cases de la liste des dossiers
 *   écrivent les racines ; le champ « Dossiers exclus » écrit les
 *   sous-dossiers, dans la MÊME liste.
 * - `background_analysis_excluded_genres` : les genres écartés de TOUTES les
 *   passes. Une piste sans genre n'est jamais écartée.
 *
 * Le serveur refuse toute autre forme qu'un tableau de chaînes.
 */
export const CLE_DOSSIERS_EXCLUS = 'background_analysis_excluded_roots';
export const CLE_GENRES_EXCLUS = 'background_analysis_excluded_genres';

/** Un chemin comparable : séparateurs `/`, sans séparateur final (sauf `/`). */
export function cheminComparable(chemin: string): string {
  const c = chemin.trim().replace(/\\/g, '/');
  const sans = c.replace(/\/+$/, '');
  return sans === '' && c.startsWith('/') ? '/' : sans;
}

/** `chemin` est `racine` elle-même, ou se trouve dessous. Même règle que le
 *  serveur : préfixe borné par le séparateur, la casse compte. */
export function estSous(chemin: string, racine: string): boolean {
  const c = cheminComparable(chemin);
  const r = cheminComparable(racine);
  if (!r) return false;
  if (c === r) return true;
  return c.startsWith(r === '/' ? '/' : r + '/');
}

/** Les entrées exclues qui ne sont PAS une racine déclarée : les sous-dossiers
 *  (et, au pire, une ancienne racine retirée de la bibliothèque). */
export function sousDossiersExclus(exclus: string[], racines: string[]): string[] {
  const r = new Set(racines.map(cheminComparable));
  return exclus.filter((e) => !r.has(cheminComparable(e)));
}

export type RefusDossier = 'vide' | 'horsRacine' | 'racine' | 'deja';

/**
 * Ajoute un sous-dossier à la liste des exclus. Refusé s'il est vide, s'il
 * n'est sous aucune racine déclarée (il ne correspondrait à aucune piste :
 * la casse compte), s'il EST une racine (la case de la racine le fait) ou s'il
 * est déjà couvert par une entrée exclue.
 */
export function ajouterDossierExclu(
  exclus: string[],
  saisie: string,
  racines: string[],
): { liste: string[] } | { refus: RefusDossier } {
  const brut = saisie.trim();
  if (!brut || !cheminComparable(brut)) return { refus: 'vide' };
  if (racines.some((r) => cheminComparable(r) === cheminComparable(brut))) return { refus: 'racine' };
  if (!racines.some((r) => estSous(brut, r))) return { refus: 'horsRacine' };
  if (exclus.some((e) => estSous(brut, e))) return { refus: 'deja' };
  return { liste: [...exclus, brut] };
}

/** Retire une entrée exclue, telle qu'écrite. */
export function retirerDossierExclu(exclus: string[], entree: string): string[] {
  return exclus.filter((e) => e !== entree);
}

/**
 * Étape 2 du chantier (décision de Bertrand du 13/10) — le périmètre PROPRE
 * à une passe, par-dessus le périmètre commun :
 * `{ "<passe>": { "excluded_roots": [...], "excluded_genres": [...] } }`.
 * Un champ absent HÉRITE (du commun ; du ReplayGain pour les empreintes) ;
 * un tableau, même vide, REMPLACE. Même règle que le serveur
 * (`taches_de_fond::perimetre::perimetre_de`).
 */
export const CLE_PAR_PASSE = 'background_analysis_scope_by_pass';

export const PASSES = ['replaygain', 'dynamic_range', 'fingerprints', 'audio_embedding'] as const;
export type Passe = (typeof PASSES)[number];
export type Champ = 'excluded_roots' | 'excluded_genres';
export type ParPasse = Partial<Record<Passe, Partial<Record<Champ, string[]>>>>;

/** De qui une passe hérite un champ qu'elle ne règle pas : `null` = le commun. */
export function heritee(passe: Passe): Passe | null {
  return passe === 'fingerprints' ? 'replaygain' : null;
}

function chaines(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
}

/** L'objet publié par `GET /system/config`, nettoyé. `null` : le serveur ne
 *  publie pas le réglage (l'écran n'affiche pas la section). */
export function parPasseDepuisConfig(v: unknown): ParPasse | null {
  if (v === undefined) return null;
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return {};
  const sortie: ParPasse = {};
  for (const p of PASSES) {
    const o = (v as Record<string, unknown>)[p];
    if (!o || typeof o !== 'object') continue;
    const propre: Partial<Record<Champ, string[]>> = {};
    for (const c of ['excluded_roots', 'excluded_genres'] as Champ[]) {
      const l = chaines((o as Record<string, unknown>)[c]);
      if (l) propre[c] = l;
    }
    if (Object.keys(propre).length) sortie[p] = propre;
  }
  return sortie;
}

/** Le champ PROPRE d'une passe, ou `null` s'il hérite. */
export function champPropre(pp: ParPasse, passe: Passe, champ: Champ): string[] | null {
  return pp[passe]?.[champ] ?? null;
}

/** La valeur EN VIGUEUR d'un champ pour une passe. */
export function champEffectif(pp: ParPasse, commun: Record<Champ, string[]>, passe: Passe, champ: Champ): string[] {
  const propre = champPropre(pp, passe, champ);
  if (propre) return propre;
  const h = heritee(passe);
  return h ? champEffectif(pp, commun, h, champ) : commun[champ];
}

/** Un nouvel objet où le champ de la passe vaut `valeur` (`null` : hérite). */
export function avecChamp(pp: ParPasse, passe: Passe, champ: Champ, valeur: string[] | null): ParPasse {
  const sortie: ParPasse = JSON.parse(JSON.stringify(pp));
  const propre = { ...(sortie[passe] ?? {}) };
  if (valeur === null) delete propre[champ];
  else propre[champ] = valeur;
  if (Object.keys(propre).length) sortie[passe] = propre;
  else delete sortie[passe];
  return sortie;
}

/** Une saisie « un dossier par ligne » → la liste, rognée, sans vide ni doublon. */
export function lireSaisieDeDossiers(texte: string): string[] {
  const vus = new Set<string>();
  const sortie: string[] = [];
  for (const l of texte.split(/\r?\n/)) {
    const d = l.trim();
    if (d && !vus.has(d)) { vus.add(d); sortie.push(d); }
  }
  return sortie;
}

/**
 * Décision du 13/10 : un avertissement visible quand un genre est exclu du
 * ReplayGain — ces pistes seront lues sans normalisation du volume. Vrai si
 * le ReplayGain, en vigueur, exclut au moins un genre.
 */
export function genresSansNormalisation(pp: ParPasse | null, genresCommuns: string[]): boolean {
  return champEffectif(pp ?? {}, { excluded_roots: [], excluded_genres: genresCommuns }, 'replaygain', 'excluded_genres').length > 0;
}

/**
 * Étape 3 — ce que rend `GET /system/analysis-scope/counts` : combien de
 * pistes chaque entrée retire. `commun` et `parPasse` associent l'entrée
 * (telle que réglée) à son nombre de pistes.
 */
export interface ComptesPerimetre {
  commun: Record<Champ, Map<string, number>>;
  parPasse: Partial<Record<Passe, Record<Champ, Map<string, number>>>>;
}

function carte(v: unknown): Map<string, number> {
  const m = new Map<string, number>();
  if (!Array.isArray(v)) return m;
  for (const e of v) {
    if (e && typeof e.value === 'string' && typeof e.tracks === 'number') m.set(e.value, e.tracks);
  }
  return m;
}

export function comptesDepuisReponse(r: any): ComptesPerimetre {
  const comptes: ComptesPerimetre = {
    commun: { excluded_roots: carte(r?.common?.excluded_roots), excluded_genres: carte(r?.common?.excluded_genres) },
    parPasse: {},
  };
  for (const p of PASSES) {
    const o = r?.by_pass?.[p];
    if (o) comptes.parPasse[p] = { excluded_roots: carte(o.excluded_roots), excluded_genres: carte(o.excluded_genres) };
  }
  return comptes;
}

/** Le nombre de pistes d'une entrée, ou `null` si le serveur ne l'a pas compté. */
export function compteDe(comptes: ComptesPerimetre | null, passe: Passe | null, champ: Champ, entree: string): number | null {
  if (!comptes) return null;
  const m = passe ? comptes.parPasse[passe]?.[champ] : comptes.commun[champ];
  const n = m?.get(entree);
  return typeof n === 'number' ? n : null;
}
