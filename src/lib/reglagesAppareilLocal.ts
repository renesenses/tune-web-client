/**
 * Sauvegarde et récupération LOCALES des réglages d'appareil.
 *
 * Bertrand, 08/09/2026 : « Et je veux un bouton sur l'UI de Tune sauvegarder
 * mes réglages en local ! », et sa contrepartie, la récupération.
 *
 * ## Ce que la mesure dit de l'enjeu
 *
 * Relevé sur le .18 le 08/09/2026, `GET /zones` : **14 zones, UNE SEULE porte
 * un réglage non neutre** — l'Eversolo DMP-A8, avec FLAC natif, ALAC direct,
 * AAC direct, WAV 24 bits et DSD natif. Tout le reste est à sa valeur par
 * défaut.
 *
 * Ce n'est pas une raison de trouver la fonction inutile : c'est exactement
 * l'inverse. Ces cinq réglages-là sont ceux qu'on a mis des semaines à
 * trouver, et ils tiennent dans une base que l'on peut perdre. Le fichier
 * n'a donc pas à être gros ; il a à être JUSTE.
 *
 * ## Trois décisions, et leur raison
 *
 * 1. **On n'écrit que ce que le serveur a publié.** Une clé absente de la
 *    fiche de zone (serveur plus ancien) reste absente du fichier, au lieu
 *    d'être inventée à sa valeur par défaut. À la récupération, absent veut
 *    dire « ne touche pas », pas « remets à zéro ».
 *
 * 2. **La récupération n'applique JAMAIS `fixed_volume`.** L'activer envoie
 *    le signal à 100 % vers l'appareil — c'est pour cela que l'écran fait
 *    taper « 100 » à la main avant de l'armer. Un fichier lu ne peut pas
 *    porter cette décision-là à la place de quelqu'un ; le réglage est
 *    signalé, et laissé à la main. C'est le seul réglage de cette liste dont
 *    la mauvaise application s'entend dans un haut-parleur.
 *
 * 3. **On apparie sur la SORTIE, pas sur le nom.** `output_device_id` désigne
 *    l'appareil (`uuid:RINCON_…`, `airplay-…`) ; le nom se change d'un clic et
 *    se duplique. Le nom ne sert que de repli, et l'écran dit lequel des deux
 *    a servi — un appariement muet finirait par écrire les réglages du
 *    Lindemann dans le Sonos.
 */
import type { Zone } from './types';

export const FORMAT = 'tune.reglages-appareils';
export const VERSION = 1;

/**
 * Les réglages d'appareil, et leur valeur neutre.
 *
 * La liste est CLOSE et explicite : un fichier de sauvegarde ne doit pas
 * emporter le volume, la file, l'appartenance à un groupe ni l'état de
 * lecture. Ce sont des choses de l'instant, pas de la configuration.
 */
export const CLES_REGLAGES = [
  { cle: 'dsd_mode', defaut: 'auto' as unknown },
  { cle: 'max_sample_rate', defaut: null as unknown },
  { cle: 'lyrics_offset_ms', defaut: 0 as unknown },
  { cle: 'dlna_native_flac', defaut: false as unknown },
  { cle: 'alac_passthrough', defaut: false as unknown },
  { cle: 'aac_passthrough', defaut: false as unknown },
  { cle: 'dlna_lpcm', defaut: false as unknown },
  { cle: 'dlna_cap_16bit', defaut: false as unknown },
  { cle: 'dlna_wav24', defaut: false as unknown },
  { cle: 'dlna_play_delay_ms', defaut: 0 as unknown },
  { cle: 'gain_trim_db', defaut: 0 as unknown },
  { cle: 'upnp_renderer', defaut: false as unknown },
  { cle: 'mono_downmix', defaut: false as unknown },
  { cle: 'fixed_volume', defaut: false as unknown },
] as const;

export type CleReglage = (typeof CLES_REGLAGES)[number]['cle'];

/**
 * 🔴 Ce que la récupération ne pose jamais toute seule.
 *
 * `fixed_volume` envoie l'appareil à 100 % et l'y épingle. Voir la décision 2
 * en tête de fichier.
 */
export const CLES_A_LA_MAIN: readonly CleReglage[] = ['fixed_volume'];

export type ValeurReglage = string | number | boolean | null;

export interface EntreeZone {
  /** Nom au moment de la sauvegarde — repli d'appariement, et libellé lisible. */
  nom: string;
  output_type: string | null;
  /** L'identité de la sortie : `uuid:…`, `airplay-…`, `local:…`. */
  output_device_id: string | null;
  /** Marque et modèle choisis À LA MAIN au catalogue. Le reste est détecté. */
  brand: string | null;
  model: string | null;
  detected_manufacturer: string | null;
  detected_model: string | null;
  reglages: Partial<Record<CleReglage, ValeurReglage>>;
}

export interface Sauvegarde {
  format: typeof FORMAT;
  version: number;
  exporte_le: string;
  zones: EntreeZone[];
}

const defautDe = (cle: CleReglage): ValeurReglage =>
  (CLES_REGLAGES.find((c) => c.cle === cle)!.defaut as ValeurReglage);

