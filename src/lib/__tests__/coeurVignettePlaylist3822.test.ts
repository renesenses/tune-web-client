/**
 * Le cœur des VIGNETTES de playlist de service — #3822 (FabienM, fil 1749,
 * point 12 sur 12, v0.9.145).
 *
 * > « Il n'y a pas l'icone du coeur sur les playlist Qobuz pour les mettre en
 * >   favoris -> il faut rajouter l'icone dans le coin de la vignette »
 *
 * Le cœur existait déjà sur la FICHE (`PlaylistDetailV2`, #2370), jamais sur la
 * vignette. `tile()` de `StreamingV2` décide du cœur par son paramètre `type` :
 * il dit CE QU'ON MET en favori, et `favoriExterne` reste `null` quand `type`
 * est `null`. Les deux rangées de playlists passaient précisément `null`, au
 * nom d'une règle écrite dans le commentaire du snippet — « la table ne connait
 * que piste, album et artiste » — devenue fausse avec #2370, qui a ajouté
 * `playlist` à `StreamingItemType`.
 *
 * ## Pourquoi une garde de CODE et pas un test de rendu
 *
 * Le défaut ne vit pas dans une fonction : il vit dans deux arguments de
 * `{@render tile(...)}`. Aucune valeur de retour ne le trahit, et monter
 * `StreamingV2` demanderait le store de profil, l'API et les quatre services.
 * C'est la même forme de garde que celle de `favoriPlaylistQobuz.test.ts` pour
 * la fiche : on vérifie que le bouton est BRANCHÉ, le moteur étant déjà testé.
 *
 * ## Ce que ce fichier NE couvre pas
 *
 * Les widgets (Éditorial, Accueil) : `widgetsService.ts` ne donne pas de
 * `fiche` aux playlists et `PageWidgets.svelte` type son `favoriExterne` en
 * `'album'` en dur. C'est la seconde moitié de #3822, hors de cette passe.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { StreamingItemType } from '../streamingFavorites';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/v2/StreamingV2.svelte'),
  'utf-8',
);

/** Une ligne précise du fichier, isolée par un motif qui ne vaut que pour elle.
 *  Chercher « tile( » tout court rendrait les douze rangées de l'écran. */
function ligne(motif: string): string {
  const trouvees = source.split('\n').filter((l) => l.includes(motif));
  expect(trouvees, `le motif « ${motif} » doit désigner UNE ligne`).toHaveLength(1);
  return trouvees[0];
}

describe('#3822 — la vignette d\'une playlist de service porte le cœur', () => {
  /** Le type de la table connaît `playlist` : c'est le prérequis du correctif,
   *  et ce qui rend fausse la règle citée par le commentaire du snippet. */
  it('`StreamingItemType` accepte bien `playlist` (acquis de #2370)', () => {
    const t: StreamingItemType = 'playlist';
    expect(t).toBe('playlist');
  });

  it('`tile()` accepte le type `playlist`', () => {
    const signature = ligne('{#snippet tile(');
    expect(signature).toContain("'playlist'");
  });

  /** Rangée « Playlists » des résultats de recherche. */
  it('la rangée de recherche passe `playlist`, plus `null`', () => {
    const l = ligne('#each results.playlists as pl');
    expect(l).toContain("playPlaylist(pl), 'playlist'");
    expect(l, 'un `null` résiduel rendrait le cœur absent').not.toMatch(
      /playPlaylist\(pl\),\s*null/,
    );
  });

  /** Onglet « Mes playlists ». Son quatrième argument ouvre la fiche : il doit
   *  survivre au changement, sinon le clic sur la pochette n'ouvrirait plus
   *  rien et on aurait troqué un défaut contre un autre. */
  it('la rangée « mes playlists » passe `playlist` et garde son ouverture de fiche', () => {
    const l = ligne('#each myPlaylists as p');
    expect(l).toContain("playPlaylist(p), 'playlist'");
    expect(l).toContain('fichePlaylist = p');
    expect(l).not.toMatch(/playPlaylist\(p\),\s*null/);
  });

  /** La garde de `ouvrirFiche` est ce qui rend le changement sans effet de
   *  bord : hors `album`, elle rend `null`, donc le type n'ajoute QUE le cœur.
   *  Si quelqu'un l'élargit un jour, ce test doit tomber et forcer à revérifier
   *  que passer `playlist` n'ouvre pas une fiche d'album. */
  it('`ouvrirFiche` ne fabrique de fiche que pour un album', () => {
    expect(source).toContain("if (type !== 'album'");
  });
});
