/**
 * LE CATALOGUE DES CHIFFRES DE L'ACCUEIL — renesenses/tune-server-rust#4527.
 *
 * Bertrand, 19/09/2026, d'après la maquette de Levente : « Chantier homepage.
 * Chiffres de la library », puis « Ce sera une ligne configurable dans la
 * homepage. Comme plein d'autres ! » et « Des chiffres (bibliothèque,
 * écoutes, …). L'unité de taille de bibliothèque peut être le To si > 1000 Go ».
 *
 * La ligne n'affiche donc plus cinq chiffres imposés : elle en propose un
 * CATALOGUE, et chacun choisit les siens.
 *
 * ## Deux familles, deux sources
 *
 * * la BIBLIOTHÈQUE — ce que la machine possède (`/library/stats`, et
 *   `/library/genres` pour le nombre de genres) ;
 * * l'ÉCOUTE — ce qui a été joué (`/dashboard/stats`).
 *
 * Mesuré sur le .18 (0.9.155) le 19/09/2026 :
 *
 * ```text
 * bibliothèque   4389 albums · 1638 artistes · 47 118 titres · 115 genres
 *                3475 h · 1 922 005 252 389 octets
 * écoute         1110 lectures · 513 titres · 341 artistes · 83 h
 * ```
 *
 * 🔴 Un chiffre dont la source ne rend RIEN ne s'affiche pas. Il ne s'affiche
 * pas à zéro : « 0 genre écouté » serait un mensonge tant que le serveur ne
 * sait pas les compter (#4527 n'est pas promu, et `main` du client part en
 * continu sur le .18). Une carte muette vaut mieux qu'une carte fausse.
 *
 * ## LOCAL ET RÉSEAU — Bertrand, 24/09/2026
 *
 * « Les chiffres de la bibliothèque mélangent les fichiers locaux et les
 * serveurs du réseau. Je veux pouvoir les distinguer. »
 *
 * Mesuré sur son .18 (0.9.162) le 24/09/2026 :
 *
 * ```text
 * titres   96 519  =  47 079 locaux  +  49 440 sur le réseau
 * albums    9 430  =   3 938 locaux  +   5 492 sur le réseau
 * ```
 *
 * Plus de la MOITIÉ de ses titres vient de serveurs multimédia, et la ligne
 * d'accueil n'en disait rien. `/library/stats` portait déjà la ventilation —
 * `tracks_by_source`, `albums_by_source` — que personne ne lisait.
 *
 * 🔴 **Deux dessins possibles, un seul retenu.**
 *
 * On aurait pu faire PARLER les cartes existantes — « 96 519 (47 079
 * locaux) », une seconde ligne, une infobulle. On ne l'a pas fait, pour deux
 * raisons :
 *
 * * changer ce qu'une carte AFFICHE change l'accueil de tout le monde, y
 *   compris de ceux qui n'ont jamais ouvert le panneau de choix. Ajouter au
 *   catalogue ne touche personne : les choix déjà enregistrés restent
 *   exactement ce qu'ils étaient ;
 * * la plupart des installations n'ont AUCUN serveur multimédia. Le .15,
 *   mesuré le même jour, rend `{"local": 50772}` et rien d'autre. Une carte
 *   « dont 0 en réseau » chez eux serait du bruit permanent au service d'une
 *   information qu'eux seuls n'ont pas.
 *
 * Donc : quatre chiffres DE PLUS au catalogue — titres locaux, titres sur le
 * réseau, albums locaux, albums sur le réseau. La ligne est déjà composée par
 * profil ; celui que la distinction intéresse la met dans sa ligne, les
 * autres ne voient rien changer.
 *
 * 🔴 `total_size_bytes` et `total_duration_ms` n'ont AUCUNE ventilation dans
 * la réponse. On n'en invente pas : pas de carte « taille locale », pas de
 * carte « heures sur le réseau », tant que le serveur ne les compte pas.
 */

/** Ce que les trois sources rapportent, chacune pouvant manquer. */
export interface SourcesChiffres {
  /** `GET /library/stats`. */
  bibliotheque?: Record<string, unknown> | null;
  /** `GET /dashboard/stats`. */
  ecoute?: Record<string, unknown> | null;
  /** `GET /library/genres` — la LONGUEUR de la liste. */
  genres?: number | null;
}