/**
 * Les réglages d'une zone — ceux que le SERVEUR a publiés, et eux seuls.
 *
 * `undefined` n'est pas une valeur : sur un serveur antérieur à #2362,
 * `mono_downmix` n'existe pas dans la fiche, et l'écrire à `false` ferait
 * croire que le réglage a été relevé.
 */
export function reglagesDeZone(z: Zone): Partial<Record<CleReglage, ValeurReglage>> {
  const out: Partial<Record<CleReglage, ValeurReglage>> = {};
  for (const { cle } of CLES_REGLAGES) {
    const v = (z as unknown as Record<string, unknown>)[cle];
    if (v !== undefined) out[cle] = v as ValeurReglage;
  }
  return out;
}

/** Vrai quand tous les réglages relevés sont à leur valeur neutre. */
export function estNeutre(r: Partial<Record<CleReglage, ValeurReglage>>): boolean {
  return CLES_REGLAGES.every(({ cle, defaut }) => {
    const v = r[cle];
    return v === undefined || v === (defaut as ValeurReglage);
  });
}

export function entreeDeZone(z: Zone): EntreeZone {
  return {
    nom: z.name ?? '',
    output_type: z.output_type ?? null,
    output_device_id: z.output_device_id ?? null,
    brand: z.brand ?? null,
    model: z.model ?? null,
    detected_manufacturer: z.detected_manufacturer ?? null,
    detected_model: z.detected_model ?? null,
    reglages: reglagesDeZone(z),
  };
}

/**
 * Le fichier de sauvegarde.
 *
 * On garde AUSSI les zones neutres : leur absence du fichier serait lue comme
 * « cette zone n'existait pas », alors qu'elle dit « cette zone n'avait rien
 * de particulier ». La différence compte le jour où l'on compare deux
 * installations.
 */
export function construireSauvegarde(zones: Zone[], maintenant = new Date()): Sauvegarde {
  return {
    format: FORMAT,
    version: VERSION,
    exporte_le: maintenant.toISOString(),
    zones: zones.filter((z) => z.id != null).map(entreeDeZone),
  };
}

export function serialiser(s: Sauvegarde): string {
  return `${JSON.stringify(s, null, 2)}\n`;
}

/** `tune-appareils-2026-09-08.json` — daté, pour que deux sauvegardes se rangent. */
export function nomFichierSauvegarde(maintenant = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `tune-appareils-${maintenant.getFullYear()}-${p(maintenant.getMonth() + 1)}-${p(maintenant.getDate())}.json`;
}

export type RaisonRefus = 'illisible' | 'pas_un_fichier_tune' | 'version_future' | 'aucune_zone';

export type Lecture =
  | { ok: true; sauvegarde: Sauvegarde }
  | { ok: false; raison: RaisonRefus };

/**
 * Relit un fichier de sauvegarde.
 *
 * Sévère à dessein : ce fichier va servir à ÉCRIRE des réglages sur des
 * appareils. Un JSON quelconque qui aurait par hasard un tableau `zones` ne
 * doit pas passer pour une sauvegarde Tune, d'où le champ `format`.
 */
export function lireSauvegarde(texte: string): Lecture {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return { ok: false, raison: 'illisible' };
  }
  const d = brut as Partial<Sauvegarde> | null;
  if (!d || typeof d !== 'object' || d.format !== FORMAT || !Array.isArray(d.zones)) {
    return { ok: false, raison: 'pas_un_fichier_tune' };
  }
  // Un fichier écrit par une version PLUS RÉCENTE peut porter des réglages que
  // celle-ci ne sait pas interpréter : on refuse plutôt que d'en appliquer la
  // moitié.
  if (Number(d.version) > VERSION) return { ok: false, raison: 'version_future' };

  const zones = d.zones
    .filter((z): z is EntreeZone => !!z && typeof z === 'object')
    .map((z) => ({
      nom: typeof z.nom === 'string' ? z.nom : '',
      output_type: z.output_type ?? null,
      output_device_id: z.output_device_id ?? null,
      brand: z.brand ?? null,
      model: z.model ?? null,
      detected_manufacturer: z.detected_manufacturer ?? null,
      detected_model: z.detected_model ?? null,
      reglages: filtrerReglages(z.reglages),
    }));
  if (!zones.length) return { ok: false, raison: 'aucune_zone' };

  return {
    ok: true,
    sauvegarde: {
      format: FORMAT,
      version: Number(d.version) || VERSION,
      exporte_le: typeof d.exporte_le === 'string' ? d.exporte_le : '',
      zones,
    },
  };
}

/** Ne retient que les clés connues : un fichier trafiqué n'introduit pas de champ. */
function filtrerReglages(r: unknown): Partial<Record<CleReglage, ValeurReglage>> {
  const out: Partial<Record<CleReglage, ValeurReglage>> = {};
  if (!r || typeof r !== 'object') return out;
  const src = r as Record<string, unknown>;
  for (const { cle } of CLES_REGLAGES) {
    const v = src[cle];
    if (v === undefined) continue;
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[cle] = v as ValeurReglage;
    }
  }
  return out;
}

