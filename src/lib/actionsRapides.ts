/**
 * Les gestes d'une ligne de piste que la barre d'icônes NE porte PAS : ils
 * vivent au menu « … ».
 *
 * Histoire : #1892 (Sandro, fil 2114) avait ouvert une OPTION « icônes
 * réduites », défaut OFF, qui masquait ces quatre raccourcis ; web#2213
 * (Sandro, fil 2317) avait fait partir leurs cases avec eux.
 *
 * web#3121 (FabienM, fil 2864 ; go de Bertrand du 16/11/2026) — la barre
 * réduite devient la SEULE forme, sur tous les écrans qui listent des pistes :
 *  - « Lire » (ce morceau seulement) et « Lire à partir d'ici » ;
 *  - le CŒUR : il est aussi un indicateur d'état (quels titres sont en
 *    favori), et le menu n'a pas d'entrée « favori » ;
 *  - le « … » lui-même.
 * Le réglage disparaît. Les gestes ci-dessous restent au menu, mot pour mot.
 */

/** Les clés i18n des entrées du menu « … » qui portent les gestes sortis de la barre. */
export const ACTIONS_MASQUABLES = [
  'v2.pa.next',
  'queue.addToQueue',
  'nowplaying.addToPlaylist',
  'v2.cover.tags',
] as const;
