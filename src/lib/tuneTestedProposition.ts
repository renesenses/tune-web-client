/**
 * tune-server-rust#7922 — proposer l'appareil d'une zone pour Tune tested.
 *
 * Le serveur compte, par zone, le temps de lecture sans erreur. Au-delà d'une
 * heure, `GET /zones/{id}/tune-tested` dit la proposition possible et rend
 * l'APERÇU EXACT du corps que `POST` enverra au site. L'écran ne recompose
 * rien : il montre cet aperçu tel quel, puis demande confirmation.
 *
 * Ce module ne dessine rien : il décide de l'état du bouton et des lignes de
 * l'aperçu, pour que les tests le lisent sans monter de composant.
 */

/** Un format réellement joué sur la zone. */
export interface FormatJoue {
  codec: string;
  sample_rate: number | null;
  bit_depth: number | null;
  dsd_mode: 'native' | 'dop' | null;
}

/** Le corps envoyé au site, tel que le serveur le rend. */
export interface ApercuTuneTested {
  schema_version: number;
  device_key: string;
  manufacturer: string;
  model: string;
  commercial_name: string | null;
  output_type: string;
  formats: FormatJoue[];
  gapless_observed: boolean;
  error_free_seconds: number;
  tune_version: string;
  platform: string;
  instance_id: string;
}

export type RaisonTuneTested = 'below_threshold' | 'no_device' | 'device_unidentified';

/** Réponse de `GET /zones/{id}/tune-tested`. */
export interface EtatTuneTested {
  eligible: boolean;
  seconds_without_error: number;
  threshold_seconds: number;
  remaining_seconds: number;
  already_proposed: boolean;
  reason: RaisonTuneTested | null;
  preview: ApercuTuneTested | null;
}

export type Traduire = (cle: string, params?: Record<string, string | number>) => string;

/** `$t` ne remplace pas les `{nom}` : on les remplace ici, une fois. */
export function avecParametres(t: (cle: string) => string): Traduire {
  return (cle, params) =>
    Object.entries(params ?? {}).reduce(
      (texte, [nom, valeur]) => texte.replaceAll(`{${nom}}`, String(valeur)),
      t(cle),
    );
}

/** « 1 h 05 min », « 12 min » — jamais de secondes : le seuil est l'heure. */
export function duree(secondes: number, t: Traduire): string {
  const minutes = Math.max(0, Math.ceil(secondes / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0
    ? t('v2.tuneTestedPropose.hm', { h, m: String(m).padStart(2, '0') })
    : t('v2.tuneTestedPropose.m', { m });
}

/** L'état du bouton : grisé, avec le temps restant, tant que le seuil n'est pas atteint. */
export interface EtatBouton {
  actif: boolean;
  /** Ce qui s'affiche sous le bouton grisé, `null` s'il est actif. */
  raison: string | null;
}

export function etatDuBouton(etat: EtatTuneTested | null, t: Traduire): EtatBouton {
  if (!etat) return { actif: false, raison: null };
  if (etat.eligible && etat.preview) return { actif: true, raison: null };
  switch (etat.reason) {
    case 'no_device':
      return { actif: false, raison: t('v2.tuneTestedPropose.err.noDevice') };
    case 'device_unidentified':
      return { actif: false, raison: t('v2.tuneTestedPropose.err.unidentified') };
    default:
      return {
        actif: false,
        raison: t('v2.tuneTestedPropose.remaining', { time: duree(etat.remaining_seconds, t) }),
      };
  }
}

function frequence(hz: number): string {
  return hz >= 1_000_000
    ? `${Math.round(hz / 100) / 10000} MHz`
    : `${Math.round(hz / 100) / 10} kHz`;
}

/** « FLAC 192 kHz / 24 bit », « DSD 2.8224 MHz (DoP) ». */
export function libelleFormat(f: FormatJoue, t: Traduire): string {
  const morceaux = [f.codec.toUpperCase()];
  if (f.sample_rate) morceaux.push(frequence(f.sample_rate));
  let texte = morceaux.join(' ');
  if (f.bit_depth && f.codec !== 'dsd') texte += ` / ${f.bit_depth} bit`;
  if (f.dsd_mode === 'dop') texte += ' (DoP)';
  if (f.dsd_mode === 'native') texte += ` (${t('v2.tuneTestedPropose.dsdNative')})`;
  return texte;
}

/** Une ligne de l'aperçu : un libellé traduit et la valeur envoyée. */
export interface LigneApercu {
  cle: string;
  valeur: string;
}

/** Les lignes lisibles de l'aperçu, dans l'ordre où le site les range. */
export function lignesApercu(p: ApercuTuneTested, t: Traduire): LigneApercu[] {
  const oui = t('v2.tuneTestedPropose.yes');
  const non = t('v2.tuneTestedPropose.no');
  const lignes: LigneApercu[] = [
    { cle: 'v2.tuneTestedPropose.f.manufacturer', valeur: p.manufacturer },
    { cle: 'v2.tuneTestedPropose.f.model', valeur: p.model },
  ];
  if (p.commercial_name) {
    lignes.push({ cle: 'v2.tuneTestedPropose.f.commercialName', valeur: p.commercial_name });
  }
  lignes.push(
    { cle: 'v2.tuneTestedPropose.f.outputType', valeur: p.output_type },
    {
      cle: 'v2.tuneTestedPropose.f.formats',
      valeur: p.formats.length ? p.formats.map((f) => libelleFormat(f, t)).join(', ') : '—',
    },
    { cle: 'v2.tuneTestedPropose.f.gapless', valeur: p.gapless_observed ? oui : non },
    { cle: 'v2.tuneTestedPropose.f.errorFree', valeur: duree(p.error_free_seconds, t) },
    { cle: 'v2.tuneTestedPropose.f.version', valeur: p.tune_version },
    { cle: 'v2.tuneTestedPropose.f.platform', valeur: p.platform },
    { cle: 'v2.tuneTestedPropose.f.instance', valeur: p.instance_id },
  );
  return lignes;
}

/** Le message d'un refus de l'envoi, par son code nommé — jamais le texte brut. */
export function messageDeRefus(code: string | undefined, t: Traduire): string {
  switch (code) {
    case 'tune_tested_below_threshold':
      return t('v2.tuneTestedPropose.err.belowThreshold');
    case 'tune_tested_no_device':
      return t('v2.tuneTestedPropose.err.noDevice');
    case 'tune_tested_device_unidentified':
      return t('v2.tuneTestedPropose.err.unidentified');
    case 'tune_tested_not_connected':
      return t('v2.tuneTestedPropose.err.notConnected');
    default:
      return t('v2.tuneTestedPropose.err.failed');
  }
}
