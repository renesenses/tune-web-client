/**
 * LA PREMIÈRE LIGNE DE L'ACCUEIL — maquette Levente, 26-27/09/2026.
 *
 * Bertrand, 27/09/2026 : « la première ligne de la homepage : cela devient un
 * gros widget horizontal ». Avec une zone active on voit la carte de la zone
 * puis les trois panneaux ; avec trois zones actives, les cartes poussent les
 * panneaux vers la droite et la ligne DÉFILE.
 *
 * ## Pourquoi une cote partagée, et pas trois nombres dans trois composants
 *
 * 🔴 C'est le seul point qui peut ruiner la ligne. Quatre panneaux de hauteurs
 * voisines mais différentes donnent exactement « l'air d'un assemblage de
 * morceaux » que Bertrand refuse depuis le 02/09/2026 — et ici le défaut
 * serait pire qu'ailleurs, puisque les quatre sont côte à côte sur la même
 * ligne, où l'œil compare. Une seule hauteur, déclarée une fois, tenue par
 * `__tests__/premiereLigneAccueil.test.ts`.
 *
 * ## 315, et pourquoi un CARRÉ
 *
 * Levente, 26/09/2026 : « The zones one I've changed to 315x315 so it's more
 * on grid and I hope would make it easier to align everything..also tested
 * with different album covers...better to have 1:1 ratio ». La carte de zone
 * est une pochette en plein cadre : tout autre rapport rognerait la pochette
 * ou laisserait des bandes, selon l'album. Le carré ne tranche rien.
 *
 * Les largeurs des panneaux sont relevées sur la maquette, ramenées à
 * l'échelle de la carte : les genres tiennent une colonne de pastilles, les
 * concerts et les statistiques prennent la même place qu'une carte.
 */

/** La HAUTEUR de la ligne, et le côté de la carte de zone. Une seule valeur. */
export const COTE_L1 = 315;

/** Largeur du panneau des genres — une colonne de pastilles, rien de plus. */
export const LARGEUR_GENRES = 150;

/**
 * Largeur des panneaux « concerts » et « statistiques » : celle d'une carte.
 *
 * Les aligner sur la carte est ce qui fait la grille dont parle Levente ; leur
 * donner une largeur propre remettrait trois rythmes sur une même ligne.
 */
export const LARGEUR_PANNEAU = COTE_L1;

/**
 * La période des statistiques de la ligne — SEPT JOURS.
 *
 * La même que celle du Tableau de bord et des extraits de l'accueil, et c'est
 * tout l'intérêt : `tableauDeBord()` partage la requête EN VOL. La ligne ne
 * coûte donc aucune requête de plus quand un autre widget de statistiques est
 * posé sur la même page. Sur `30d`, la route dépasse le chien de garde de 8 s
 * de `PageWidgets` — mesure écrite dans `accueilWidgets`.
 */
export const PERIODE_L1 = '7d' as const;

/**
 * Combien de lignes un panneau de barres montre — et pourquoi si peu.
 *
 * Quatre lignes de barres, pas davantage : la maquette en montre quatre sous
 * « BY ZONE », et la hauteur est FIXE. Une liste qui déborderait de 315 px
 * ferait grandir la ligne entière, ou serait coupée en son milieu.
 */
export const LIGNES_BARRES = 4;

/**
 * 🔴 LES ZONES QUE LA LIGNE MONTRE — lues sur le magasin VIVANT.
 *
 * Bertrand, 27/09/2026, sur le .18 : « la zone active a disparu ». La ligne
 * rendait `et.elements`, c'est-à-dire ce que le chargeur du widget avait
 * produit UNE FOIS, au chargement de la page. `PageWidgets` n'appelle
 * `charger` qu'une seule fois par widget — c'est tout le principe de son
 * chargement paresseux.
 *
 * La liste se trompait donc dans les DEUX sens :
 *  - rien ne jouait à l'ouverture de l'accueil ⇒ aucune carte, pour toujours ;
 *  - une zone démarrée après ⇒ jamais de carte ;
 *  - une zone arrêtée depuis ⇒ sa carte restait.
 *
 * Seul le CONTENU de chaque carte était vivant (`zoneVivante` relisait le
 * magasin) : la leçon du 06/09 avait été appliquée à la position de
 * l'aiguille, pas à l'existence de la carte.
 *
 * Cette fonction est donc appelée par le RENDU, à chaque changement du
 * magasin. Elle est ici, et pas dans le registre, pour qu'il n'y ait qu'un
 * seul filtre : deux copies auraient divergé au premier ajustement.
 *
 * Qui passe : les zones qui JOUENT ou sont en PAUSE. Pas celles à l'arrêt —
 * sur le .18, « Cet ordinateur » est `stopped` et porte pourtant un
 * `current_track` à la position 0 : la retenir remplirait la ligne de cartes
 * muettes.
 */
export function zonesDeLaLigne<T extends { current_track?: unknown; state?: string }>(
  zones: readonly T[] | null | undefined,
): T[] {
  return (zones ?? []).filter(
    (z) => z?.current_track && (z.state === 'playing' || z.state === 'paused'),
  );
}
