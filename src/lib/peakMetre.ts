/**
 * Les crête-mètres — #452, spécifiés par Xavijol le 14/08/2026.
 *
 * Trois visuels au choix, et un quatrième état : rien du tout.
 *
 *   | style   | ce que c'est                                     |
 *   |---------|--------------------------------------------------|
 *   | `lamps` | deux témoins compacts. Le SEUL possible sur la    |
 *   |         | barre de lecture — les deux autres y sont trop    |
 *   |         | larges                                            |
 *   | `dat`   | bargraphe VFD type Sony DAT PCM-7030, OVER à      |
 *   |         | droite. Le défaut proposé                         |
 *   | `iec`   | même format horizontal, échelle IEC 268-18 :      |
 *   |         | vert jusqu'à AL, ambre jusqu'à PML, rouge au-delà |
 *
 * ## 🔴 Affichage seulement — le signal ne change pas
 *
 * Rien ici ne touche à l'audio. C'est un instrument de mesure, pas un
 * traitement : il lit `audio_levels` et le dessine. Le dire compte, parce
 * qu'un « peakmètre » posé dans les Réglages peut se lire comme un limiteur.
 *
 * ## Les seuils, au caractère près
 *
 * « Ambre > −0,5 et ≤ 0 ; rouge **strictement** > 0 » (Xavijol). Le mot
 * « strictement » est dans la spécification, et il compte : un master limité à
 * 0,0 dBFS exactement n'est PAS en surcharge. Confondre `>` et `>=` allumerait
 * le rouge en permanence sur la moitié des disques modernes — c'est ce défaut
 * qui avait déjà rendu les cadrans du Grand écran inutiles (#439).
 */

export type StyleCreteMetre = 'off' | 'lamps' | 'dat' | 'iec';

export const STYLES_CRETE: readonly StyleCreteMetre[] = ['off', 'lamps', 'dat', 'iec'];

/** Le défaut proposé par Xavijol. */
export const STYLE_CRETE_DEFAUT: StyleCreteMetre = 'dat';

export function estStyleCrete(v: unknown): v is StyleCreteMetre {
  return typeof v === 'string' && (STYLES_CRETE as readonly string[]).includes(v);
}

/**
 * 🔴 Le plancher d'échelle : −60 dBFS, PAS le repos analogique.
 *
 * « Stop / silence — la barre et le trait PPM rejoignent le plancher d'échelle
 * (−60), pas le repos analogique (−20) qui laissait un tiers de piste
 * allumé. » Une barre qui reste allumée à l'arrêt ne dit plus rien : on la lit
 * comme un signal.
 */
export const PLANCHER_DB = -60;
export const PLAFOND_DB = 0;

/** Seuils de surcharge — le « strictement » de la spécification. */
export const AMBRE_DES_DB = -0.5;

export type Surcharge = 'aucune' | 'ambre' | 'rouge';

export function surcharge(creteDb: number): Surcharge {
  if (creteDb > 0) return 'rouge';                       // STRICTEMENT
  if (creteDb > AMBRE_DES_DB) return 'ambre';            // > −0,5 et ≤ 0
  return 'aucune';
}

/** Repères de l'échelle IEC 268-18 (dBFS). */
export const IEC_AL_DB = -18;   // Alignment Level
export const IEC_PML_DB = -9;   // Permitted Maximum Level

export type ZoneIec = 'vert' | 'ambre' | 'rouge';

export function zoneIec(db: number): ZoneIec {
  if (db > IEC_PML_DB) return 'rouge';
  if (db > IEC_AL_DB) return 'ambre';
  return 'vert';
}

/**
 * dBFS → position 0…1 sur la barre.
 *
 * Linéaire en décibels, contrairement au cadran du Grand écran qui applique
 * une courbe pour imiter la mécanique d'une aiguille. Un bargraphe numérique
 * n'a pas d'aiguille : ses graduations sont régulières, et c'est ce qui permet
 * de lire une valeur au lieu d'une impression.
 */
export function fractionDe(db: number): number {
  const borne = Math.min(PLAFOND_DB, Math.max(PLANCHER_DB, db));
  return (borne - PLANCHER_DB) / (PLAFOND_DB - PLANCHER_DB);
}

/**
 * 🔴 Attaque INSTANTANÉE, retombée douce.
 *
 * « Attaque instantanée — la barre colle à la crête (plus la course de
 * 100–150 ms de l'aiguille VU). Retombée douce (`BAR_RELEASE`) — sans ça,
 * chaque fenêtre de 40 ms faisait flasher les segments. »
 *
 * Une crête manquée est une crête invisible : il n'y a pas de raison de lisser
 * la MONTÉE d'un instrument dont c'est tout l'objet. La descente, elle, ne dit
 * rien d'utile et fatigue l'œil.
 */
export const BAR_RELEASE = 0.12;

export function suivreLaCrete(precedentDb: number, cibleDb: number, release = BAR_RELEASE): number {
  if (cibleDb >= precedentDb) return cibleDb;                          // instantané
  return precedentDb + (cibleDb - precedentDb) * release;              // amorti
}

/** Durée d'accrochage du trait PPM, en millisecondes. */
export const PPM_HOLD_MS = 1200;

export interface EtatPpm {
  /** dBFS retenu, ou `null` quand rien n'est accroché. */
  db: number | null;
  /** Horodatage de l'accrochage, en millisecondes locales. */
  depuisMs: number;
}

/**
 * Le trait PPM : il monte tout de suite, et il TIENT 1,2 s avant de céder.
 *
 * Une crête plus haute le remplace immédiatement — sinon on afficherait
 * l'avant-dernière.
 */
export function suivrePpm(
  etat: EtatPpm,
  creteDb: number,
  maintenantMs: number,
  holdMs = PPM_HOLD_MS,
): EtatPpm {
  if (etat.db === null || creteDb >= etat.db) return { db: creteDb, depuisMs: maintenantMs };
  if (maintenantMs - etat.depuisMs >= holdMs) return { db: creteDb, depuisMs: maintenantMs };
  return etat;
}

/**
 * 🔴 Ce que la barre de lecture peut afficher.
 *
 * « La barre de lecture n'affiche JAMAIS DAT ni IEC (trop large). Si on active
 * les témoins sur la barre, ce sont les lampes. » Ce n'est pas une
 * approximation d'implémentation : c'est la règle, et elle vaut aussi le jour
 * où quelqu'un élargira la barre.
 */
export function styleSurLaBarre(choisi: StyleCreteMetre): StyleCreteMetre {
  return choisi === 'off' ? 'off' : 'lamps';
}

/** À l'arrêt, tout retombe au plancher — voir `PLANCHER_DB`. */
export function auRepos(): { gaucheDb: number; droiteDb: number; ppm: EtatPpm } {
  return { gaucheDb: PLANCHER_DB, droiteDb: PLANCHER_DB, ppm: { db: null, depuisMs: 0 } };
}
