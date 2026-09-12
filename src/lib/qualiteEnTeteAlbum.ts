/**
 * La qualite annoncee en TETE d'une fiche album.
 *
 * ## 🔴 `renesenses/tune-web-client#852`
 *
 * Pierre M, fil 1671 : son album « Everybody's Got A Story (SACD) » porte le
 * badge d'en-tete **CD** alors que le tableau, deux centimetres plus bas,
 * affiche `HI-RES FLAC 88.2/24` sur chacune de ses douze pistes.
 *
 * L'en-tete lisait les colonnes de la table `albums` (`format`, `sample_rate`,
 * `bit_depth`), remplies une seule fois au scan et jamais recalculees. Et
 * quand `format` etait nul, le libelle retombait sur la chaine `'CD'` :
 *
 *     return album.format?.toUpperCase() ?? 'CD';
 *
 * 🔴 Ce repli est une INVENTION. « Format inconnu » n'est pas « CD » — c'est
 * le meme defaut que le client du spectre, qui recopiait une taille de FFT
 * qu'il ne mesurait pas (#892). On ne remplace plus une absence par une
 * affirmation.
 *
 * ## Ce qu'on fait a la place : croire les PISTES
 *
 * La fiche a deja charge ses pistes — c'est ce que le tableau affiche. Elles
 * sont la source la plus fraiche : chacune porte le format et la resolution du
 * FICHIER, relus a chaque scan. On calcule donc l'en-tete sur elles, et on ne
 * retombe sur les colonnes de l'album que si aucune piste n'est encore la.
 *
 * L'en-tete et le tableau disent alors la meme chose PAR CONSTRUCTION, quelle
 * que soit la voie qui a produit le « CD » chez lui — et le ticket dit
 * justement que cette voie n'est pas etablie.
 *
 * ⚠️ Mesure du 12/09/2026 sur la .18 : 150 albums recoupes avec leurs pistes,
 * **zero desaccord**, et 0/400 albums sans `format`. Le cas de Pierre M n'est
 * donc pas reproductible sur cette bibliotheque-la — ce qui est reproductible,
 * c'est le repli qui invente.
 */

export interface QualiteSource {
  format?: string | null;
  sample_rate?: number | null;
  bit_depth?: number | null;
}

/** Ce que l'en-tete doit annoncer, ou `null` quand on ne sait pas. */
export interface QualiteEnTete {
  format: string | null;
  sampleRate: number | null;
  bitDepth: number | null;
}

/**
 * La qualite de l'album, deduite de ses pistes quand il en a.
 *
 * On prend le MAXIMUM de frequence et de profondeur : un album dont une piste
 * est en 88,2/24 est un album hi-res, meme si un bonus y est en 44,1/16.
 * C'est aussi ce que le serveur fait quand il remplit ses colonnes
 * (`COALESCE(albums.sample_rate, MAX(tracks…))`).
 *
 * Rend `null` quand ni les pistes ni l'album ne portent quoi que ce soit :
 * l'ecran n'affiche alors PAS de badge, au lieu d'en inventer un.
 */
export function qualiteEnTeteAlbum(
  album: QualiteSource | null | undefined,
  pistes: readonly QualiteSource[] | null | undefined,
): QualiteEnTete | null {
  const p = pistes ?? [];
  const srs = p.map((t) => t.sample_rate).filter((x): x is number => typeof x === 'number' && x > 0);
  const bds = p.map((t) => t.bit_depth).filter((x): x is number => typeof x === 'number' && x > 0);
  const fmts = p.map((t) => t.format).filter((x): x is string => typeof x === 'string' && x !== '');

  const sampleRate = srs.length ? Math.max(...srs) : (album?.sample_rate ?? null);
  const bitDepth = bds.length ? Math.max(...bds) : (album?.bit_depth ?? null);
  const format = fmts.length ? formatDominant(fmts) : (album?.format ?? null);

  if (format == null && sampleRate == null && bitDepth == null) return null;
  return { format, sampleRate, bitDepth };
}

/**
 * Le format le plus repandu parmi les pistes.
 *
 * Un album melange (douze FLAC et un MP3 en bonus) s'annonce par ce qu'il est
 * pour l'essentiel. A egalite, le premier rencontre gagne — c'est l'ordre du
 * disque, donc stable d'un affichage a l'autre.
 */
export function formatDominant(formats: readonly string[]): string | null {
  if (!formats.length) return null;
  const compte = new Map<string, number>();
  for (const f of formats) {
    const k = f.toLowerCase();
    compte.set(k, (compte.get(k) ?? 0) + 1);
  }
  let gagnant: string | null = null;
  let meilleur = -1;
  for (const [k, n] of compte) {
    if (n > meilleur) { meilleur = n; gagnant = k; }
  }
  return gagnant;
}
