/**
 * L'écran « Pont Roon » — la logique, sans DOM.
 *
 * Bertrand, 16/09/2026 : le pont Roon (crédits, images, écran d'import) « en
 * plugin PREMIUM ». Le moissonneur range dans UNE archive l'export et les
 * octets des images ; l'extension serveur l'importe. L'écran :
 *
 *   1. dit d'abord POURQUOI on ne peut pas importer, s'il ne le peut pas :
 *      extension absente (404) ou droit Premium manquant (402 / premium=false) ;
 *   2. propose un APERÇU avant toute écriture — Tune ne remplace jamais une
 *      image ni un crédit qu'il a déjà, mais l'utilisateur voit ce qui va
 *      changer avant que ça change ;
 *   3. résume le rapport en lignes lisibles.
 */
import type { RapportPontRoon } from './api/pontRoon';

export type EtatPontRoon = 'chargement' | 'absent' | 'no-premium' | 'pret' | 'erreur';

export function etatPontRoon(status: number | null, premium: boolean | undefined): EtatPontRoon {
  if (status == null) return 'chargement';
  if (status === 404) return 'absent';
  if (status === 402) return 'no-premium';
  if (status >= 200 && status < 300) return premium ? 'pret' : 'no-premium';
  return 'erreur';
}

/** Une ligne du rapport : une clé i18n et ses valeurs. */
export interface LigneRapport {
  cle: string;
  valeurs: Record<string, number>;
}

/**
 * Les lignes à afficher. En aperçu, ce qui SERAIT écrit ; après import, ce
 * qui l'a été. Une ligne à zéro partout n'est pas affichée — sauf
 * l'appariement, qui dit si l'export vient bien de cette bibliothèque.
 */
export function lignesDuRapport(r: RapportPontRoon): LigneRapport[] {
  const lignes: LigneRapport[] = [
    { cle: 'v2.roon.lineArtists', valeurs: { n: r.artistes_apparies, total: r.artistes_total } },
    { cle: 'v2.roon.lineAlbums', valeurs: { n: r.albums_apparies, total: r.albums_total } },
    { cle: 'v2.roon.lineTracks', valeurs: { n: r.pistes_appariees, total: r.pistes_total } },
  ];
  const credits = r.preview ? r.credits_a_ecrire : r.credits_ecrits;
  if (credits || r.credits_deja_presents) {
    lignes.push({ cle: r.preview ? 'v2.roon.lineCreditsPreview' : 'v2.roon.lineCreditsDone', valeurs: { n: credits, kept: r.credits_deja_presents } });
  }
  const artistes = r.preview ? r.images_artistes_a_poser : r.images_artistes_posees;
  const albums = r.preview ? r.images_albums_a_poser : r.images_albums_posees;
  if (artistes || albums) {
    lignes.push({ cle: r.preview ? 'v2.roon.lineImagesPreview' : 'v2.roon.lineImagesDone', valeurs: { artists: artistes, albums } });
  }
  if (r.images_nommees && !r.images_portees) {
    lignes.push({ cle: 'v2.roon.lineNoImageBytes', valeurs: { n: r.images_nommees } });
  }
  return lignes;
}

/** Remplit `{n}`, `{total}`… dans un libellé traduit. */
export function remplir(modele: string, valeurs: Record<string, number>, format: (n: number) => string = String): string {
  return modele.replace(/\{(\w+)\}/g, (m, k) => (k in valeurs ? format(valeurs[k]) : m));
}

/** Rien de ce que l'export porte ne correspond à cette bibliothèque. */
export function aucunAppariement(r: RapportPontRoon): boolean {
  return r.artistes_total > 0 && r.artistes_apparies === 0;
}
