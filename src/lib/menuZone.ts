/**
 * Les entrées du menu d'UNE zone — la liste, jamais le dessin.
 *
 * Demandé par Bertrand le 20/09/2026 : « j'ai besoin aussi d'une roue crantée
 * pour modifier le nom de la zone, la supprimer, ... ».
 *
 * ## Pourquoi un menu, et pas une rangée d'icônes de plus
 *
 * La ligne de liste finissait par cinq cibles nues, sans libellé : latence,
 * appairage AirPlay, fusion, renommage, suppression. Rien ne disait ce que
 * faisait la troisième, et la corbeille avait exactement le même poids visuel
 * que le chronomètre.
 *
 * La carte de grille, elle, n'en portait aucune : le commentaire de `ZonesV2`
 * l'assumait — « une carte qu'on clique pour activer une zone ne doit pas
 * porter une corbeille à portée de pouce » — et un paragraphe d'aide renvoyait
 * l'utilisateur vers la vue liste (#847).
 *
 * Ce diagnostic est juste, sa conclusion ne l'était pas. Une carte n'a pas
 * besoin d'une corbeille à portée de pouce : elle a besoin d'un MENU, où le
 * geste destructif est à un cran de distance, NOMMÉ, et séparé du reste par un
 * filet. Les deux vues portent donc la même roue et le même menu, et l'aide
 * « passez en vue liste » n'a plus d'objet.
 *
 * ## Ce qui ne s'applique pas est ABSENT, pas grisé
 *
 * La règle de `menuPiste`, pour la même raison : une entrée grisée demande à
 * l'utilisateur de deviner pourquoi. Pas de jumelle hors ligne ⇒ pas de
 * « Fusionner dans … ». Pas de mode expert ⇒ ni latence ni appairage.
 */

/** Une entrée du menu. `faire` est déjà lié à SA zone. */
export interface EntreeMenuZone {
  /** Clé i18n du libellé. Jamais un texte : voir `check-i18n`. */
  cle: string;
  /** Le tracé de l'icône, dans une boîte 24×24 (plusieurs sous-tracés admis). */
  icone: string;
  faire: () => void;
  /** Geste destructif : dessiné en rouge, sous un filet, toujours en dernier. */
  danger?: boolean;
  /** Ce qui remplace `{name}` dans le libellé — le nom de la zone jumelle. */
  nom?: string;
}

/**
 * Les tracés, dans une boîte 24×24.
 *
 * Repris à l'identique de `ZonesV2` : ce sont ceux qui étaient déjà à l'écran
 * sur les boutons nus. Le menu ne change pas les icônes, il leur ajoute un
 * libellé.
 */
export const ICONES_ZONE = {
  renommer: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  image: 'M3 5h18v14H3zM3 16l5-5 4 3.5L16 11l5 5M9 9.5a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0',
  reglages:
    'M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 '
    + '1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 '
    + '1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 '
    + '2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 '
    + '2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  latence: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0M12 6v6l4 2',
  appairage: 'M3 11h18v11H3zM7 11V7a5 5 0 0 1 10 0v4',
  fusion: 'M5 4v7a4 4 0 0 0 4 4h10M15 11l4 4-4 4',
  supprimer: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
} as const;

/** Ce que CETTE zone permet — mesuré par l'écran, pas deviné ici. */
export interface CapacitesZone {
  /** Niveau expert : la latence et l'appairage n'existent que là. */
  expert: boolean;
  /** Sortie AirPlay portant un appareil : un code d'appairage a un sens. */
  appairable: boolean;
  /** Le NOM de la zone jumelle à absorber, `null` s'il n'y en a pas. */
  jumelle: string | null;
}

/** Les gestes, déjà liés à leur zone par l'écran. */
export interface GestesZone {
  renommer: () => void;
  /**
   * Changer la photo de l'appareil (#1394).
   *
   * 🔴 C'est le chemin PRINCIPAL, pas un raccourci — décision de Bertrand du
   * 20/09/2026. L'écran Réglages › Appareils, où la photo se règle aussi, est
   * en niveau « intermédiaire » (`lib/v2Settings`), et le niveau par défaut
   * est DÉBUTANT : sans cette entrée, l'utilisateur ordinaire — celui dont les
   * cartes sont sans image — n'aurait aucun moyen d'en poser une.
   */
  image: () => void;
  reglages: () => void;
  latence: () => void;
  appairer: () => void;
  fusionner: () => void;
  supprimer: () => void;
}

/**
 * Le menu d'une zone, dans l'ordre : ce qui la NOMME, ce qui la RÈGLE, ce qui
 * la MESURE, ce qui la FUSIONNE, puis — seule, sous son filet — ce qui la
 * supprime.
 */
export function entreesMenuZone(c: CapacitesZone, g: GestesZone): EntreeMenuZone[] {
  const out: EntreeMenuZone[] = [
    { cle: 'zone.rename', icone: ICONES_ZONE.renommer, faire: g.renommer },
    { cle: 'v2.zone.changeImage', icone: ICONES_ZONE.image, faire: g.image },
    { cle: 'v2.zone.openSettings', icone: ICONES_ZONE.reglages, faire: g.reglages },
  ];
  if (c.expert) {
    out.push({ cle: 'zone.latency', icone: ICONES_ZONE.latence, faire: g.latence });
    if (c.appairable) {
      out.push({ cle: 'zone.airplayPair', icone: ICONES_ZONE.appairage, faire: g.appairer });
    }
  }
  if (c.jumelle) {
    out.push({ cle: 'v2.zone.mergeInto', nom: c.jumelle, icone: ICONES_ZONE.fusion, faire: g.fusionner });
  }
  out.push({ cle: 'zone.deleteZone', icone: ICONES_ZONE.supprimer, faire: g.supprimer, danger: true });
  return out;
}
