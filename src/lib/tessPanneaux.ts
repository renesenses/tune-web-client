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
import type { CatalogueTess, ChaineTess, LienGreffonTess, ReponseTessZone } from './tess';
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
  | 'enceintes'
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
    // rc14 (GO du 25/11, demande de Rémi) — le réglage des enceintes.
    case 'speaker-setup': return 'enceintes';
    case 'mono-downmix':
    case 'declick-live': return 'vide';
    // POINT D'ENTRÉE du greffon Casque (OPRA, recherche AutoEq), fait par un
    // autre agent (refonte rc14, décision du 25/11) : il ajoute ici son `case`
    // avec son genre de panneau, et branche son composant dans
    // `ReglagesGreffonTess`. D'ici là, un id inconnu tombe sur « son écran ».
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

/**
 * rc14 (lot W8) — l'écran que « Réglages avancés » ouvre depuis le panneau
 * TESS, ou `null`. Avec TESS, les anciennes entrées de la barre sont masquées
 * (`VUES_REMPLACEES_PAR_TESS`) : ce lien est le seul chemin vers leurs
 * fonctions propres (préréglages et import PEQ de l'Égaliseur, préréglages du
 * Crossfeed, tous les réglages de Crossfeed Pro et de Crosstalk).
 *
 * 🔴 Il ne contourne PAS le verrou : un greffon verrouillé (quel que soit le
 * motif : `premium_required`, `plugin_not_installed`, `plugin_unavailable`)
 * n'a pas de lien. Règle de Bertrand : en Free, TESS montre tous les
 * greffons, mais les Premium ne sont ni activables ni réglables. Le serveur
 * refuse de toute façon (402) ; le client n'ouvre pas la porte.
 */
export function vueReglagesAvances(id: string, motif: MotifVerrouTess | null): string | null {
  // Tout verrou ferme le lien : Premium, mais aussi greffon non installé ou
  // indisponible — l'écran d'un greffon non autorisé ne s'ouvre pas d'ici.
  if (motif !== null) return null;
  // Refonte rc14 (Rémi, GO de Bertrand) : l'égaliseur vit TOUT ENTIER dans
  // TESS. Plus de lien vers l'ancien écran Égaliseur depuis ses façades.
  if (FACADES_EGALISEUR.has(id)) return null;
  return vueHistorique(id);
}

