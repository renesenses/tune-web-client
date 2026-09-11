/**
 * La configuration du renderer, ENREGISTRÉE à la main et rattachée à l'appareil.
 *
 * Bertrand, 09/09/2026 : « Et un bouton "sauvegarder mes réglages" dans
 * configuration du renderer ?? » — puis, le 11/09, la raison : **on perd des
 * configurations d'une session à l'autre.**
 *
 * ## Pourquoi un bouton, alors que tout est déjà écrit au clic
 *
 * Une première lecture avait conclu qu'il n'y avait rien à ajouter : les sept
 * réglages de l'écran partent bien en `PATCH /zones/{id}` dès le clic, et ce
 * qui manquait n'était que la PREUVE du succès — le témoin « Enregistré », posé
 * le 09/09. Ce raisonnement tenait sur une prémisse qui n'a pas résisté à
 * l'usage : que ce qui est écrit RESTE écrit.
 *
 * Or ces sept réglages vivent dans des colonnes de la table `zones`, et une
 * ligne de `zones` n'est pas stable d'un démarrage à l'autre. Le serveur porte
 * tout un appareillage pour rattraper ce que la découverte lui fait subir —
 * `deduplicate()`, `reparer_prefixe_local()`, `merge_duplicate_settings()`,
 * `reporter_reglages_de_doublons()` (#1823, #1832 : deux instructions de report
 * échouaient à chaque démarrage sur chaque machine). Cet appareillage existe
 * parce que le cas EST arrivé, et rien n'en garantit la couverture complète.
 *
 * Le bouton ne remplace donc pas l'écriture au clic : il ajoute une **seconde
 * copie, ailleurs**, que le sort d'une ligne de `zones` n'atteint pas. C'est
 * tout ce qu'il fait, et c'est ce que l'écran doit dire — un bouton qui
 * laisserait croire que rien n'est appliqué avant de l'avoir pressé serait un
 * mensonge, et le reste de cet écran dépend de l'inverse.
 *
 * ## Trois décisions, et leur raison
 *
 * 1. **La clé est l'APPAREIL, jamais l'identifiant de zone.** `output_device_id`
 *    (`uuid:RINCON_…`, `airplay-…`, `local:…`) désigne le matériel ; `zones.id`
 *    est précisément ce qui change quand une zone est recréée. Ranger
 *    l'instantané sous l'id le perdrait exactement dans le cas qu'on veut
 *    couvrir. Le nom ne sert que de repli, comme dans
 *    `reglagesAppareilLocal.apparier` — et un repli par le nom est signalé,
 *    jamais muet.
 *
 * 2. **On n'enregistre que les clés que le serveur PUBLIE.** Une clé absente de
 *    la fiche de zone (serveur plus ancien, colonne pas encore migrée) reste
 *    absente de l'instantané, au lieu d'y entrer à sa valeur neutre. À la
 *    remise en place, absent veut dire « ne touche pas », pas « remets à
 *    zéro ». Même règle que `reglagesAppareilLocal.reglagesDeZone`, pour la
 *    même raison.
 *
 * 3. **Sept réglages, et rien d'autre.** La liste est CLOSE : c'est celle de
 *    l'écran `RendererConfig`. `fixed_volume` n'y est pas — l'armer envoie
 *    l'appareil à 100 % et l'y épingle (#2395), ce qu'aucune remise en place
 *    automatique ne peut décider à la place de quelqu'un. `max_sample_rate`,
 *    `gain_trim_db` et `dsd_mode` n'y sont pas non plus : ils vivent dans
 *    d'autres blocs de l'écran Appareils, et la sauvegarde de fichier
 *    (`reglagesAppareilLocal`) les couvre déjà.
 */
import type { Zone } from './types';

/** Révision du format rangé dans les préférences. Un instantané écrit par une
 *  version ultérieure est IGNORÉ plutôt qu'à demi interprété. */
