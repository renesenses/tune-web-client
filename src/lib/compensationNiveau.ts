import type { LevelCompensation } from './api';

/** Le champ `level_compensation` d'une réponse est-il l'état complet ?
 *
 *  `DspSettings` le type aussi en `{ enabled }` — la forme de l'ÉCRITURE. Un
 *  serveur antérieur ne le publie pas du tout : dans les deux cas, rien à
 *  afficher. */
export function estCompensation(v: unknown): v is LevelCompensation {
  const o = v as LevelCompensation | null | undefined;
  return !!o && typeof o.enabled === 'boolean' && typeof o.eq_db === 'number'
    && typeof o.crossfeed_db === 'number' && typeof o.compensation_db === 'number';
}

/** Un gain en dB, signé, au dixième : « +9.4 », « -1.0 », « 0.0 ».
 *
 *  Arrondi AVANT de choisir le signe : −0,04 dB s'afficherait sinon « -0.0 »,
 *  un signe qui ne dit rien. */
export function dbSigne(db: number): string {
  if (!Number.isFinite(db)) return '0.0';
  const r = Math.round(db * 10) / 10;
  if (r === 0) return '0.0';
  return `${r > 0 ? '+' : ''}${r.toFixed(1)}`;
}

export interface LibelleCompensation {
  /** Clé i18n de la phrase, à remplir avec `{eq}`, `{cf}`, `{comp}`. */
  cle: 'v2.lc.valueOn' | 'v2.lc.valueOff' | 'v2.lc.valueNone';
  eq: string;
  cf: string;
  comp: string;
}

/** La phrase qui dit ce que la compensation fait sur CETTE zone
 *  (tune-server-rust#4685).
 *
 *  - rien à compenser (égaliseur et crossfeed neutres ou inactifs) : on le dit,
 *    l'interrupteur resterait sinon sans explication ;
 *  - active : ce que chaque étage retire, et ce que le volume rend ;
 *  - éteinte : ce que chaque étage retire, non rendu. */
export function libelleCompensation(etat: LevelCompensation): LibelleCompensation {
  const eq = dbSigne(etat.eq_db);
  const cf = dbSigne(etat.crossfeed_db);
  const comp = dbSigne(etat.compensation_db);
  const rien = eq === '0.0' && cf === '0.0';
  const cle = rien ? 'v2.lc.valueNone' : etat.enabled ? 'v2.lc.valueOn' : 'v2.lc.valueOff';
  return { cle, eq, cf, comp };
}