const plier = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

export type MethodeAppariement = 'sortie' | 'nom';

export interface Changement {
  cle: CleReglage | 'brand' | 'model';
  avant: ValeurReglage;
  apres: ValeurReglage;
  /** Faux pour ce que la récupération refuse de poser seule (voir `CLES_A_LA_MAIN`). */
  applicable: boolean;
}

export interface Appariement {
  entree: EntreeZone;
  zone: Zone | null;
  methode: MethodeAppariement | null;
  changements: Changement[];
}

/**
 * Ce que la récupération changerait sur une zone.
 *
 * Marque et modèle en font partie : ce sont des corrections posées à la main,
 * et ce sont elles qui donnent son sens au reste (elles décident du préréglage
 * proposé et du badge « Tune tested »).
 */
export function changements(entree: EntreeZone, zone: Zone): Changement[] {
  const out: Changement[] = [];
  const z = zone as unknown as Record<string, unknown>;

  for (const champ of ['brand', 'model'] as const) {
    const apres = entree[champ];
    const avant = (zone[champ] ?? null) as ValeurReglage;
    // Le fichier n'EFFACE pas une identité : il en pose une, ou se tait.
    if (apres && apres !== avant) out.push({ cle: champ, avant, apres, applicable: true });
  }

  for (const { cle } of CLES_REGLAGES) {
    const apres = entree.reglages[cle];
    if (apres === undefined) continue;
    const avant = (z[cle] ?? defautDe(cle)) as ValeurReglage;
    if (avant === apres) continue;
    out.push({ cle, avant, apres, applicable: !CLES_A_LA_MAIN.includes(cle) });
  }
  return out;
}

/**
 * Rapproche le fichier des zones présentes.
 *
 * Une zone n'est prise qu'UNE fois : deux entrées du fichier ne peuvent pas
 * viser la même sortie, sinon la seconde écraserait la première sans que rien
 * ne le dise.
 */
export function apparier(sauvegarde: Sauvegarde, zones: Zone[]): Appariement[] {
  const libres = new Set(zones.filter((z) => z.id != null).map((z) => z.id as number));
  const parSortie = new Map<string, Zone>();
  const parNom = new Map<string, Zone>();
  for (const z of zones) {
    if (z.id == null) continue;
    const sortie = plier(z.output_device_id);
    if (sortie && !parSortie.has(sortie)) parSortie.set(sortie, z);
    const nom = plier(z.name);
    if (nom && !parNom.has(nom)) parNom.set(nom, z);
  }

  const prendre = (z: Zone | undefined): Zone | null => {
    if (!z || z.id == null || !libres.has(z.id)) return null;
    libres.delete(z.id);
    return z;
  };

  // Deux passes : TOUTES les correspondances de sortie d'abord. Sinon une
  // entrée appariée par son nom pourrait consommer la zone qu'une entrée
  // suivante désignait par son identifiant de sortie.
  const resultats: Appariement[] = sauvegarde.zones.map((entree) => ({
    entree, zone: null, methode: null as MethodeAppariement | null, changements: [],
  }));

  resultats.forEach((r) => {
    const sortie = plier(r.entree.output_device_id);
    const z = sortie ? prendre(parSortie.get(sortie)) : null;
    if (z) { r.zone = z; r.methode = 'sortie'; }
  });
  resultats.forEach((r) => {
    if (r.zone) return;
    const z = prendre(parNom.get(plier(r.entree.nom)));
    if (z) { r.zone = z; r.methode = 'nom'; }
  });

  for (const r of resultats) if (r.zone) r.changements = changements(r.entree, r.zone);
  return resultats;
}

/**
 * Le corps du PATCH — uniquement ce qui CHANGE et ce qui est applicable.
 *
 * Rien à envoyer = objet vide, et l'appelant ne doit alors pas appeler du tout.
 *
 * Tout part en UN seul PATCH — identité et réglages ensemble. Le serveur ne
 * pousse le préréglage communautaire que si le corps portait `brand` ou
 * `model`, et il relit alors les réglages EN BASE : séparer les deux ferait
 * partir la poussée sur une zone encore neutre. Voir `api.updateZoneReglages`.
 */
export function corpsPatch(changements: Changement[]): Record<string, ValeurReglage> {
  const corps: Record<string, ValeurReglage> = {};
  for (const c of changements) if (c.applicable) corps[c.cle] = c.apres;
  return corps;
}

/** Résumé pour l'écran : combien de zones, de changements, et de laissés à la main. */
export function resume(appariements: Appariement[]) {
  const apparieees = appariements.filter((a) => a.zone);
  const tous = apparieees.flatMap((a) => a.changements);
  return {
    zonesDuFichier: appariements.length,
    zonesTrouvees: apparieees.length,
    zonesAbsentes: appariements.length - apparieees.length,
    zonesAChanger: apparieees.filter((a) => a.changements.some((c) => c.applicable)).length,
    changements: tous.filter((c) => c.applicable).length,
    aLaMain: tous.filter((c) => !c.applicable).length,
  };
}