/** Les façades de l'égaliseur (un moteur) : aucune ne renvoie à l'ancien écran. */
export const FACADES_EGALISEUR = new Set(['equalizer-graphic', 'equalizer-parametric', 'equalizer-headphone']);

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
export function avecGain(
  c: CourbeGraphique, rang: number, gain: number, canal: 'gauche' | 'droite' = 'gauche',
  bornes: { min: number; max: number } = { min: GAIN_EQ_MIN, max: GAIN_EQ_MAX },
): CourbeGraphique {
  const g = Math.round(borner(gain, bornes.min, bornes.max) * 2) / 2;
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

// ── Refonte rc14 : bornes de gain publiées par le serveur ─────────────────

export interface BornesGain { min: number; max: number }

/** Les bornes d'avant (et de tout serveur qui n'en publie pas). */
export const BORNES_GAIN_DEFAUT: BornesGain = { min: GAIN_EQ_MIN, max: GAIN_EQ_MAX };

/**
 * Les bornes de gain d'un égaliseur, lues dans son `settings_schema`
 * (chemin JSON Schema : `properties.bands.items.properties.gain.minimum` /
 * `.maximum`, décision du 25/11). Sans elles, ou incohérentes : ±12 dB, que
 * tout serveur accepte. On n'invente jamais une borne plus large.
 */
export function bornesGain(catalogue: CatalogueTess | null | undefined, id: string): BornesGain {
  const schema = descripteur(catalogue, id)?.settings_schema as Record<string, any> | undefined;
  const g = schema?.properties?.bands?.items?.properties?.gain;
  const min = g?.minimum;
  const max = g?.maximum;
  if (fini(min) && fini(max) && min < 0 && max > 0 && min < max) return { min, max };
  return BORNES_GAIN_DEFAUT;
}

// ── Refonte rc14 : « À l'oreille » (l'ancien Assistant) ─────────────────────

export const TONALITE_MIN = -6;
export const TONALITE_MAX = 6;

/** L'environnement neutre du moteur (décalage 0 / 0 / 0). */
export const ENVIRONNEMENT_NEUTRE = { listening: 'speakers', room_size: 'medium', speaker_placement: 'free_standing' } as const;

/** L'environnement hérité de l'ancien assistant est-il neutre ? */
export function environnementNeutre(s: unknown): boolean {
  const r = reglagesEq(s);
  return r.listening === ENVIRONNEMENT_NEUTRE.listening
    && r.room_size === ENVIRONNEMENT_NEUTRE.room_size
    && r.speaker_placement === ENVIRONNEMENT_NEUTRE.speaker_placement;
}

export interface Tonalite { bass: number; mid: number; treble: number }

export function tonaliteDe(s: unknown): Tonalite {
  const r = reglagesEq(s);
  const v = (x: unknown) => (fini(x) ? x : 0);
  return { bass: v(r.bass_gain_db), mid: v(r.mid_gain_db), treble: v(r.treble_gain_db) };
}

/**
 * Le moteur ne joue la tonalité QUE sans bandes (`cascades` de l'égaliseur) :
 * « À l'oreille » est le mode d'un égaliseur sans bandes dont la tonalité ou
 * l'environnement agit ; sinon c'est « Courbe ».
 */
export function modeEgaliseur(s: unknown): 'courbe' | 'oreille' {
  const r = reglagesEq(s);
  if (r.bands.length > 0) return 'courbe';
  const t = tonaliteDe(s);
  return t.bass !== 0 || t.mid !== 0 || t.treble !== 0 || !environnementNeutre(s) ? 'oreille' : 'courbe';
}

/**
 * Les réglages « À l'oreille » : la courbe est vidée (le moteur l'exige) et
 * l'environnement hérité est remis au NEUTRE (décision de Bertrand du 25/11 :
 * « Speakers » est supprimé, « Headphones » devient le greffon Casque).
 */
export function avecTonalite(s: unknown, t: Tonalite): Reglages {
  const b = (x: number) => Math.round(borner(x, TONALITE_MIN, TONALITE_MAX) * 2) / 2;
  return {
    ...reglagesEq(s),
    ...ENVIRONNEMENT_NEUTRE,
    bands: [],
    bass_gain_db: b(t.bass),
    mid_gain_db: b(t.mid),
    treble_gain_db: b(t.treble),
  };
}

/** Repasser en « Courbe » : la tonalité est remise à zéro (sinon elle reviendrait en vidant la courbe). */
export function avecCourbeSansTonalite(s: unknown, c: CourbeGraphique): Reglages {
  return { ...avecCourbeGraphique(s, c), ...ENVIRONNEMENT_NEUTRE, bass_gain_db: 0, mid_gain_db: 0, treble_gain_db: 0 };
}

// ── Refonte rc14 : l'étage Headroom ─────────────────────────────────────────

export const HEADROOM_MANUEL_MIN = -24;
export const HEADROOM_MANUEL_MAX = 0;
/**
 * Valeur de départ du curseur quand on passe en manuel. Ce n'est PAS ce que
 * fait l'Auto : depuis tune-server-rust#9520, l'Auto vaut 0 dB et la marge
 * est la réserve des égaliseurs, calculée sur toute la série.
 */
export const HEADROOM_AUTO_DB = -3;

export interface HeadroomTess { auto: boolean; db: number }

export function headroomDe(chaine: ChaineTess): HeadroomTess {
  const h = (chaine.fixed as Record<string, any> | undefined)?.headroom;
  if (h && h.mode === 'manual' && fini(h.db)) return { auto: false, db: borner(h.db, HEADROOM_MANUEL_MIN, HEADROOM_MANUEL_MAX) };
  return { auto: true, db: HEADROOM_AUTO_DB };
}

/** La chaîne BRUTE avec ce headroom ; le reste de `fixed` est intact. */
export function avecHeadroom(chaine: ChaineTess, h: HeadroomTess): ChaineTess {
  const db = Math.round(borner(h.db, HEADROOM_MANUEL_MIN, HEADROOM_MANUEL_MAX) * 2) / 2;
  return {
    ...chaine,
    fixed: { ...(chaine.fixed ?? {}), headroom: h.auto ? { mode: 'auto' } : { mode: 'manual', db } },
  };
}

/** La sélection de l'écran pour un étage fixe (distincte de tout id de greffon). */
export const SELECTION_HEADROOM = 'etage:headroom';

// ── Refonte rc14 : anciens préréglages de l'égaliseur ──────────────────────

/**
 * Charger un ancien préréglage de l'écran Égaliseur (`GET /eq/presets`) dans
 * TESS : ses bandes vont dans l'égaliseur correspondant de la chaîne
 * (paramétrique si `eq_type = parametric`, sinon graphique), ajouté s'il
 * manque et allumé. Une courbe graphique est ramenée sur la grille 10, 15 ou
 * 31 la plus proche. `null` : greffon absent du catalogue.
 */
export function chaineAvecAncienPreReglage(
  chaine: ChaineTess,
  catalogue: CatalogueTess | null | undefined,
  preset: { eq_type: string; bands: EqBand[] },
): { chaine: ChaineTess; id: string } | null {
  const id = preset.eq_type === 'parametric' ? 'equalizer-parametric' : 'equalizer-graphic';
  if (!descripteur(catalogue, id)) return null;
  let liens = liensDe(chaine);
  if (!liens.some((l) => l.id === id)) {
    // Ajouté avant un greffon « dernier » (réaffectation), comme « + Add plugin ».
    const dernier = liens.findIndex((l) => descripteur(catalogue, l.id)?.placement?.position === 'last_plugin'
      || descripteur(catalogue, l.id)?.placement?.channels === 'remaps');
    const neuf: LienGreffonTess = { id, enabled: true, settings: null };
    liens = dernier >= 0 ? [...liens.slice(0, dernier), neuf, ...liens.slice(dernier)] : [...liens, neuf];
  }
  const actuel = liens.find((l) => l.id === id)?.settings;
  const bandes = Array.isArray(preset.bands) ? preset.bands : [];
  let reglages: Reglages;
  if (id === 'equalizer-parametric') {
    reglages = { ...avecBandes(actuel, bandes), ...ENVIRONNEMENT_NEUTRE, bass_gain_db: 0, mid_gain_db: 0, treble_gain_db: 0 };
  } else {
    const grille = bandes.filter((b) => b.channel !== 1).map((b) => b.freq);
    const { gauche, droite } = courbesDepuisBandes(bandes, grille.length);
    const taille = [10, 15, 31].reduce((m, n) => (Math.abs(n - grille.length) < Math.abs(m - grille.length) ? n : m), 10);
    const vers = GRILLES_EQ[taille];
    const rs = (g: number[]) => (grille.length === vers.length ? g : reechantillonnerCourbe(g, grille, vers));
    reglages = avecCourbeSansTonalite(actuel, { taille, gauche: grille.length ? rs(gauche) : Array(taille).fill(0), droite: droite && grille.length ? rs(droite) : null });
  }
  return {
    id,
    chaine: { ...chaine, plugins: liens.map((l) => (l.id === id ? { ...l, enabled: true, settings: reglages } : l)) },
  };
}

// ── Refonte rc14 : où un greffon est RÉELLEMENT appliqué (tune-server-rust#9520) ──

/** Les façades de l'égaliseur que le moteur met en série, en UN étage. */
export const FACADES_SERIE = new Set([...FACADES_EGALISEUR, 'room-correction']);
/** Greffons que la sortie locale applique toujours en fin de chaîne. */
const TOUJOURS_EN_FIN = new Set(['mono-downmix', 'channel-remap']);

export type NoteOrdreReel = { genre: 'avec-egaliseur'; premier: string } | { genre: 'en-fin' };

/**
 * L'écart entre la place affichée et la place réelle, greffon par greffon
 * (sortie locale ; le flux réseau garde un ordre fixe, dit à part) :
 *   - tous les égaliseurs cochés forment UN étage, au rang du premier : un
 *     égaliseur séparé du premier par un autre greffon coché est appliqué
 *     avec lui ;
 *   - le repli mono reste en dernier : placé avant un autre greffon coché
 *     (hors réaffectation, elle-même dernière), il est appliqué en fin.
 * Rien n'est dit quand la place affichée est la vraie.
 */
export function notesOrdreReel(chaine: ChaineTess): Map<string, NoteOrdreReel> {
  const notes = new Map<string, NoteOrdreReel>();
  const actifs = liensDe(chaine).filter((l) => l.enabled);
  const premierEq = actifs.findIndex((l) => FACADES_SERIE.has(l.id));
  if (premierEq >= 0) {
    for (let i = premierEq + 1; i < actifs.length; i++) {
      if (!FACADES_SERIE.has(actifs[i].id)) continue;
      const entre = actifs.slice(premierEq + 1, i).some((l) => !FACADES_SERIE.has(l.id));
      if (entre) notes.set(actifs[i].id, { genre: 'avec-egaliseur', premier: actifs[premierEq].id });
    }
  }
  actifs.forEach((l, i) => {
    if (l.id !== 'mono-downmix') return;
    if (actifs.slice(i + 1).some((x) => !TOUJOURS_EN_FIN.has(x.id))) notes.set(l.id, { genre: 'en-fin' });
  });
  return notes;
}

/** La sortie suit-elle l'ordre de la chaîne ? Seule la sortie locale (#9520). */
export const ordreSuivi = (transport: string | null | undefined) => transport === 'local';

// ── rc14 : le réglage des enceintes (greffon `speaker-setup`) ───────────────

/** L'id du greffon. */
export const ID_ENCEINTES = 'speaker-setup';
/** La vitesse du son du serveur (m/s), pour afficher les délais. */
export const VITESSE_DU_SON_M_S = 343;
export const DISTANCE_PAR_DEFAUT_CM = 300;

export interface BornesEnceintes {
  distance: { min: number; max: number };
  gain: { min: number; max: number };
  voiesMax: number;
}

/** Les bornes d'un serveur rc14 (et de tout serveur qui n'en publie pas). */
export const BORNES_ENCEINTES_DEFAUT: BornesEnceintes = {
  distance: { min: 0, max: 2000 },
  gain: { min: -20, max: 10 },
  voiesMax: 16,
};

/**
 * Les bornes publiées dans le `settings_schema` du greffon (chemin JSON
 * Schema `properties.channels.items.properties.{distance_cm,gain_db}`). Une
 * borne absente ou incohérente garde la valeur par défaut ; on n'invente
 * jamais une borne plus large que celle que le serveur publie.
 */
export function bornesEnceintes(catalogue: CatalogueTess | null | undefined): BornesEnceintes {
  const schema = descripteur(catalogue, ID_ENCEINTES)?.settings_schema as Record<string, any> | undefined;
  const voies = schema?.properties?.channels;
  const p = voies?.items?.properties;
  const plage = (x: any, d: { min: number; max: number }) =>
    fini(x?.minimum) && fini(x?.maximum) && x.minimum < x.maximum ? { min: x.minimum, max: x.maximum } : d;
  return {
    distance: plage(p?.distance_cm, BORNES_ENCEINTES_DEFAUT.distance),
    gain: plage(p?.gain_db, BORNES_ENCEINTES_DEFAUT.gain),
    voiesMax: fini(voies?.maxItems) && voies.maxItems > 0 ? voies.maxItems : BORNES_ENCEINTES_DEFAUT.voiesMax,
  };
}

export interface VoieEnceinte { distance_cm: number; gain_db: number; invert: boolean }
export interface ReglagesEnceintesTess { channels: VoieEnceinte[]; invert_all: boolean }

const voieDe = (x: unknown, b: BornesEnceintes): VoieEnceinte => {
  const v = estObjet(x) ? x : {};
  return {
    ...v,
    distance_cm: borner(fini(v.distance_cm) ? v.distance_cm : DISTANCE_PAR_DEFAUT_CM, b.distance.min, b.distance.max),
    gain_db: borner(fini(v.gain_db) ? v.gain_db : 0, b.gain.min, b.gain.max),
    invert: v.invert === true,
  };
};

/**
 * Les réglages, avec AU MOINS `voies` entrées complètes (distance, gain,
 * phase). Les entrées au-delà sont gardées telles quelles (une autre source
 * peut avoir plus de voies) ; un champ inconnu de ce client survit.
 */
export function reglagesEnceintes(s: unknown, voies: number, b: BornesEnceintes = BORNES_ENCEINTES_DEFAUT): Reglages & ReglagesEnceintesTess {
  const r = estObjet(s) ? s : {};
  const source = Array.isArray(r.channels) ? (r.channels as unknown[]) : [];
  const n = Math.min(b.voiesMax, Math.max(source.length, voies));
  return {
    ...r,
    channels: Array.from({ length: n }, (_, i) => voieDe(source[i], b)),
    invert_all: r.invert_all === true,
  };
}

/** Le délai de chaque voie, en ms : l'écart avec l'enceinte la plus lointaine. */
export function retardsMs(r: ReglagesEnceintesTess, voies: number): number[] {
  const v = r.channels.slice(0, voies);
  if (v.length === 0) return [];
  const max = Math.max(...v.map((x) => x.distance_cm));
  return v.map((x) => ((max - x.distance_cm) / 100 / VITESSE_DU_SON_M_S) * 1000);
}

/** La réserve (≤ 0 dB) que le serveur prend pour couvrir le plus grand gain positif. */
export function reserveEnceintesDb(r: ReglagesEnceintesTess, voies: number): number {
  const max = Math.max(0, ...r.channels.slice(0, voies).map((x) => x.gain_db));
  return max === 0 ? 0 : -max;
}

/** Les réglages avec ce champ de la voie `i` changé (bornes appliquées, pas de 0,5). */
export function avecVoieEnceinte(
  s: unknown, voies: number, i: number, champ: keyof VoieEnceinte, valeur: number | boolean,
  b: BornesEnceintes = BORNES_ENCEINTES_DEFAUT,
): Reglages {
  const r = reglagesEnceintes(s, Math.max(voies, i + 1), b);
  const v = { ...r.channels[i] };
  if (champ === 'invert') v.invert = valeur === true;
  else if (typeof valeur === 'number' && Number.isFinite(valeur)) {
    const plage = champ === 'distance_cm' ? b.distance : b.gain;
    v[champ] = Math.round(borner(valeur, plage.min, plage.max) * 2) / 2;
  }
  return { ...r, channels: r.channels.map((x, k) => (k === i ? v : x)) };
}

/** Les réglages avec l'inversion globale. */
export function avecInversionGlobale(s: unknown, voies: number, inverse: boolean, b: BornesEnceintes = BORNES_ENCEINTES_DEFAUT): Reglages {
  return { ...reglagesEnceintes(s, voies, b), invert_all: inverse };
}

/**
 * Le nombre de voies qui ARRIVENT au greffon : celles que le serveur a
 * résolues pour lui (`params.channels`), sinon les sorties d'une
 * réaffectation cochée, sinon les voies de la source, sinon 2.
 */
export function voiesQuiArrivent(r: Pick<ReponseTessZone, 'chain' | 'signal_path'> | null | undefined): number {
  if (!r) return 2;
  const etape = r.signal_path.find((e) => e.code === 'plugin' && e.plugin_id === ID_ENCEINTES);
  const n = etape?.params?.channels;
  if (fini(n) && n >= 1) return n;
  const ra = (r.chain.plugins ?? []).find((l) => l.id === 'channel-remap' && l.enabled);
  if (ra) return reglagesReaffectation(ra.settings).outputs;
  const src = r.signal_path.find((e) => e.code === 'source')?.params?.channels;
  return fini(src) && src >= 1 ? src : 2;
}

/** Disposition usuelle (ordre WAVE) des voies, selon leur nombre. */
const DISPOSITIONS: Record<number, string[]> = {
  1: ['mono'],
  2: ['fl', 'fr'],
  3: ['fl', 'fr', 'fc'],
  4: ['fl', 'fr', 'bl', 'br'],
  5: ['fl', 'fr', 'fc', 'bl', 'br'],
  6: ['fl', 'fr', 'fc', 'lfe', 'bl', 'br'],
  7: ['fl', 'fr', 'fc', 'lfe', 'bc', 'sl', 'sr'],
  8: ['fl', 'fr', 'fc', 'lfe', 'bl', 'br', 'sl', 'sr'],
};

/**
 * La clé de traduction du nom de la voie `i` sur `voies` voies
 * (`tess.spk.ch.<code>`), ou `null` au-delà des dispositions connues : le
 * nom est alors « Voie n » (`tess.spk.ch.other`).
 */
export function cleNomDeVoie(i: number, voies: number): string | null {
  const code = DISPOSITIONS[voies]?.[i];
  return code ? `tess.spk.ch.${code}` : null;
}
