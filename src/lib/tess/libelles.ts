/**
 * TESS — ce que l'écran DIT d'une étape du chemin du signal (W3, W5).
 *
 * Tout part de la réponse du serveur (`ZoneTess.signal_path`), dans l'ordre
 * qu'il publie : l'ordre réel de Q9 (Source → Headroom → greffons →
 * Upsampling → Volume → Dither → Output ; en DSD, Volume juste avant le
 * modulateur). Le client ne réordonne rien : les maquettes A1 et A4 dessinent
 * le volume avant l'upsampling, et le contrat dit que c'est l'ORDRE RÉEL qui
 * s'affiche (`docs/tess/contrat.md`, § 4).
 *
 * Une étape non effective n'est jamais présentée comme active : elle dit son
 * motif (`reason`), ou « Off ».
 */
import type { EtapeTess, ZoneTess } from './contrat';

export type Traduire = (cle: string) => string;

/** `{nom}` → valeur. */
export function remplir(gabarit: string, valeurs: Record<string, string | number>): string {
  return gabarit.replace(/\{(\w+)\}/g, (m, k) => (k in valeurs ? String(valeurs[k]) : m));
}

/** −3 dB, 0 dB, +2 dB (signe moins typographique, comme les maquettes). */
export function formaterDb(db: number): string {
  const arrondi = Math.round(db * 10) / 10;
  if (arrondi === 0) return '0 dB';
  const absolu = Math.abs(arrondi).toString();
  return `${arrondi < 0 ? '−' : '+'}${absolu} dB`;
}

