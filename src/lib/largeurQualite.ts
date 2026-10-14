/**
 * La largeur de la colonne Qualité, ajustée aux pastilles de la liste — web#2139.
 *
 * Fil 2248 : « agrandir un peu la colonne "titres" en rognant un peu sur la
 * colonne "qualité" ». Elle valait 196 px fixes (web#1683), taillés pour la
 * pastille la plus longue qu'on sait produire (« HI-RES MAX ✦ AIFF 352.8/24 »).
 * Sur un album en CD, la pastille « CD FLAC 44.1/16 » n'en occupe que la
 * moitié, et le titre se tronquait à côté d'une colonne à moitié vide.
 *
 * La colonne prend désormais la largeur de la pastille la plus longue DE LA
 * LISTE, et le Titre (en `fr`) prend le reste.
 *
 * 🔴 Toujours en PIXELS, jamais `auto` : l'en-tête et les lignes de
 * `ListePistesV2` sont deux grilles qui partagent un même gabarit (voir le
 * commentaire du gabarit). La largeur est donc CALCULÉE ici, une fois pour
 * toute la liste, et non laissée au moteur de mise en page.
 *
 * Le calcul est une ESTIMATION PRUDENTE — celle du témoin de web#1683 — qui
 * surestime la chasse (majuscules 10 px) : une pastille n'est jamais coupée.
 * Si une police plus large dépassait quand même, la pastille reste en mode
 * `ajuste` : le détail s'abrège avec infobulle, il n'est pas tranché.
 */
import { formatCompactQuality, getQualityTier, getQualityTierLabel } from './utils';

export interface PisteQualite {
  format?: string | null;
  sample_rate?: number | null;
  bit_depth?: number | null;
  source?: string | null;
}

/**
 * Plancher : l'en-tête « QUALITÄT » (le plus long des libellés traduits, 11 px
 * capitales) et sa flèche de tri. Une liste sans aucune pastille garde cette
 * largeur, pour que l'en-tête reste lisible.
 */
export const PLANCHER_QUALITE_PX = 80;

/** L'ancienne largeur fixe (web#1683), gardée comme repère des témoins. */
export const ANCIENNE_LARGEUR_QUALITE_PX = 196;

/**
 * Largeur estimée d'une pastille `QualityBadge` (10 px, capitales), en px.
 * Chasse prudente : 7,6 px par caractère du palier (graisse 800, interlettre
 * 0,6), 6,6 px pour le détail (graisse 500, interlettre 0,4), étoile 7 px,
 * gouttières de 4 px, 14 px de marge intérieure et 2 px de bordure.
 *
 * Reproduit les règles d'affichage du composant : pas de pastille sans donnée,
 * détail masqué quand il répète le palier.
 */
export function largeurPastille(piste: PisteQualite): number {
  if (!(piste.format || piste.sample_rate || piste.bit_depth)) return 0;
  const detail = formatCompactQuality(piste);
  if (!detail) return 0;
  const tier = getQualityTier(piste);
  const palier = getQualityTierLabel(tier);
  const montreDetail = detail.toUpperCase() !== palier.toUpperCase();
  const morceaux: number[] = [];
  if (palier) morceaux.push(palier.length * 7.6);
  if (tier === 'hires_max') morceaux.push(7);
  if (montreDetail) morceaux.push(detail.length * 6.6);
  const gouttieres = Math.max(0, morceaux.length - 1) * 4;
  return morceaux.reduce((a, b) => a + b, 0) + gouttieres + 14 + 2;
}

/** La largeur de la colonne Qualité pour cette liste, en px entiers. */
export function largeurColonneQualite(pistes: readonly PisteQualite[]): number {
  let max = 0;
  for (const p of pistes) {
    const l = largeurPastille(p);
    if (l > max) max = l;
  }
  return Math.max(PLANCHER_QUALITE_PX, Math.ceil(max));
}
