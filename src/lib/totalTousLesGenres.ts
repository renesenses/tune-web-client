/**
 * web#2693 — le compte de la puce « Tous » de l'annuaire radio.
 *
 * Il lisait `stations`, que le serveur définit comme « le relevé, tous
 * filtres levés » (1119) : avec « 320 kbit/s et plus », la liste montrait
 * 271 stations et la puce « Tous (1119) ». Les puces de genre, elles, sont
 * déjà comptées par le serveur sur la recherche, le pays et les critères de
 * « Plus de filtres » (tune-server-rust#7466).
 *
 * « Tous » = ce que la liste montre quand AUCUN genre n'est choisi, avec les
 * autres filtres actifs : le `total` d'une réponse sans genre. Quand un genre
 * est choisi, la réponse ne le donne plus ; on garde celui de la dernière
 * réponse sans genre pour les mêmes filtres (`cle`). Inconnu → `null` : la
 * puce s'affiche sans nombre plutôt qu'avec un faux.
 *
 * Sans genre non plus, on ne lit pas le `total` de la page affichée : pendant
 * un chargement, c'est celui de la réponse PRÉCÉDENTE (« Tous (40) » juste
 * après avoir quitté le genre Info, ou l'ancien total après un changement de
 * recherche ou de pays). Seul le mémo des filtres en cours fait foi.
 */
export interface MemoTous { cle: string; n: number }

/** Le mémo après une réponse : seul un chargement sans genre l'alimente. */
export function memoriserTous(memo: MemoTous | null, cle: string, genre: string | null | undefined, total: number): MemoTous | null {
  return genre ? memo : { cle, n: total };
}

/** Le nombre à afficher dans « Tous », ou `null` s'il n'est pas connu. */
export function compteTous(memo: MemoTous | null, cle: string): number | null {
  return memo && memo.cle === cle ? memo.n : null;
}
