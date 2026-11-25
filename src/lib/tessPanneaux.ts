/**
 * TESS W2 — les panneaux de réglages des moteurs existants, vus du client.
 *
 * La colonne de droite de l'écran TESS (maquette A1) règle le greffon choisi
 * DANS la chaîne de la zone : ses `settings` partent avec la chaîne entière
 * par `PUT /zones/{id}/tess`, et le serveur les recopie dans les anciennes
 * clés (écriture croisée de T02). L'ancien écran et TESS restent donc
 * d'accord sans que l'un parle à l'autre.
 *
 * Fonctions PURES seulement (testées sans écran). Règles :
 *   - on part des `settings` BRUTS reçus et on ne remplace que les champs que
 *     le panneau édite : un champ inconnu de ce client survit au `PUT`
 *     (contrat § 0, reste n° 1 de la relecture de T01) ;
 *   - un réglage complet est écrit dès le premier geste : le serveur valide
 *     les `settings` contre le profil du moteur (`EqProfile`,
 *     `CrossfeedSettings`, `ChannelRemapSettings`) et refuse un objet
 *     incomplet (409 `invalid_settings`) ;
 *   - les bornes sont celles des anciens écrans (même moteur, mêmes limites).
 */
import type { EqBand, DroitsTess } from './api';
import { ECRANS_GREFFONS_NATIFS } from './greffonsAudioNatifs';
import type { CatalogueTess, ChaineTess, LienGreffonTess } from './tess';
import { descripteur, estPremium, liensDe } from './tess';
import { GRILLES_EQ, Q_GRILLE_EQ, reechantillonnerCourbe } from './eqGrilles';
import { bandesGraphiques, courbesDepuisBandes } from './eqGraphicChannels';
import { estCourbeGraphique } from './eqHydratation';
import { CF_MAX_AMOUNT, CF_MAX_DELAY, CF_COUPURE_MIN, CF_COUPURE_MAX, CF_PENTE_MIN, CF_PENTE_MAX } from './crossfeed';

type Reglages = Record<string, unknown>;

/** Le panneau que la colonne de droite montre pour un greffon. */
export type GenrePanneau =
  | 'eq-graphique'
  | 'eq-parametrique'
  | 'correction-piece'
  | 'crossfeed'
  | 'reaffectation'
  | 'convolution'
  | 'vide'
  | 'ancien-ecran';

export function genrePanneau(id: string): GenrePanneau {
  switch (id) {
    case 'equalizer-graphic': return 'eq-graphique';
    case 'equalizer-parametric':
    case 'equalizer-headphone': return 'eq-parametrique';
    // Une correction de pièce se CALCULE (mesure ou estimation) : la modifier
    // à la main la ferait passer pour une mesure (D1). Lecture seule ici.
    case 'room-correction': return 'correction-piece';
    case 'crossfeed': return 'crossfeed';
    case 'channel-remap': return 'reaffectation';
    case 'convolution': return 'convolution';
    case 'mono-downmix':
    case 'declick-live': return 'vide';
    // Paquets (natifs tiers) : leurs réglages restent dans leur écran.
    default: return 'ancien-ecran';
  }
}

/** Pourquoi un greffon est verrouillé : le motif que le serveur a publié. */
export type MotifVerrouTess = 'premium_required' | 'plugin_unavailable' | 'plugin_not_installed';

/**
 * Le verrou d'un greffon. C'est le SERVEUR qui sait si la licence couvre un
 * greffon et s'il est disponible : `plugins[]` de `GET /tess/catalog`
 * (`entitled`, `available`, `reason`) fait foi. La licence lue côté client
 * (`premiumLocal`) n'est qu'un repli : serveur ancien qui ne publie pas
 * `plugins[]` (`droits === null`), ou greffon dont le serveur ne dit rien.
 */
export function motifDuVerrou(
  id: string, droits: DroitsTess, catalogue: CatalogueTess | null | undefined, premiumLocal: boolean,
): MotifVerrouTess | null {
  const d = droits ? droits[id] : undefined;
  if (d) {
    // rc14 — pas encore installé, mais installable : le serveur nomme le
    // paquet. Sans paquet nommé, c'est l'ancien « indisponible ».
    if (d.reason === 'plugin_not_installed' && paquetAInstaller(id, droits)) return 'plugin_not_installed';
    if (d.reason === 'plugin_unavailable' || d.available === false) return 'plugin_unavailable';
    if (d.entitled === false || d.reason === 'premium_required') return 'premium_required';
    if (d.entitled === true) return null;
  }
  // Serveur ancien (sans `plugins[]`), greffon absent de la liste, ou droit
  // non dit (`entitled` nul, sans motif) : repli sur la licence locale.
  return !premiumLocal && estPremium(descripteur(catalogue, id)) ? 'premium_required' : null;
}