export type FamilleChiffre = 'bibliotheque' | 'ecoute';

export interface Chiffre {
  /** Identifiant stable : c'est lui qu'on enregistre, jamais le libellé. */
  id: string;
  famille: FamilleChiffre;
  /** Clé de traduction du libellé. Jamais une chaîne en dur. */
  cleLibelle: string;
  /** Nom d'icône Lucide, comme sur la maquette. */
  icone: string;
  /** La vue à ouvrir au clic — un chiffre qu'on ne peut pas ouvrir est un
   *  cul-de-sac. `null` quand aucune vue ne lui correspond. */
  vue: string | null;
  /** La valeur BRUTE, ou `null` si la source ne la porte pas. */
  valeur: (s: SourcesChiffres) => number | null;
  /** Comment l'écrire : un nombre, une durée en heures, une taille d'octets. */
  format: 'nombre' | 'heures' | 'octets';
}

const nb = (o: Record<string, unknown> | null | undefined, cle: string): number | null => {
  const v = o?.[cle];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/**
 * Un nombre pris dans une VENTILATION PAR SOURCE — `tracks_by_source`,
 * `albums_by_source`, que `/library/stats` porte ainsi :
 *
 * ```json
 * "tracks_by_source": { "local": 47079, "upnp": 49440 }
 * ```
 *
 * 🔴 Deux absences, un seul résultat : `null`.
 *
 * * un serveur ANCIEN ne rend pas du tout `tracks_by_source` — le
 *   dictionnaire manque ;
 * * une bibliothèque SANS aucun serveur multimédia rend
 *   `{"local": 50772}` — mesuré sur le .15 le 24/09/2026 : la clé `upnp`
 *   n'est pas à zéro, elle n'existe pas.
 *
 * Dans les deux cas la carte est écartée, jamais écrite à « 0 ». Un « 0 titre
 * local » sur un serveur qui ne sait pas ventiler serait un mensonge, et
 * « 0 titre sur le réseau » encombrerait la ligne de tous ceux qui n'ont
 * aucune source réseau — c'est-à-dire presque tout le monde.
 */
const nbVentile = (
  o: Record<string, unknown> | null | undefined,
  cle: string,
  source: string,
): number | null => {
  const v = o?.[cle];
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  return nb(v as Record<string, unknown>, source);
};

/**
 * LE catalogue. L'ordre ici est celui de la liste de choix, pas celui de
 * l'affichage : la ligne suit l'ordre choisi par l'utilisateur.
 */
export const CHIFFRES: readonly Chiffre[] = [
  // ── Bibliothèque ──────────────────────────────────────────────────────
  { id: 'albums', famille: 'bibliotheque', cleLibelle: 'v2.home.sAlbums', icone: 'disc-3',
    vue: 'library', valeur: (s) => nb(s.bibliotheque, 'albums'), format: 'nombre' },
  // ── Ce que le total d'albums MÊLE (voir l'en-tête du fichier) ──────────
  { id: 'albums-locaux', famille: 'bibliotheque', cleLibelle: 'v2.home.sAlbumsLocal',
    icone: 'hard-drive', vue: 'library',
    valeur: (s) => nbVentile(s.bibliotheque, 'albums_by_source', 'local'), format: 'nombre' },
  { id: 'albums-reseau', famille: 'bibliotheque', cleLibelle: 'v2.home.sAlbumsNetwork',
    icone: 'server', vue: 'library',
    valeur: (s) => nbVentile(s.bibliotheque, 'albums_by_source', 'upnp'), format: 'nombre' },
  { id: 'artistes', famille: 'bibliotheque', cleLibelle: 'v2.home.sArtists', icone: 'mic-2',
    vue: 'artists', valeur: (s) => nb(s.bibliotheque, 'artists'), format: 'nombre' },
  { id: 'titres', famille: 'bibliotheque', cleLibelle: 'v2.home.sTracks', icone: 'music-2',
    vue: 'library', valeur: (s) => nb(s.bibliotheque, 'tracks'), format: 'nombre' },
  // ── Ce que le total de titres MÊLE ────────────────────────────────────
  { id: 'titres-locaux', famille: 'bibliotheque', cleLibelle: 'v2.home.sTracksLocal',
    icone: 'hard-drive', vue: 'library',
    valeur: (s) => nbVentile(s.bibliotheque, 'tracks_by_source', 'local'), format: 'nombre' },
  { id: 'titres-reseau', famille: 'bibliotheque', cleLibelle: 'v2.home.sTracksNetwork',
    icone: 'server', vue: 'library',
    valeur: (s) => nbVentile(s.bibliotheque, 'tracks_by_source', 'upnp'), format: 'nombre' },
  { id: 'genres', famille: 'bibliotheque', cleLibelle: 'v2.home.sGenres', icone: 'shapes',
    vue: 'genres', valeur: (s) => (typeof s.genres === 'number' ? s.genres : null), format: 'nombre' },
  { id: 'duree', famille: 'bibliotheque', cleLibelle: 'v2.home.sHours', icone: 'hourglass',
    vue: 'library', valeur: (s) => nb(s.bibliotheque, 'total_duration_ms'), format: 'heures' },
  { id: 'taille', famille: 'bibliotheque', cleLibelle: 'v2.home.sSize', icone: 'hard-drive',
    vue: null, valeur: (s) => nb(s.bibliotheque, 'total_size_bytes'), format: 'octets' },

  // ── Écoute ────────────────────────────────────────────────────────────
  { id: 'lectures', famille: 'ecoute', cleLibelle: 'v2.home.sPlays', icone: 'play',
    vue: 'history', valeur: (s) => nb(s.ecoute, 'total_listens'), format: 'nombre' },
  { id: 'titres-ecoutes', famille: 'ecoute', cleLibelle: 'v2.home.sListens', icone: 'headphones',
    vue: 'history', valeur: (s) => nb(s.ecoute, 'unique_tracks'), format: 'nombre' },
  { id: 'artistes-ecoutes', famille: 'ecoute', cleLibelle: 'v2.home.sArtistsHeard', icone: 'mic-2',
    vue: 'history', valeur: (s) => nb(s.ecoute, 'unique_artists'), format: 'nombre' },
  { id: 'heures-ecoutees', famille: 'ecoute', cleLibelle: 'v2.home.sHoursHeard', icone: 'hourglass',
    vue: 'history', valeur: (s) => nb(s.ecoute, 'total_duration_ms'), format: 'heures' },
  // 🔴 Ce champ n'existe que depuis tune-server-rust#4527, non promu. Tant
  // qu'il manque, `valeur` rend `null` et la carte NE S'AFFICHE PAS.
  { id: 'genres-ecoutes', famille: 'ecoute', cleLibelle: 'v2.home.sGenresHeard', icone: 'shapes',
    vue: 'history', valeur: (s) => nb(s.ecoute, 'unique_genres'), format: 'nombre' },
];

/** Ce que la ligne montre quand personne n'a encore choisi : un mélange des
 *  deux familles, pour que la ligne dise à la fois ce qu'on a et ce qu'on écoute. */
export const CHOIX_DEFAUT: readonly string[] = [
  'albums', 'artistes', 'lectures', 'heures-ecoutees', 'taille',
];

export function chiffreParId(id: string): Chiffre | null {
  return CHIFFRES.find((c) => c.id === id) ?? null;
}

/**
 * Les sources qu'il faut vraiment interroger pour un choix donné.
 *
 * On n'appelle pas `/library/genres` — 115 lignes — si aucune carte de genre
 * n'est affichée.
 */
export function sourcesNecessaires(ids: readonly string[]): {
  bibliotheque: boolean;
  ecoute: boolean;
  genres: boolean;
} {
  const choisis = ids.map(chiffreParId).filter((c): c is Chiffre => !!c);
  return {
    bibliotheque: choisis.some((c) => c.famille === 'bibliotheque' && c.id !== 'genres'),
    ecoute: choisis.some((c) => c.famille === 'ecoute'),
    genres: choisis.some((c) => c.id === 'genres'),
  };
}

/* ------------------------------------------------------------------ */
/* Les formats                                                        */
/* ------------------------------------------------------------------ */

/**
 * Un nombre écrit dans la langue de l'écran : `1 110` en français,
 * `1,110` en anglais.
 *
 * L'écran affichait `4389` et `1790.0 Gio` — un point anglais dans une page
 * française, et aucun séparateur de milliers.
 */
export function formaterNombre(n: number, langue: string): string {
  try {
    return new Intl.NumberFormat(langue).format(n);
  } catch {
    return String(n);
  }
}

/** Des millisecondes en heures entières. */
export function formaterHeures(ms: number, langue: string): string {
  return formaterNombre(Math.round(ms / 3_600_000), langue);
}

/**
 * Une taille d'octets, en Go ou en To.
 *
 * 🔴 Bertrand, 19/09/2026 : « L'unité de taille de bibliothèque peut être le
 * To si > 1000 Go ». Ses 1 922 005 252 389 octets s'écrivaient `1790.0 Gio` ;
 * ils s'écrivent désormais **1,9 To**.
 *
 * Unités DÉCIMALES (1000), celles que les fabricants impriment sur les
 * disques, et celles que Bertrand a nommées — pas les Gio/Tio binaires.
 */
export function formaterOctets(octets: number, langue: string): string {
  const go = octets / 1_000_000_000;
  const [valeur, unite] = go >= 1000 ? [go / 1000, 'To'] : [go, 'Go'];
  let texte: string;
  try {
    texte = new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(valeur);
  } catch {
    texte = valeur.toFixed(1);
  }
  return `${texte} ${unite}`;
}

export function formater(c: Chiffre, brut: number, langue: string): string {
  if (c.format === 'heures') return formaterHeures(brut, langue);
  if (c.format === 'octets') return formaterOctets(brut, langue);
  return formaterNombre(brut, langue);
}

/* ------------------------------------------------------------------ */
/* Ce que la ligne affiche                                            */
/* ------------------------------------------------------------------ */

export interface CarteChiffre {
  id: string;
  cleLibelle: string;
  icone: string;
  vue: string | null;
  texte: string;
}

/**
 * Les cartes à dessiner, dans l'ordre choisi.
 *
 * 🔴 Un chiffre dont la source ne rend rien est ÉCARTÉ, pas mis à zéro — et
 * un identifiant inconnu (un chiffre retiré du catalogue, ou pas encore
 * connu de cette version) est ignoré ici SANS être effacé du choix
 * enregistré. Effacer ce qu'on ne connaît pas encore, c'est le défaut relevé
 * dans `PageWidgets` le 19/09 : une disposition enregistrée pendant un
 * chargement purgeait les identifiants absents.
 */
export function cartes(
  ids: readonly string[],
  sources: SourcesChiffres,
  langue: string,
): CarteChiffre[] {
  const vues: CarteChiffre[] = [];
  for (const id of ids) {
    const c = chiffreParId(id);
    if (!c) continue;
    const brut = c.valeur(sources);
    if (brut == null) continue;
    vues.push({
      id: c.id,
      cleLibelle: c.cleLibelle,
      icone: c.icone,
      vue: c.vue,
      texte: formater(c, brut, langue),
    });
  }
  return vues;
}

/**
 * Ce qu'il faut ENREGISTRER : le choix courant, suivi des identifiants que
 * cette version ne sait pas nommer.
 *
 * 🔴 Un chiffre ajouté par une version plus récente — ou servi par un serveur
 * plus récent — ne doit pas disparaître parce qu'une version plus ancienne a
 * ouvert l'accueil et enregistré. C'est le défaut déjà payé sur la
 * disposition des widgets (#987) : ce qu'on ne sait pas nommer, on le garde.
 */
export function choixAEnregistrer(
  choix: readonly string[],
  enregistres: readonly string[] | null | undefined,
): string[] {
  const inconnus = (enregistres ?? []).filter(
    (id) => !chiffreParId(id) && !choix.includes(id),
  );
  return [...choix, ...inconnus];
}

/**
 * Basculer un chiffre dans le choix, en gardant l'ORDRE de sélection.
 *
 * L'ordre du catalogue n'est pas celui de la ligne : on affiche dans l'ordre
 * où l'utilisateur a coché, pour qu'il retrouve ce qu'il a composé.
 */
export function basculer(ids: readonly string[], id: string, maximum = 6): string[] {
  if (!chiffreParId(id)) return [...ids];
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  if (ids.length >= maximum) return [...ids];
  return [...ids, id];
}
