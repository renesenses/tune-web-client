/**
 * TESS W5 — ce que le panneau « Signal path » de la barre de lecture montre
 * (maquette A4), tiré de la réponse du serveur (`GET /zones/{id}/tess`).
 *
 * - Le badge est celui du SERVEUR (`badge`) : jamais recalculé ici.
 * - L'encadré TESS n'existe que si le serveur dit « Processed by TESS » : en
 *   Pure ou bit-perfect, l'étape disparaît (pied de la maquette A4).
 * - Ses lignes suivent l'ordre publié (Q9 : … → Upsampling → Volume →
 *   Dither) ; un greffon décoché n'y figure pas, un étage éteint y figure
 *   avec son motif.
 */
import type { EtapeTess, ZoneTess } from './contrat';
import { libelleFormat, type Traduire } from './libelles';

export type CleBadge = 'processed' | 'bitPerfect' | 'outside' | null;

export function cleBadge(zone: Pick<ZoneTess, 'badge'>): CleBadge {
  if (zone.badge === 'processed_by_tess') return 'processed';
  if (zone.badge === 'bit_perfect') return 'bitPerfect';
  if (zone.badge === 'outside_tess') return 'outside';
  return null;
}

const BADGES: Record<Exclude<CleBadge, null>, string> = {
  processed: 'tess.badge.processed',
  bitPerfect: 'tess.badge.bitPerfect',
  outside: 'tess.reason.outsideTess',
};

export function libelleBadge(zone: Pick<ZoneTess, 'badge'>, tr: Traduire): string | null {
  const c = cleBadge(zone);
  return c ? tr(BADGES[c]) : null;
}

/** Les lignes de l'encadré TESS (vide = pas d'encadré). */
export function lignesTess(zone: Pick<ZoneTess, 'badge' | 'signal_path'>): EtapeTess[] {
  if (zone.badge !== 'processed_by_tess') return [];
  return zone.signal_path.filter(
    (e) => e.code !== 'source' && e.code !== 'output' && !(e.code === 'plugin' && !e.requested),
  );
}

const HORS_TESS: Record<string, string> = {
  hqplayer_own_processing: 'tess.outside.hqplayer',
  diretta_outside_tess: 'tess.outside.diretta',
  unclassified_transport: 'tess.outside.unclassified',
};

/** Pourquoi la zone est hors TESS (Q8), dans la langue de l'interface. */
export function motifHorsTess(zone: Pick<ZoneTess, 'applicability'>, tr: Traduire): string | null {
  const a = zone.applicability;
  if (a.status !== 'outside_tess') return null;
  const cle = a.reason ? HORS_TESS[a.reason] : undefined;
  return cle ? tr(cle) : a.detail ?? null;
}

const TRANSPORTS: Record<string, string> = {
  oaat: 'OAAT', dlna: 'DLNA', openhome: 'OpenHome', bluos: 'BluOS', squeezebox: 'Squeezebox',
  chromecast: 'Chromecast', airplay: 'AirPlay', devialet_air: 'Devialet AIR', aes67: 'AES67',
  sendspin: 'Sendspin', hqplayer: 'HQPlayer', diretta: 'Diretta',
};

export function libelleTransport(zone: Pick<ZoneTess, 'transport' | 'signal_path'>, tr: Traduire): string {
  const nom = TRANSPORTS[zone.transport]
    ?? (zone.transport === 'local' ? tr('tess.transport.local')
      : zone.transport === 'browser' ? tr('tess.transport.browser') : tr('tess.transport.other'));
  const sortie = zone.signal_path.find((e) => e.code === 'output');
  const format = libelleFormat(sortie?.params ?? null, tr);
  return format ? `${nom} · ${format}` : nom;
}

/** « Qobuz · FLAC 24-bit / 96 kHz » : le service s'il est publié, puis le format. */
export function libelleSource(zone: Pick<ZoneTess, 'signal_path'>, tr: Traduire): string | null {
  const p = zone.signal_path.find((e) => e.code === 'source')?.params ?? null;
  const format = libelleFormat(p, tr);
  const service = typeof p?.service === 'string' && p.service.trim() ? p.service : null;
  if (!format) return service;
  return service ? `${service} · ${format}` : format;
}
