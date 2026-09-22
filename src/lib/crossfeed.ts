import type { CrossfeedLimits, CrossfeedSettings, CrossfeedStatus } from './api';

/** Bornes acceptées par le serveur (`/zones/{id}/dsp`). Au-delà, il rogne
 *  lui-même — on le fait avant d'envoyer pour que l'écran montre la valeur
 *  qui sera réellement appliquée, pas celle qu'on a demandée.
 *
 *  Repli seulement : un serveur qui porte tune-server-rust#4683 publie les
 *  siennes (`crossfeed_limits`, voir `bornesCrossfeed`).
 *
 *  0,5 n'est pas un plafond de prudence mais le bout de l'échelle du NIVEAU
 *  (tune-server-rust#4683) : le moteur garde le Mid et multiplie le Side par
 *  `1 − 2·amount`. À 0,5 le Side est entièrement replié — les deux oreilles
 *  reçoivent la même chose, l'image est mono. Au-delà il changerait de signe,
 *  et à 1,0 la gauche et la droite seraient simplement échangées. */
export const CF_MIN_AMOUNT = 0;
export const CF_MAX_AMOUNT = 0.5;
export const CF_MIN_DELAY = 0;
export const CF_MAX_DELAY = 5;

export interface BornesCrossfeed {
  amountMax: number;
  delayMax: number;
}

/** Les bornes que le SERVEUR applique, s'il les publie ; sinon les nôtres.
 *  Une valeur absente, nulle ou non finie retombe sur la constante : mieux
 *  vaut un curseur un peu court qu'un curseur à zéro. */
export function bornesCrossfeed(limits: CrossfeedLimits | null | undefined): BornesCrossfeed {
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
  return {
    amountMax: ok(limits?.amount_max) ? limits.amount_max : CF_MAX_AMOUNT,
    delayMax: ok(limits?.delay_ms_max) ? limits.delay_ms_max : CF_MAX_DELAY,
  };
}

/** Le NIVEAU tel que l'écran l'affiche : la course du curseur, de 0 à 100 %.
 *
 *  tune-server-rust#4683 — l'écran affichait `amount × 100`, soit « 50 % » le
 *  curseur en butée : un curseur qui semblait s'arrêter à mi-course. 100 %
 *  désigne désormais le bout de l'échelle, le point mono (`amountMax`). */
export function niveauEnPourcent(amount: number, amountMax: number = CF_MAX_AMOUNT): number {
  if (!(amountMax > 0) || !Number.isFinite(amount)) return 0;
  return Math.round(borner(amount / amountMax, 0, 1) * 100);
}

export interface CrossfeedPreset {
  key: string;
  labelKey: string;
  amount: number;
  delay: number;
}

/** Les trois réglages tout faits, en valeurs RÉELLES.
 *
 *  Une seule définition : l'égaliseur et « En écoute » doivent proposer les
 *  mêmes, sinon « Standard » ne veut plus rien dire d'un écran à l'autre. */
export const CF_PRESETS: CrossfeedPreset[] = [
  { key: 'light', labelKey: 'dsp.crossfeedPresetLight', amount: 0.25, delay: 0.3 },
  { key: 'standard', labelKey: 'dsp.crossfeedPresetStandard', amount: 0.3, delay: 0.5 },
  { key: 'strong', labelKey: 'dsp.crossfeedPresetStrong', amount: 0.4, delay: 0.7 },
];

