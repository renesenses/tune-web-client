/**
 * Mémorisation de la position de la liste avant d'ouvrir une fiche artiste
 * (vue Bibliothèque).
 *
 * Signalement de Pierre M (forum, fil 1177, réponse 4769, 2026-07-25) : « dans
 * la vue artiste […] le bug du bouton "retour" ramène toujours en début de
 * liste, pas de mémorisation de la position ». Le correctif `67af168` du
 * 2026-07-20 avait bien posé le mécanisme (capture sur `.library-scroller`
 * dans `selectArtistDetail`, restitution par `restoreArtistScrollWhenReady`),
 * mais il capture SANS CONDITION.
 *
 * Or `selectArtistDetail` n'est pas appelée que depuis la liste d'artistes :
 * elle l'est aussi depuis la fiche d'un album (lien sur le nom de l'artiste),
 * depuis les pastilles de crédits, depuis les liens artiste des pistes, depuis
 * le fil des « artistes similaires » et depuis `goBack()` lui-même quand ce
 * fil se dépile. Dans tous ces cas la position lue sur `.library-scroller` est
 * celle d'une PAGE DE DÉTAIL — quasiment toujours 0 — et elle écrase la
 * position de la liste qui avait été correctement mémorisée à l'entrée.
 *
 * Comme `restoreArtistScrollWhenReady` ne fait rien pour une cible <= 0, le
 * retour final laisse la liste tout en haut : « ramène toujours en début de
 * liste », très exactement.
 *
 * La capture de la grille d'albums, elle, était déjà gardée
 * (`if (!$selectedAlbum) savedAlbumScrollTop = …`) ; l'artiste n'avait jamais
 * reçu la garde équivalente. C'est ce trou que cette fonction bouche.
 */

/** Ce qui est ouvert au moment où l'on entre dans une fiche artiste. */
export interface EtatDetailOuvert {
  /** Une fiche album est affichée. */
  albumOuvert: boolean;
  /** Une fiche artiste est déjà affichée (fil des artistes similaires). */
  artisteOuvert: boolean;
}

/**
 * Vrai seulement si l'on quitte réellement une LISTE pour entrer dans une
 * fiche artiste. Depuis une fiche déjà ouverte, la position courante n'est pas
 * celle de la liste : la mémoriser détruirait la seule qu'il fallait garder.
 */
export function doitMemoriserPositionListe(etat: EtatDetailOuvert): boolean {
  return !etat.albumOuvert && !etat.artisteOuvert;
}
