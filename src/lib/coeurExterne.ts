/**
 * #1771 — un cœur que l'ÉCRAN confie à la barre d'actions d'une piste.
 *
 * `PisteActions` sait basculer le favori d'une piste de bibliothèque ou de
 * service. Un titre entendu à la radio n'est ni l'un ni l'autre : son favori
 * est un favori RADIO (`/radio-favorites`), que seul l'Historique connaît.
 * L'écran décrit ce cœur ; la barre le pose dans la case de son propre cœur,
 * pour qu'il tombe dans la même colonne que celui des autres lignes.
 */
export interface CoeurExterne {
  /** Plein (rouge) quand le titre est déjà en favori. */
  favori: boolean;
  /** Une bascule en cours : le bouton est désactivé. */
  occupe: boolean;
  /** Infobulle et nom accessible, déjà traduits. */
  libelle: string;
  basculer: (e: MouseEvent) => void;
}