/**
 * rc14 (recette du 24/11, point 6) — la clé de la pastille d'un greffon
 * verrouillé. `exclusifAvec` : l'autre membre de son groupe exclusif déjà
 * actif dans la chaîne (`conflitExclusif`), ou `null`.
 *
 * Le serveur coupe le greffon historique d'un groupe dès qu'un autre membre
 * est en service, et le publie alors `available: false` : sans la chaîne,
 * on ne le distingue pas d'un greffon vraiment indisponible. Avec un membre
 * concurrent actif, c'est une exclusivité (« EXCLUSIF »), comme le dit
 * l'explication sous la ligne ; « INDISPONIBLE » reste pour un vrai
 * `plugin_unavailable`. La licence et l'installation gardent leur pastille.
 */
export function cleDuBadgeVerrou(motif: MotifVerrouTess, exclusifAvec: string | null): string {
  if (motif === 'plugin_not_installed') return 'tess.notInstalledBadge';
  if (motif === 'plugin_unavailable') return exclusifAvec ? 'tess.exclusiveBadge' : 'tess.unavailableBadge';
  return 'tess.locked';
}

/**
 * rc14 — le paquet à installer pour rendre ce greffon disponible
 * (`install_package` de `GET /tess/catalog`), ou `null` : serveur ancien,
 * greffon disponible, ou indisponible sans installation possible.
 */
export function paquetAInstaller(id: string, droits: DroitsTess): string | null {
  const d = droits ? droits[id] : undefined;
  if (!d || d.reason !== 'plugin_not_installed') return null;
  return typeof d.install_package === 'string' && d.install_package ? d.install_package : null;
}

/**
 * L'écran historique d'un greffon, s'il en a un : il reste accessible, et
 * l'écriture croisée de T02 le garde d'accord avec TESS.
 */
export function vueHistorique(id: string): string | null {
  switch (id) {
    case 'equalizer-graphic':
    case 'equalizer-parametric':
    case 'equalizer-headphone': return 'equalizer';
    case 'room-correction': return 'roomcorrection';
    case 'crossfeed': return 'crossfeed';
    case 'channel-remap': return 'reaffectation';
    // Greffons natifs tiers (paquets) : l'écran que leur donne l'écran Extensions.
    default: return ECRANS_GREFFONS_NATIFS[id] ?? null;
  }
}

const estObjet = (x: unknown): x is Reglages => typeof x === 'object' && x !== null && !Array.isArray(x);
const fini = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Copie de la chaîne BRUTE où seuls les `settings` du greffon `id` changent. */
export function avecReglages(chaine: ChaineTess, id: string, reglages: Reglages): ChaineTess {
  return {
    ...chaine,
    plugins: liensDe(chaine).map((l): LienGreffonTess => (l.id === id ? { ...l, settings: reglages } : l)),
  };
}

// ── Égaliseurs (un même moteur, trois façades) ─────────────────────────────

/** Le profil d'égaliseur complet (`EqProfile` sans `enabled`, que porte le maillon). */
export function reglagesEq(s: unknown): Reglages & { bands: EqBand[] } {
  const r = estObjet(s) ? s : {};
  return {
    listening: 'speakers',
    room_size: 'medium',
    speaker_placement: 'free_standing',
    bass_gain_db: 0,
    mid_gain_db: 0,
    treble_gain_db: 0,
    ...r,
    bands: Array.isArray(r.bands) ? (r.bands as EqBand[]) : [],
  };
}

export interface CourbeGraphique {
  /** 10, 15 ou 31 bandes. */
  taille: number;
  gauche: number[];
  /** `null` : courbes liées (une seule passe, sans canal). */
  droite: number[] | null;
}

/**
 * La courbe graphique portée par des réglages, ou `null` si les bandes ne
 * sont pas réémissibles sans perte par le graphique (le panneau renvoie
 * alors à l'écran Égaliseur, qui sait les afficher).
 * Sans bandes (curseurs grave / médium / aigu), une grille de 10 à plat.
 */
export function courbeGraphique(s: unknown): CourbeGraphique | null {
  const bandes = reglagesEq(s).bands;
  if (bandes.length === 0) return { taille: 10, gauche: Array(10).fill(0), droite: null };
  for (const taille of [10, 15, 31]) {
    if (estCourbeGraphique(bandes, GRILLES_EQ[taille], Q_GRILLE_EQ[taille])) {
      return { taille, ...courbesDepuisBandes(bandes, taille) };
    }
  }
  return null;
}

/** Les réglages avec la courbe graphique `c` (le reste du profil intact). */
export function avecCourbeGraphique(s: unknown, c: CourbeGraphique): Reglages {
  const grille = GRILLES_EQ[c.taille] ?? GRILLES_EQ[10];
  const q = Q_GRILLE_EQ[c.taille] ?? 1.0;
  return { ...reglagesEq(s), bands: bandesGraphiques(grille, c.gauche, c.droite, q) };
}

