/**
 * Quelle VERSION joue — tune-server-rust#2264, décisions du 07/10/2026.
 *
 * Lancer une piste joue la version que désigne la règle du profil
 * (bibliothèque d'abord, meilleure qualité, ou un service). Le serveur le dit
 * dans `current_track.version` : ce qui a été DEMANDÉ quand ce n'est pas ce
 * qui joue, et le REPLI quand la version préférée était indisponible. Ce
 * module ne refait aucune règle : il dit ce qu'il faut montrer.
 */
import { libelleQualite } from './meilleureQualite';
import { libelleRegle, nomDeService } from './groupesVersions';

/** `NowPlaying::version`, côté serveur (tune-core playback/mod.rs). */
export interface VersionJoueeServeur {
  /** `rule` : la règle a choisi ; `explicit` : choisie à la main dans « Autres versions ». */
  origin: 'rule' | 'explicit' | string;
  rule: string;
  rule_origin: string;
  /** La piste lancée, quand ce n'est PAS celle qui joue. */
  requested: { track_id: number | null; source: string; source_id: string | null } | null;
  /** La version préférée était indisponible : la suivante joue à sa place. */
  fallback: boolean;
  unavailable_source: string | null;
}

export interface MentionVersion {
  /** « Version jouée : Bibliothèque · FLAC 96 kHz / 24 bit ». */
  texte: string;
  /** La mention « version de repli », ou `null`. */
  repli: string | null;
  infobulle: string;
}

/** Ce que la mention lit d'une piste en cours. */
export type PisteVersion = {
  source?: string | null;
  format?: string | null;
  sample_rate?: number | null;
  bit_depth?: number | null;
  version?: VersionJoueeServeur | null;
};

/**
 * La mention à afficher, ou `null` quand il n'y a rien à dire : aucune règle
 * ne s'est prononcée, ou la piste lancée est celle qui joue, sans repli ni
 * choix explicite.
 */
export function mentionVersion(p: PisteVersion | null | undefined, t: (k: string) => string): MentionVersion | null {
  const v = p?.version;
  if (!p || !v) return null;
  const explicite = v.origin === 'explicit';
  if (!v.fallback && !v.requested && !explicite) return null;
  const source = !p.source || p.source === 'local' ? t('nowplaying.version.library') : nomDeService(p.source);
  const qualite = p.format || p.sample_rate || p.bit_depth
    ? libelleQualite({ format: p.format ?? null, sample_rate: p.sample_rate ?? null, bit_depth: p.bit_depth ?? null }) || null
    : null;
  const texte = `${t('nowplaying.version.played')} : ${[source, qualite].filter(Boolean).join(' · ')}`
    + (explicite ? ` (${t('nowplaying.version.explicit')})` : '');
  const indisponible = v.unavailable_source
    ? (v.unavailable_source === 'local' ? t('nowplaying.version.library') : nomDeService(v.unavailable_source))
    : '';
  const infobulles: string[] = [];
  if (v.fallback) infobulles.push(t('nowplaying.version.fallbackTip').replace('{source}', indisponible));
  if (!explicite) infobulles.push(t('nowplaying.version.ruleTip').replace('{rule}', libelleRegle(v.rule, t)));
  return {
    texte,
    repli: v.fallback ? t('nowplaying.version.fallback') : null,
    infobulle: infobulles.join(' '),
  };
}
