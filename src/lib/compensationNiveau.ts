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
  /** Clé i18n de la phrase, à remplir avec `{eq}`, `{cf}`, `{comp}`, et —
   *  pour les deux phrases de #5069 — `{rendu}` et `{perdu}`. */
  cle: 'v2.lc.valueOn' | 'v2.lc.valueOff' | 'v2.lc.valueNone'
    | 'v2.lc.valueAtMax' | 'v2.lc.valuePartial';
  eq: string;
  cf: string;
  comp: string;
  /** Ce que le volume rend réellement, signé (« +3.0 »). */
  rendu: string;
  /** Ce qui n'est pas rendu, en valeur absolue (« 8.4 »). */
  perdu: string;
}

/** Remplit la phrase d'un libellé. Une seule règle pour l'écran et les bancs. */
export function remplirLibelle(modele: string, l: LibelleCompensation): string {
  return modele
    .replace('{eq}', l.eq)
    .replace('{cf}', l.cf)
    .replace('{comp}', l.comp)
    .replace('{rendu}', l.rendu)
    .replace('{perdu}', l.perdu);
}

/** La phrase qui dit ce que la compensation fait sur CETTE zone
 *  (tune-server-rust#4685).
 *
 *  - rien à compenser (égaliseur et crossfeed neutres ou inactifs) : on le dit,
 *    l'interrupteur resterait sinon sans explication ;
 *  - active : ce que chaque étage retire, et ce que le volume rend ;
 *  - éteinte : ce que chaque étage retire, non rendu.
 *
 *  🔴 tune-server-rust#5069 — « rendus par le volume » était une DEMANDE, pas
 *  un fait : le gain est raboté à l'unité, et au volume maximal rien ne
 *  passe. La carte annonçait « +8.4 dB rendus » à un testeur qui écoutait à
 *  100 % et perdait ces 8,4 dB. Quand le serveur dit ce qui n'est PAS rendu
 *  (`unrendered_db`), la phrase le dit aussi, avec le geste qui règle le
 *  problème : baisser le volume de Tune, monter celui de l'ampli. Un serveur
 *  antérieur ne publie pas le champ : on garde l'ancienne phrase, faute de
 *  mieux savoir. */
export function libelleCompensation(etat: LevelCompensation): LibelleCompensation {
  const eq = dbSigne(etat.eq_db);
  const cf = dbSigne(etat.crossfeed_db);
  const comp = dbSigne(etat.compensation_db);
  const rendu = dbSigne(typeof etat.rendered_db === 'number' ? etat.rendered_db : etat.compensation_db);
  const perduDb = typeof etat.unrendered_db === 'number' && etat.unrendered_db > 0 ? etat.unrendered_db : 0;
  const perdu = dbSigne(perduDb).replace('+', '');
  const rien = eq === '0.0' && cf === '0.0';
  let cle: LibelleCompensation['cle'];
  if (rien) cle = 'v2.lc.valueNone';
  else if (!etat.enabled) cle = 'v2.lc.valueOff';
  else if (perdu === '0.0') cle = 'v2.lc.valueOn';
  else cle = rendu === '0.0' ? 'v2.lc.valueAtMax' : 'v2.lc.valuePartial';
  return { cle, eq, cf, comp, rendu, perdu };
}
