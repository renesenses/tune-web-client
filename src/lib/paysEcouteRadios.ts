// Territoires CLDR49, relevés le28/10/2026 ; noms via Intl, jamais déduits de la langue.
// https://github.com/unicode-org/cldr-json/blob/main/cldr-json/cldr-core/supplemental/territoryInfo.json
import { nomDuPays } from './paysAffichage';

const CODES = `AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO
BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CP CQ CR CU CV CW CX CY CZ DE
DG DJ DK DM DO DZ EA EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM
GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK
ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE
PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM
SN SO SR SS ST SV SX SY SZ TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US
UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW`.split(/\s+/);

export function optionsPaysRadios(langue: string, courant: string) {
  const codes = new Set(CODES);
  if (/^[A-Z]{2}$/.test(courant)) codes.add(courant);
  return [...codes].map(code => ({ code, nom: nomDuPays(code, langue) || code }))
    .sort((a, b) => a.nom.localeCompare(b.nom, langue));
}