function borner(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** La charge utile à envoyer, bornée. */
export function reglagesCrossfeed(
  enabled: boolean,
  amount: number,
  delay_ms: number,
  bornes: BornesCrossfeed = { amountMax: CF_MAX_AMOUNT, delayMax: CF_MAX_DELAY },
): CrossfeedSettings {
  return {
    enabled,
    amount: borner(amount, CF_MIN_AMOUNT, bornes.amountMax),
    delay_ms: borner(delay_ms, CF_MIN_DELAY, bornes.delayMax),
  };
}

/** Quel réglage tout fait correspond aux valeurs courantes, s'il y en a un.
 *
 *  Comparaison à une tolérance près : les curseurs travaillent au centième et
 *  une égalité stricte sur des flottants n'allumerait jamais le bouton. */
export function presetActif(amount: number, delay_ms: number): string | null {
  const proche = (a: number, b: number) => Math.abs(a - b) < 0.005;
  return (
    CF_PRESETS.find((p) => proche(p.amount, amount) && proche(p.delay, delay_ms))?.key ?? null
  );
}

/** Le verdict, unique pour les trois écrans (« En écoute », Égaliseur,
 *  Crossfeed v2). */
export type IndisponibiliteCrossfeed =
  | { indisponible: true; motif: string }
  | { indisponible: false; motif: null };

/** Le crossfeed a-t-il le moindre chemin sur cette zone ?
 *
 *  SOURCE DE VÉRITÉ : `crossfeed_status`, publié par `GET`/`PUT
 *  /zones/{id}/dsp` (serveur ≥ 0.9.132). `unavailable` se lève même case
 *  décochée, et prime toujours sur ce que le client croit savoir de la zone —
 *  il couvre des contraintes que le client ne voit pas, le mode PURE d'abord.
 *
 *  REPLI, quand le serveur ne publie pas le champ (version antérieure, ou
 *  `PUT` dont le corps ne portait pas de `crossfeed`) : le type de sortie. Le
 *  crossfeed n'est installé que derrière `device_id.starts_with("local:")`
 *  aux trois sites de l'orchestrateur ; une zone DLNA, AirPlay, Chromecast ou
 *  OpenHome n'a aucun chemin de code pour lui. C'est le cas de Tades
 *  (tune-server-rust#2742) : 31 zones, pas une seule sortie locale, six essais
 *  en quatre minutes pendant que l'écran promettait « la piste suivante ».
 *
 *  Type de sortie inconnu ⇒ on n'affirme rien : mieux vaut se taire que
 *  verrouiller un contrôle qui marche. */
export function indisponibiliteCrossfeed(
  status: CrossfeedStatus | null | undefined,
  outputType: string | null | undefined,
): IndisponibiliteCrossfeed {
  if (status && typeof status.unavailable === 'boolean') {
    return status.unavailable
      ? { indisponible: true, motif: status.reason ?? 'unknown' }
      : { indisponible: false, motif: null };
  }
  if (outputType && outputType !== 'local') {
    return { indisponible: true, motif: 'non_local_output' };
  }
  return { indisponible: false, motif: null };
}

/** La clé i18n qui explique le motif. Le `detail` du serveur n'existe qu'en
 *  français : c'est la raison pour laquelle on traduit par `reason`.
 *
 *  `network_progressive_off` et `network_renderer_no_lpcm` sont les deux motifs
 *  apparus avec LAT-F1 : une zone réseau PEUT désormais entendre le crossfeed,
 *  via le flux traité au fil de l'eau. Ils remplacent `non_local_output` sur
 *  ces zones — mais celui-ci reste servi par les serveurs antérieurs, et par le
 *  repli de `indisponibiliteCrossfeed` quand le statut n'est pas publié : sa
 *  traduction ne bouge donc pas.
 *
 *  Le `default` n'est pas décoratif. Un client à jour parle à des serveurs qui
 *  ne le sont pas, et l'inverse : un motif inconnu doit donner une phrase
 *  honnête, pas une clé manquante affichée telle quelle. */
export function cleIndisponibiliteCrossfeed(motif: string): string {
  switch (motif) {
    case 'non_local_output':
      return 'dsp.crossfeedUnavailableNetwork';
    case 'pure_mode':
      return 'dsp.crossfeedUnavailablePure';
    case 'network_progressive_off':
      return 'dsp.crossfeedUnavailableProgressiveOff';
    case 'network_renderer_no_lpcm':
      return 'dsp.crossfeedUnavailableNoLpcm';
    // #1266 — les deux motifs de DROITS arrivés en 0.9.156 avec l'extraction
    // du SDK. Ils tombaient dans le repli : « Sans effet sur cette zone. », sans
    // dire s'il fallait changer de licence ou activer l'extension.
    case 'premium_required':
      return 'dsp.crossfeedUnavailablePremium';
    case 'plugin_unavailable':
      return 'dsp.crossfeedUnavailablePlugin';
    default:
      return 'dsp.crossfeedUnavailable';
  }
}
