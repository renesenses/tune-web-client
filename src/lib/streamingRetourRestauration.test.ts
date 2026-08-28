import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { etapesDeRestauration } from './streamingRetour';

/**
 * Le défaut de Sandro (fil 1553) survit à un aller-retour hors de la vue.
 *
 * `actionRetour` (voir `streamingRetour.test.ts`) règle le parcours en ligne
 * droite : racine → artiste → album → Retour ⇒ fiche artiste. Mais
 * `StreamingView` est monté dans la chaîne `{#if $activeView === …}` de
 * `App.svelte` : quitter Qobuz DÉTRUIT le composant et perd tout son `$state`.
 * C'est pour ça qu'il enregistre un instantané de sa position
 * (`saveViewContext('streaming', …)`) et le rétablit au montage suivant.
 *
 * Or cet instantané contient les DEUX niveaux — l'album et l'artiste — et la
 * restauration n'en rouvrait qu'un :
 *
 *     } else if (ctx.selectedAlbum) {
 *       await selectAlbum(ctx.selectedAlbum);   // sans `depuisArtiste`
 *
 * `selectAlbum` remet alors `selectedArtist` à `null`, et le « Retour » qui
 * suit retombe à la racine du service. Exactement le symptôme de Sandro,
 * réintroduit par le simple fait d'être passé par la file d'attente ou le
 * lecteur avant d'appuyer sur Retour.
 *
 * La séquence protégée ici est donc celle du testeur, prolongée d'un
 * aller-retour :
 *
 *     racine → artiste → album → (on quitte la vue) → (on y revient)
 *            → Retour ⇒ fiche artiste
 */
describe('etapesDeRestauration', () => {
  it("rouvre l'artiste PUIS l'album quand les deux niveaux étaient ouverts", () => {
    // Le cas de Sandro après un aller-retour. L'ordre compte : `selectArtist`
    // remet `selectedAlbum` à `null`, donc l'album doit être rouvert APRÈS,
    // et en annonçant sa provenance pour que le niveau artiste survive.
    expect(
      etapesDeRestauration({
        album: true,
        artiste: true,
        playlist: false,
        genres: false,
        recherche: false,
      }),
    ).toEqual([{ etape: 'artiste' }, { etape: 'album', depuisArtiste: true }]);
  });

  it("ne rouvre que l'album quand il n'y avait pas d'artiste dessous", () => {
    // Album ouvert depuis les résultats, l'accueil ou un genre : rouvrir un
    // artiste ici inventerait un niveau que l'auditeur n'a jamais ouvert.
    expect(
      etapesDeRestauration({
        album: true,
        artiste: false,
        playlist: false,
        genres: false,
        recherche: false,
      }),
    ).toEqual([{ etape: 'album', depuisArtiste: false }]);
  });

  it("rouvre la seule fiche artiste quand aucun album n'était ouvert", () => {
    expect(
      etapesDeRestauration({
        album: false,
        artiste: true,
        playlist: false,
        genres: false,
        recherche: false,
      }),
    ).toEqual([{ etape: 'artiste' }]);
  });

  it('le fil de genres prime sur tout le reste', () => {
    // Comportement d'avant, préservé : la navigation par genres est un fil à
    // part, rétabli par `restoreGenreBrowsing` et non par les fiches.
    expect(
      etapesDeRestauration({
        album: true,
        artiste: true,
        playlist: false,
        genres: true,
        recherche: false,
      }),
    ).toEqual([{ etape: 'genres' }]);
  });

  it('rouvre la playlist du service quand c\'est elle qui était ouverte', () => {
    expect(
      etapesDeRestauration({
        album: false,
        artiste: false,
        playlist: true,
        genres: false,
        recherche: false,
      }),
    ).toEqual([{ etape: 'playlist' }]);
  });

  it('rejoue la recherche quand rien n\'était ouvert par-dessus', () => {
    expect(
      etapesDeRestauration({
        album: false,
        artiste: false,
        playlist: false,
        genres: false,
        recherche: true,
      }),
    ).toEqual([{ etape: 'recherche' }]);
  });

  it('ne rouvre rien quand la position était la racine du service', () => {
    expect(
      etapesDeRestauration({
        album: false,
        artiste: false,
        playlist: false,
        genres: false,
        recherche: false,
      }),
    ).toEqual([]);
  });
});

describe('StreamingView applique la restauration à deux niveaux', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/StreamingView.svelte'),
    'utf-8',
  );

  const debut = source.indexOf('async function restaurerContexte(');
  const corps = debut === -1 ? '' : source.slice(debut, source.indexOf('\n  }', debut));

  it('restaurerContexte existe toujours', () => {
    expect(debut).toBeGreaterThan(-1);
  });

  it("restaurerContexte s'en remet à etapesDeRestauration", () => {
    // Sans ça, la décision prouvée ci-dessus ne serait branchée sur rien et la
    // suite resterait verte pendant que le défaut revient dans le composant.
    expect(corps).toContain('etapesDeRestauration(');
  });

  it("restaurerContexte ne rouvre plus l'album en écrasant l'artiste", () => {
    // La ligne fautive, mot pour mot : l'album rouvert sans sa provenance.
    expect(corps).not.toContain('selectAlbum(ctx.selectedAlbum)');
  });

  it('etapesDeRestauration est bien importé par le composant', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\betapesDeRestauration\b[^}]*\}\s*from\s*'\.\.\/lib\/streamingRetour'/,
    );
  });
});