export const VERSION = 1;

/**
 * Les sept réglages de `RendererConfig`, et leur valeur neutre.
 *
 * Le défaut sert à lire une fiche de zone qui ne porte pas la colonne, et à
 * décider si un instantané dit quelque chose ou rien.
 */
export const CLES_RENDERER = [
  { cle: 'dlna_native_flac', defaut: false as unknown },
  { cle: 'alac_passthrough', defaut: false as unknown },
  { cle: 'aac_passthrough', defaut: false as unknown },
  { cle: 'dlna_lpcm', defaut: false as unknown },
  { cle: 'dlna_wav24', defaut: false as unknown },
  { cle: 'dlna_cap_16bit', defaut: false as unknown },
  { cle: 'dlna_play_delay_ms', defaut: 0 as unknown },
] as const;

export type CleRenderer = (typeof CLES_RENDERER)[number]['cle'];
export type ValeurRenderer = boolean | number;

/** Les valeurs telles que l'écran les porte — les sept, toujours. */
export type ValeursEcran = Record<CleRenderer, ValeurRenderer>;

export interface Instantane {
  version: number;
  /** ISO. Affiché tel quel n'est pas lisible : l'écran le passe à `dateSimple`. */
  enregistre_le: string;
  /** Le nom de la zone à l'enregistrement — libellé lisible, et repli de clé. */
  nom: string;
  reglages: Partial<Record<CleRenderer, ValeurRenderer>>;
}

/** L'instantané de chaque appareil, rangé par clé d'appareil. */
export type Instantanes = Record<string, Instantane>;

const plier = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

const defautDe = (cle: CleRenderer): ValeurRenderer =>
  CLES_RENDERER.find((c) => c.cle === cle)!.defaut as ValeurRenderer;

/**
 * La clé de rangement : la SORTIE d'abord, le nom en repli.
 *
 * Les deux formes sont préfixées, sans quoi une zone nommée `uuid:x` pourrait
 * heurter l'appareil `uuid:x`. Rend `null` quand la zone n'a ni sortie ni nom :
 * il n'y a alors rien à quoi rattacher un instantané, et l'écran désarme son
 * bouton plutôt que d'en écrire un sous une clé vide.
 */
export function cleAppareil(zone: Zone): string | null {
  const sortie = plier(zone.output_device_id);
  if (sortie) return `sortie:${sortie}`;
  const nom = plier(zone.name);
  return nom ? `nom:${nom}` : null;
}

/** Vrai quand la clé ne tient que par le nom — appariement faible, à dire. */
export function parLeNom(cle: string): boolean {
  return cle.startsWith('nom:');
}

/**
 * Les valeurs de l'écran, restreintes à ce que le serveur publie sur cette zone.
 *
 * On teste la PRÉSENCE de la clé dans la fiche, pas sa valeur : la présence ne
 * dépend pas du dernier `PATCH`, donc un instantané pris juste après un clic ne
 * risque pas de perdre le réglage qui vient d'être posé.
 */
export function reglagesAEnregistrer(
  zone: Zone,
  ecran: ValeursEcran,
): Partial<Record<CleRenderer, ValeurRenderer>> {
  const out: Partial<Record<CleRenderer, ValeurRenderer>> = {};
  const fiche = zone as unknown as Record<string, unknown>;
  for (const { cle } of CLES_RENDERER) {
    if (fiche[cle] === undefined) continue;
    out[cle] = ecran[cle];
  }
  return out;
}

export function construireInstantane(
  zone: Zone,
  ecran: ValeursEcran,
  maintenant = new Date(),
): Instantane {
  return {
    version: VERSION,
    enregistre_le: maintenant.toISOString(),
    nom: zone.name ?? '',
    reglages: reglagesAEnregistrer(zone, ecran),
  };
}