/** 44100 → « 44.1 kHz », 96000 → « 96 kHz ». */
export function formaterCadence(hz: number): string {
  const k = Math.round(hz / 100) / 10;
  return `${k} kHz`;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** Noms des greffons du catalogue de référence (contrat § 2). Un greffon de
 *  paquet inconnu ici garde le nom anglais publié par le serveur. */
const NOMS_GREFFONS: Record<string, string> = {
  'equalizer-graphic': 'tess.plugin.equalizerGraphic',
  'equalizer-parametric': 'tess.plugin.equalizerParametric',
  'equalizer-headphone': 'tess.plugin.equalizerHeadphone',
  crossfeed: 'tess.plugin.crossfeed',
  'crossfeed-pro': 'tess.plugin.crossfeedPro',
  crosstalk: 'tess.plugin.crosstalk',
  convolution: 'tess.plugin.convolution',
  'room-correction': 'tess.plugin.roomCorrection',
  'declick-live': 'tess.plugin.declickLive',
  'channel-remap': 'tess.plugin.channelRemap',
  'mono-downmix': 'tess.plugin.monoDownmix',
};

const NOMS_ETAPES: Record<string, string> = {
  source: 'tess.step.source',
  headroom: 'tess.step.headroom',
  upsampling: 'tess.step.upsampling',
  volume: 'tess.step.volume',
  quantization: 'tess.step.quantization',
  dsd_modulator: 'tess.step.dsdModulator',
  output: 'tess.step.output',
  unknown: 'tess.step.unknown',
};

/** Motifs d'extinction par étage et blocages globaux (`MotifEtape`). */
const MOTIFS: Record<string, string> = {
  outside_tess: 'tess.reason.outsideTess',
  chain_version_unsupported: 'tess.reason.chainVersionUnsupported',
  pure_mode: 'tess.reason.pureMode',
  dsd_source_native: 'tess.reason.dsdSourceNative',
  bypass_all: 'tess.reason.bypassAll',
  unknown_plugin: 'tess.reason.unknownPlugin',
  plugin_unavailable: 'tess.reason.pluginUnavailable',
  premium_required: 'tess.reason.premiumRequired',
  stereo_only: 'tess.reason.stereoOnly',
  replaced_in_group: 'tess.reason.replacedInGroup',
  unknown_value: 'tess.reason.unknownValue',
  nothing_to_protect: 'tess.reason.nothingToProtect',
  volume_not_software: 'tess.reason.volumeNotSoftware',
  nothing_to_quantize: 'tess.reason.nothingToQuantize',
};

const DITHERS: Record<string, string> = {
  tpdf: 'tess.value.ditherTpdf',
  noise_shaped: 'tess.value.ditherNoiseShaped',
  off: 'tess.value.ditherOff',
};

/** Le nom affiché d'un greffon : traduit pour le catalogue de référence,
 *  sinon le nom du catalogue du serveur, sinon son id. */
export function nomGreffon(id: string, zone: Pick<ZoneTess, 'catalog'> | null, tr: Traduire): string {
  const cle = NOMS_GREFFONS[id];
  if (cle) return tr(cle);
  return zone?.catalog.plugins.find((p) => p.id === id)?.name ?? id;
}

export function nomEtape(e: EtapeTess, zone: Pick<ZoneTess, 'catalog'> | null, tr: Traduire): string {
  if (e.code === 'plugin') return nomGreffon(e.plugin_id ?? '', zone, tr);
  return tr(NOMS_ETAPES[e.code] ?? NOMS_ETAPES.unknown);
}

/** Le format d'un flux : « FLAC 24-bit / 96 kHz », « DSD128 ». */
export function libelleFormat(p: Record<string, unknown> | null, tr: Traduire): string | null {
  if (!p) return null;
  if (p.kind === 'pcm' || num(p.sample_rate_hz) !== null) {
    const rate = num(p.sample_rate_hz);
    if (rate === null) return null;
    const bits = num(p.bits);
    const codec = txt(p.codec) ?? 'PCM';
    return bits === null
      ? `${codec} · ${formaterCadence(rate)}`
      : remplir(tr('tess.value.pcmFormat'), { codec, bits, rate: formaterCadence(rate) });
  }
  if (p.kind === 'dsd') {
    const rate = txt(p.rate)?.toUpperCase() ?? 'DSD';
    if (p.played_as === 'native') return `${rate} · ${tr('tess.value.dsdNative')}`;
    if (p.played_as === 'dop') return `${rate} · DoP`;
    if (p.played_as === 'converted_to_pcm') return `${rate} · ${tr('tess.value.dsdConverted')}`;
    return rate;
  }
  return null;
}

/** Le motif d'une étape éteinte, dans la langue de l'interface. Un motif
 *  inconnu (serveur plus récent) s'affiche par son `detail`, jamais par son code. */
export function motifEtape(e: EtapeTess, zone: Pick<ZoneTess, 'catalog'> | null, tr: Traduire): string | null {
  if (!e.reason) return null;
  const cle = MOTIFS[e.reason];
  if (!cle) return e.detail ?? tr('tess.reason.unknown');
  if (e.reason === 'stereo_only') return remplir(tr(cle), { n: e.detail ?? '?' });
  if (e.reason === 'replaced_in_group') {
    const par = txt(e.params?.replaced_by);
    return remplir(tr(cle), { other: par ? nomGreffon(par, zone, tr) : '?' });
  }
  return tr(cle);
}

function resumeUpsampling(p: Record<string, unknown> | null, tr: Traduire): string {
  if (!p) return tr('tess.value.off');
  const filtre = txt(p.filter) ?? '';
  if (p.target === 'dsd') return `${txt(p.rate)?.toUpperCase() ?? 'DSD'}${filtre ? ` · ${filtre}` : ''}`;
  const ratio = num(p.max_ratio);
  const plafond = num(p.max_rate_hz);
  const base = ratio === null
    ? remplir(tr('tess.value.upsamplingMax'), { filter: filtre })
    : remplir(tr('tess.value.upsamplingRatio'), { ratio, filter: filtre });
  return plafond === null ? base : `${base} · ≤ ${formaterCadence(plafond)}`;
}

/** Ce qu'un greffon publie de ses réglages (T16 ajoute ces `params`). Rien de
 *  connu : on ne dit rien plutôt que d'inventer. */
function resumeGreffon(e: EtapeTess, zone: Pick<ZoneTess, 'chain'> | null, tr: Traduire): string | null {
  const p = e.params ?? {};
  const id = e.plugin_id ?? '';
  if (id === 'convolution') {
    const fichier = txt(p.file) ?? txt(p.filter_set)
      ?? txt(zone?.chain.plugins?.find((m) => m.id === id)?.settings?.filter_set);
    const cadence = num(p.sample_rate_hz);
    if (!fichier) return null;
    if (cadence === null) return fichier;
    const cle = p.matches_source === false ? 'tess.value.resampledTo' : 'tess.value.matchesRate';
    const cible = num(p.source_rate_hz) ?? cadence;
    return `${fichier} · ${remplir(tr(cle), { rate: formaterCadence(p.matches_source === false ? cible : cadence) })}`;
  }
  if (id.startsWith('equalizer-')) {
    const bandes = num(p.bands);
    const nom = txt(p.preset);
    const morceaux = [bandes !== null ? remplir(tr('tess.value.bands'), { n: bandes }) : null, nom].filter(Boolean);
    return morceaux.length ? morceaux.join(' · ') : null;
  }
  if (id === 'declick-live') {
    const seuil = num(p.threshold);
    const ms = num(p.lookahead_ms);
    if (seuil === null || ms === null) return null;
    return remplir(tr('tess.value.declick'), { threshold: seuil, ms });
  }
  return null;
}

/**
 * Le résumé d'une étape : « −3 dB · on automatically », « Software · −18 dB »,
 * « Off »… `court` = la forme de la maquette A4 (« −3 dB (auto) »).
 */
export function resumeEtape(e: EtapeTess, zone: Pick<ZoneTess, 'catalog' | 'chain'> | null, tr: Traduire, court = false): string {
  const p = e.params;
  const motif = !e.effective ? motifEtape(e, zone, tr) : null;
  switch (e.code) {
    case 'source':
    case 'output':
      return libelleFormat(p, tr) ?? '';
    case 'headroom': {
      if (!e.requested) return tr('tess.value.off');
      if (!e.effective) return motif ?? tr('tess.value.off');
      const db = formaterDb(num(p?.db) ?? 0);
      if (p?.mode === 'auto') return remplir(tr(court ? 'tess.value.headroomAutoShort' : 'tess.value.headroomAuto'), { db });
      return db;
    }
    case 'upsampling':
      if (!e.requested) return tr('tess.value.off');
      if (!e.effective) return motif ?? tr('tess.value.off');
      return resumeUpsampling(p, tr);
    case 'volume': {
      if (p?.control === 'device') return tr('tess.value.volumeDevice');
      if (p?.control === 'fixed') return tr('tess.value.volumeFixed');
      const db = num(p?.db);
      const texteVolume = remplir(tr('tess.value.volumeSoftware'), { db: formaterDb(db ?? 0) });
      if (!e.effective && e.requested && motif) return motif;
      return texteVolume;
    }
    case 'quantization': {
      if (!e.effective) return motif ?? tr('tess.value.off');
      const cle = DITHERS[txt(p?.dither) ?? ''];
      return cle ? tr(cle) : tr('tess.reason.unknownValue');
    }
    case 'dsd_modulator':
      return txt(p?.rate)?.toUpperCase() ?? 'DSD';
    case 'plugin': {
      if (!e.requested) return tr('tess.value.off');
      if (!e.effective) return motif ?? tr('tess.value.off');
      return resumeGreffon(e, zone, tr) ?? tr('tess.value.on');
    }
    default:
      return e.detail ?? '';
  }
}
