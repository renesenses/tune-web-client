/** Public country aggregates. No account, licence token or individual position. */
export const CODES_PAYS = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '));
export type NombrePays = number | '<5';
export interface CaseMonde { lat: number; lng: number; n: number }
export const rayonCase = (n: number) => Math.min(18, 2 + Math.sqrt(n));
export interface PaysMonde { cases?: CaseMonde[]; pays: Record<string, NombrePays>; maj: string }
export const URL_PAYS_MONDE = 'https://mozaiklabs.fr/api/v1/world/countries';

export function paysMondeValides(value: unknown): PaysMonde | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { pays?: unknown; cases?: unknown; maj?: unknown };
  if (!raw.pays || typeof raw.pays !== 'object' || Array.isArray(raw.pays)
    || typeof raw.maj !== 'string' || !Number.isFinite(Date.parse(raw.maj))) return null;
  const pays: Record<string, NombrePays> = Object.create(null);
  for (const [code, count] of Object.entries(raw.pays)) {
    if (!CODES_PAYS.has(code)) continue;
    if (count === '<5') pays[code] = count;
    else if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) {
      // Defence in depth: never display a small exact population from an older API.
      pays[code] = count < 5 ? '<5' : count;
    }
  }
  const cases: CaseMonde[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.cases)) for (const c of raw.cases) {
    if (!c || typeof c !== 'object') continue;
    const { lat, lng, n } = c;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isSafeInteger(n) || n < 3
      || Math.abs(lat) > 89.5 || Math.abs(lng) > 179.5 || !Number.isInteger(lat - 0.5) || !Number.isInteger(lng - 0.5)) continue;
    const key = `${lat}:${lng}`;
    if (!seen.has(key)) { cases.push({ lat, lng, n }); seen.add(key); }
  }
  return { pays, ...(raw.cases !== undefined ? { cases } : {}), maj: raw.maj };
}

export async function lirePaysMonde(): Promise<PaysMonde | null> {
  try {
    const r = await fetch(URL_PAYS_MONDE, { credentials: 'omit', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(5000) });
    return r.ok ? paysMondeValides(await r.json()) : null;
  } catch { return null; } // Optional layer: no global error banner.
}

export function niveauPays(n: NombrePays): number {
  return n === '<5' ? 0 : n < 20 ? 1 : n < 100 ? 2 : n < 500 ? 3 : 4;
}
export const FORCES_PAYS = [0.35, 0.5, 0.65, 0.8, 1] as const;

export function nomPays(code: string, langue: string): string {
  try { return new Intl.DisplayNames([langue], { type: 'region' }).of(code) ?? code; }
  catch { return code; }
}
