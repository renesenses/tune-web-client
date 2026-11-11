/**
 * Vérification AccurateRip RÉELLE — renesenses/tune-server-rust#8522.
 *
 * Le serveur compare les CRC v1/v2 de chaque piste (au décalage du lecteur)
 * à la base AccurateRip. Même forme pour le CD chargé en mémoire
 * (`ChargementCd.verification_accuraterip`, évènement `cd.memoire.accuraterip`)
 * et pour une extraction (`EtatExtraction.accuraterip`, et
 * `PisteExtraction.verification` piste par piste) :
 *
 *   { identifiant: 'dBAR-012-…', base: 'en_cours'|'trouvee'|'absente'|'injoignable',
 *     decalage, decalage_detecte, pistes: [{ piste, statut, version, confiance, v1, v2, decalage }] }
 *
 * `statut` : `verifie` (un CRC est dans la base, avec sa confiance),
 * `absent` (la base ne connaît pas la piste), `different` (elle la connaît
 * avec d'autres CRC), `non_verifie` (base injoignable — jamais un échec).
 */
export type StatutAr = 'verifie' | 'absent' | 'different' | 'non_verifie';

export interface VerdictAr {
  piste: number;
  statut: StatutAr;
  version: 'v1' | 'v2' | null;
  confiance: number;
  v1: string;
  v2: string;
  decalage: number;
}

export interface VerificationAr {
  identifiant: string;
  base: 'en_cours' | 'trouvee' | 'absente' | 'injoignable';
  decalage: number;
  decalage_detecte: boolean;
  pistes: VerdictAr[];
}

export const CLES_VERDICT_AR: Record<StatutAr, string> = {
  verifie: 'v2.cd.ar.verified',
  absent: 'v2.cd.ar.absent',
  different: 'v2.cd.ar.different',
  non_verifie: 'v2.cd.ar.unverified',
};

/** Une vérification lisible, ou `null` (serveur antérieur, forme inconnue). */
export function verificationAr(v: unknown): VerificationAr | null {
  const x = v as Partial<VerificationAr> | null | undefined;
  if (!x || typeof x !== 'object' || typeof x.base !== 'string' || !Array.isArray(x.pistes)) return null;
  return x as VerificationAr;
}

/** Le verdict d'une piste, en phrase (jamais le code brut). */
export function texteVerdictAr(v: VerdictAr, t: (cle: string) => string): string {
  const cle = CLES_VERDICT_AR[v.statut];
  if (!cle) return t('v2.cd.ar.unverified');
  return t(cle).replace('{n}', String(v.confiance ?? 0));
}

/** `+6`, `0`, `-1164`. */
export function decalageSigne(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** Le résumé du disque : vérifiées / total, et la phrase du décalage. */
export function resumeAr(v: VerificationAr, t: (cle: string) => string): string {
  if (v.base === 'en_cours') return t('v2.cd.ar.checking');
  const ok = v.pistes.filter((p) => p.statut === 'verifie').length;
  const base = t('v2.cd.ar.summary').replace('{ok}', String(ok)).replace('{total}', String(v.pistes.length));
  const decalage = t(v.decalage_detecte ? 'v2.cd.ar.offsetDetected' : 'v2.cd.ar.offset')
    .replace('{n}', decalageSigne(v.decalage));
  return `${base} · ${decalage}`;
}
