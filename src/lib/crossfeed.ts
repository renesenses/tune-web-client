import type { CrossfeedSettings, CrossfeedStatus } from './api';

/** Bornes acceptées par le serveur (`/zones/{id}/dsp`). Au-delà, il rogne
 *  lui-même — on le fait avant d'envoyer pour que l'écran montre la valeur
 *  qui sera réellement appliquée, pas celle qu'on a demandée. */
export const CF_MIN_AMOUNT = 0;
export const CF_MAX_AMOUNT = 0.5;
export const CF_MIN_DELAY = 0;
export const CF_MAX_DELAY = 5;

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

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** La charge utile à envoyer, bornée. */
export function reglagesCrossfeed(
  enabled: boolean,
  amount: number,
  delay_ms: number
): CrossfeedSettings {
  return {
    enabled,
    amount: borner(amount, CF_MIN_AMOUNT, CF_MAX_AMOUNT),
    delay_ms: borner(delay_ms, CF_MIN_DELAY, CF_MAX_DELAY),
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
 *  français : c'est la raison pour laquelle on traduit par `reason`. */
export function cleIndisponibiliteCrossfeed(motif: string): string {
  switch (motif) {
    case 'non_local_output':
      return 'dsp.crossfeedUnavailableNetwork';
    case 'pure_mode':
      return 'dsp.crossfeedUnavailablePure';
    default:
      return 'dsp.crossfeedUnavailable';
  }
}