/** Range l'instantané sans muter la table reçue — le store en fait un nouvel objet. */
export function ranger(table: Instantanes, cle: string, instantane: Instantane): Instantanes {
  return { ...table, [cle]: instantane };
}

export function oublier(table: Instantanes, cle: string): Instantanes {
  const out = { ...table };
  delete out[cle];
  return out;
}

/**
 * Relit un instantané rangé.
 *
 * Sévère, parce que ce qui en sort sert à ÉCRIRE sur un appareil : une entrée
 * corrompue, d'une version ultérieure, ou sans aucun réglage connu, est traitée
 * comme absente. Rien ne s'affiche alors, et rien ne s'écrase.
 */
export function lireInstantane(table: Instantanes | undefined, cle: string | null): Instantane | null {
  if (!table || !cle) return null;
  const brut = table[cle] as Partial<Instantane> | undefined;
  if (!brut || typeof brut !== 'object') return null;
  if (Number(brut.version) > VERSION) return null;
  const reglages = filtrer(brut.reglages);
  if (!Object.keys(reglages).length) return null;
  return {
    version: Number(brut.version) || VERSION,
    enregistre_le: typeof brut.enregistre_le === 'string' ? brut.enregistre_le : '',
    nom: typeof brut.nom === 'string' ? brut.nom : '',
    reglages,
  };
}

/** Ne retient que les sept clés connues, et seulement aux types attendus. */
function filtrer(r: unknown): Partial<Record<CleRenderer, ValeurRenderer>> {
  const out: Partial<Record<CleRenderer, ValeurRenderer>> = {};
  if (!r || typeof r !== 'object') return out;
  const src = r as Record<string, unknown>;
  for (const { cle, defaut } of CLES_RENDERER) {
    const v = src[cle];
    if (typeof v !== typeof defaut) continue;
    out[cle] = v as ValeurRenderer;
  }
  return out;
}

export interface Ecart {
  cle: CleRenderer;
  /** Ce que l'écran porte aujourd'hui — donc ce que le serveur a répondu. */
  courant: ValeurRenderer;
  /** Ce que l'instantané garde. */
  enregistre: ValeurRenderer;
}

/**
 * Ce que la remise en place changerait.
 *
 * Comparé aux valeurs de l'ÉCRAN, pas à la fiche de zone : l'écran est déjà le
 * reflet du serveur (il en est initialisé, et chaque clic y est écrit), et il
 * se met à jour tout seul après une remise en place. L'écart disparaît donc de
 * lui-même — c'est la contre-épreuve, à l'écran, comme pour l'aperçu de la
 * sauvegarde de fichier.
 */
export function ecarts(instantane: Instantane, ecran: ValeursEcran): Ecart[] {
  const out: Ecart[] = [];
  for (const { cle } of CLES_RENDERER) {
    const enregistre = instantane.reglages[cle];
    if (enregistre === undefined) continue;
    const courant = ecran[cle] ?? defautDe(cle);
    if (courant === enregistre) continue;
    out.push({ cle, courant, enregistre });
  }
  return out;
}

/**
 * Le corps du PATCH de remise en place — l'instantané entier, pas les écarts.
 *
 * 🔴 Les écarts NE suffisent pas pour `dlna_lpcm` / `dlna_wav24` : ils sont
 * exclusifs l'un de l'autre côté serveur, et n'envoyer que celui qui diffère
 * laisse la zone porter la paire contradictoire (« forcer le 16 bits » ET
 * « forcer le 24 bits »). Même raison qu'`api.updateZoneWavMode`, qui patche
 * toujours les deux. On renvoie donc tout ce que l'instantané connaît, en une
 * seule requête.
 */
export function corpsPatch(instantane: Instantane): Record<string, ValeurRenderer> {
  const corps: Record<string, ValeurRenderer> = {};
  for (const { cle } of CLES_RENDERER) {
    const v = instantane.reglages[cle];
    if (v !== undefined) corps[cle] = v;
  }
  return corps;
}
