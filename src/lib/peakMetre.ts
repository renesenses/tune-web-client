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

/**
 * 🔴 #4175 — « rouge si crête > 0 dBFS » était une branche MORTE : le
 * serveur mesure du PCM entier, dont la crête est bornée à 0 dBFS par
 * construction. Le seul état atteignable était l'ambre, soit « crête entre
 * −0,5 et 0 » — le voisinage du plein, pas un dépassement — allumé quasi en
 * permanence sur un master moderne (GgB : « très optimiste », fil 1797).
 *
 * La surcharge d'un flux entier se lit autrement, comme sur l'appareil que
 * le style DAT imite : des échantillons **consécutifs à pleine échelle**. Le
 * serveur (≥ 0.9.152) la mesure et l'envoie en `over_left` / `over_right` ;
 * c'est ce témoin qui allume le rouge. La règle « > 0 strictement » reste,
 * pour un serveur qui enverrait un jour du flottant non borné.
 *
 * @param creteDb crête de la fenêtre, en dBFS
 * @param over surcharge constatée par le serveur ; `undefined` = serveur
 *   antérieur, qui ne la mesure pas
 */
export function surcharge(creteDb: number, over?: boolean): Surcharge {
  if (over === true) return 'rouge';
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

/**
 * LES DEUX CANAUX, NOMMÉS — demande de Bertrand, 28/09/2026 : « ajouter un
 * libellé de canal (surtout pour le multicanal) dans la vue Lecture en cours
 * sous la pochette ».
 *
 * 🔴 `L` et `R`, PAS `G` et `D`, et ces lettres NE SE TRADUISENT PAS.
 *
 * Ce n'est pas un oubli d'i18n : c'est la règle déjà écrite pour le cadran du
 * Grand écran (`dessinVuMetre.ts`, « des repères d'instrument, pas du texte
 * d'interface — un VU-mètre porte les mêmes lettres dans toutes les langues »),
 * et les deux cadrans de la barre de lecture les portent déjà. Traduire ici
 * ferait cohabiter deux conventions pour un même fait sur un même écran : des
 * aiguilles marquées `L`/`R` et, trois centimètres plus bas, un bargraphe
 * marqué `G`/`D`.
 *
 * `canauxIdentiquesAuCadran` le verrouille : les deux instruments ne peuvent
 * plus diverger sans faire rougir la suite.
 */
export const LIBELLES_CANAUX: readonly [string, string] = ['L', 'R'];

/**
 * Le corps de police des libellés, en pixels.
 *
 * Plancher à 9 px — la MÊME valeur que `MIN_CANAL` du cadran, et pour la même
 * raison : en dessous, deux lettres deviennent deux taches. La cote relative
 * (34 % de la hauteur) sert les instruments plus grands ; sur la fiche (26 px)
 * et sur la barre de lecture (22 px), c'est le plancher qui gagne.
 *
 * 🔴 Une cote ABSOLUE recopiée d'une surface où le défaut ne se voit pas est
 * ce qui avait rogné le cadran du Grand écran (27/09) — d'où le rapport, et
 * d'où le plancher.
 */
export function policeLibelleCanal(hauteur: number): number {
  return Math.max(9, Math.round(hauteur * 0.34));
}

/** L'air entre le libellé et le début de l'instrument, en pixels. */
export const ECART_LIBELLE_PX = 5;

/** À l'arrêt, tout retombe au plancher — voir `PLANCHER_DB`. */
export function auRepos(): { gaucheDb: number; droiteDb: number; ppm: EtatPpm } {
  return { gaucheDb: PLANCHER_DB, droiteDb: PLANCHER_DB, ppm: { db: null, depuisMs: 0 } };
}

/**
 * LA PALETTE DU CRÊTE-MÈTRE — audit du 27/09/2026.
 *
 * 🔴 Même défaut que le VU-mètre, trouvé en cherchant : une toile n'hérite
 * d'aucune couleur, et celles-ci étaient écrites pour un fond noir. Sur les
 * deux thèmes clairs, du crête-mètre il ne restait QUE les barres : le rail
 * (blanc à 6 %), le trait de crête (blanc à 85 %) et surtout l'état ÉTEINT
 * des lampes (blanc à 12 %) sont invisibles sur du blanc — et « éteint » est
 * l'état normal d'une lampe. Les deux lampes de la barre de lecture
 * n'existaient donc tout simplement pas en thème clair.
 *
 * Le vert et l'ambre, eux, se VOYAIENT mais passaient mal : `#4ade80` sur
 * blanc, c'est 1,6:1 de contraste. Les valeurs claires les foncent.
 *
 * ⚠️ Le rouge, l'ambre et le vert portent un SENS (surcharge, alerte, ok) —
 * pas une identité visuelle. Ils sont donc redéfinis pour rester LISIBLES,
 * jamais remplacés par la couleur d'accent du thème : la repeindre effacerait
 * l'information. C'est la règle déjà écrite dans `tune-v2.css` pour
 * `--tune-danger` et ses voisines.
 */
export interface PaletteCrete {
  fond: string;
  vert: string;
  ambre: string;
  rouge: string;
  ppm: string;
  eteint: string;
  /**
   * L'encre des libellés de canal (« G », « D »), quand l'appelant en demande
   * — voir `CreteMetre.libelles`. Elle NE porte pas de sens, contrairement au
   * vert, à l'ambre et au rouge : c'est du texte, et elle suit donc la
   * lisibilité du thème comme n'importe quelle étiquette.
   */
  libelle: string;
}

/** Le crête-mètre d'origine, mot pour mot. Repli hors de `.tune-v2`. */
export const PALETTE_CRETE_SOMBRE: PaletteCrete = {
  fond: 'rgba(255,255,255,0.06)',
  vert: '#4ade80',
  ambre: '#fbbf24',
  rouge: '#ef4444',
  ppm: 'rgba(255,255,255,0.85)',
  eteint: 'rgba(255,255,255,0.12)',
  libelle: 'rgba(255,255,255,0.55)',
};

export function paletteCreteDepuis(el: Element | null | undefined): PaletteCrete {
  if (!el || typeof getComputedStyle !== 'function') return PALETTE_CRETE_SOMBRE;
  const style = getComputedStyle(el);
  const lire = (nom: string, repli: string) => style.getPropertyValue(nom).trim() || repli;
  return {
    fond: lire('--v2-crete-fond', PALETTE_CRETE_SOMBRE.fond),
    vert: lire('--v2-crete-vert', PALETTE_CRETE_SOMBRE.vert),
    ambre: lire('--v2-crete-ambre', PALETTE_CRETE_SOMBRE.ambre),
    rouge: lire('--v2-crete-rouge', PALETTE_CRETE_SOMBRE.rouge),
    ppm: lire('--v2-crete-ppm', PALETTE_CRETE_SOMBRE.ppm),
    eteint: lire('--v2-crete-eteint', PALETTE_CRETE_SOMBRE.eteint),
    libelle: lire('--v2-crete-libelle', PALETTE_CRETE_SOMBRE.libelle),
  };
}