/** Change de résolution sans remettre la courbe à plat. */
export function changerTaille(c: CourbeGraphique, taille: number): CourbeGraphique {
  const de = GRILLES_EQ[c.taille] ?? GRILLES_EQ[10];
  const vers = GRILLES_EQ[taille];
  if (!vers || taille === c.taille) return c;
  return {
    taille,
    gauche: reechantillonnerCourbe(c.gauche, de, vers),
    droite: c.droite ? reechantillonnerCourbe(c.droite, de, vers) : null,
  };
}

export const GAIN_EQ_MIN = -12;
export const GAIN_EQ_MAX = 12;

/** Un point de la courbe (les deux canaux s'ils sont liés, sinon celui choisi). */
export function avecGain(c: CourbeGraphique, rang: number, gain: number, canal: 'gauche' | 'droite' = 'gauche'): CourbeGraphique {
  const g = Math.round(borner(gain, GAIN_EQ_MIN, GAIN_EQ_MAX) * 2) / 2;
  if (canal === 'droite' && c.droite) {
    return { ...c, droite: c.droite.map((v, i) => (i === rang ? g : v)) };
  }
  return { ...c, gauche: c.gauche.map((v, i) => (i === rang ? g : v)) };
}

/** Les réglages avec ces bandes paramétriques (le reste du profil intact). */
export function avecBandes(s: unknown, bandes: EqBand[]): Reglages {
  return { ...reglagesEq(s), bands: bandes.map((b) => ({ ...b })) };
}

// ── Crossfeed ──────────────────────────────────────────────────────────────

export interface ReglagesCrossfeedTess {
  amount: number;
  delay_ms: number;
  cutoff_hz: number;
  slope_db_per_octave: number;
  head_shadow_enabled: boolean;
}

/** Les réglages du crossfeed, complétés par les valeurs par défaut du moteur et bornés. */
export function reglagesCrossfeedTess(s: unknown): Reglages & ReglagesCrossfeedTess {
  const r = estObjet(s) ? s : {};
  return {
    ...r,
    amount: borner(fini(r.amount) ? r.amount : 0.3, 0, CF_MAX_AMOUNT),
    delay_ms: borner(fini(r.delay_ms) ? r.delay_ms : 0.3, 0, CF_MAX_DELAY),
    cutoff_hz: borner(fini(r.cutoff_hz) ? r.cutoff_hz : 700, CF_COUPURE_MIN, CF_COUPURE_MAX),
    slope_db_per_octave: borner(fini(r.slope_db_per_octave) ? r.slope_db_per_octave : 6, CF_PENTE_MIN, CF_PENTE_MAX),
    head_shadow_enabled: r.head_shadow_enabled === true,
  };
}

// ── Réaffectation des canaux ───────────────────────────────────────────────

export const CANAUX_MAX = 32;

export interface ReglagesReaffectationTess {
  inputs: number;
  outputs: number;
  /** Une ligne par SORTIE, une colonne par ENTRÉE ; `null` = muet. */
  gains_db: (number | null)[][];
  normalize: boolean;
  preset: string | null;
}

const identite = (n: number) => Array.from({ length: n }, (_, o) => Array.from({ length: n }, (_, i) => (i === o ? 0 : null)));

/** Les réglages de la réaffectation, matrice ramenée à `outputs × inputs`. */
export function reglagesReaffectation(s: unknown): Reglages & ReglagesReaffectationTess {
  const r = estObjet(s) ? s : {};
  const inputs = borner(Math.round(fini(r.inputs) ? r.inputs : 2), 1, CANAUX_MAX);
  const outputs = borner(Math.round(fini(r.outputs) ? r.outputs : 2), 1, CANAUX_MAX);
  const source = Array.isArray(r.gains_db) ? (r.gains_db as unknown[]) : identite(2);
  const gains_db = Array.from({ length: outputs }, (_, o) => {
    const ligne = Array.isArray(source[o]) ? (source[o] as unknown[]) : [];
    return Array.from({ length: inputs }, (_, i) => (fini(ligne[i]) ? (ligne[i] as number) : null));
  });
  return {
    ...r,
    inputs,
    outputs,
    gains_db,
    normalize: r.normalize !== false,
    preset: typeof r.preset === 'string' ? r.preset : null,
  };
}

/** Une case de la matrice (`null` : muet). Le préréglage d'origine ne vaut plus. */
export function avecCase(s: unknown, sortie: number, entree: number, gain: number | null): Reglages {
  const r = reglagesReaffectation(s);
  const g = gain == null || !Number.isFinite(gain) ? null : Math.round(borner(gain, -60, 12) * 10) / 10;
  return {
    ...r,
    preset: null,
    gains_db: r.gains_db.map((l, o) => l.map((v, i) => (o === sortie && i === entree ? g : v))),
  };
}

/** Nouvelles dimensions : la matrice garde ce qui tient, le reste est muet. */
export function avecDimensions(s: unknown, inputs: number, outputs: number): Reglages {
  const r = reglagesReaffectation(s);
  return reglagesReaffectation({ ...r, inputs, outputs, preset: null });
}
