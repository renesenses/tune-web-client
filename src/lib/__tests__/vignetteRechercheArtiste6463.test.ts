// @vitest-environment jsdom
//
// tune-server-rust#6463 (FabienM, fil 2302, point 3) — « la recherche
// "christophe" donne meilleur résultat avec la bonne vignette mais quand je
// clique dessus je n'ai pas de vignette ».
//
// La tuile FUSIONNE les artistes du même nom (`regrouperArtistes`) : elle
// ouvre la provenance en tête mais peut montrer l'image d'une autre. La
// vignette suit désormais le clic, en repli de l'en-tête de la fiche.
import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { regrouperArtistes } from '../rechercheClassement';
import { ouvrirArtisteDepuis } from '../ouvrirArtisteDepuis';
import { ficheArtisteService } from '../stores/streaming';

describe('la tuile fusionnée et son image', () => {
  it('le cas du fil : la tête de rangée sans image, l’image d’une autre provenance', () => {
    const [christophe] = regrouperArtistes([
      { id: 12, name: 'Christophe', image_path: null, source: 'local' } as any,
      { id: 'q1', source_id: 'q1', name: 'Christophe', image_path: 'https://static.qobuz.test/christophe.jpg', source: 'qobuz' } as any,
    ]);
    expect(christophe.source).toBe('local');
    expect(christophe.id).toBe(12);
    expect(christophe.image_path).toBe('https://static.qobuz.test/christophe.jpg');
  });
});

describe('la vignette suit l’ouverture de la fiche', () => {
  beforeEach(() => ficheArtisteService.set(null));

  it('artiste de la bibliothèque : la fiche reçoit l’image en repli', async () => {
    await ouvrirArtisteDepuis({ id: 12, name: 'Christophe' }, 'search', { image: 'https://static.qobuz.test/christophe.jpg' });
    expect(get(ficheArtisteService)).toMatchObject({ service: null, id: '12', image: 'https://static.qobuz.test/christophe.jpg' });
  });

  it('artiste de service : aussi', async () => {
    await ouvrirArtisteDepuis({ source: 'tidal', source_id: 't9', name: 'Christophe' }, 'search', { image: 'https://i/c.jpg' });
    expect(get(ficheArtisteService)).toMatchObject({ service: 'tidal', id: 't9', image: 'https://i/c.jpg' });
  });

  it('sans image : aucun champ, la fiche se comporte comme avant', async () => {
    await ouvrirArtisteDepuis({ id: 12, name: 'Christophe' }, 'search');
    expect(get(ficheArtisteService)).not.toHaveProperty('image');
  });
});

describe('les deux bouts du fil', () => {
  it('la Recherche passe la vignette de la tuile', () => {
    const src = readFileSync('src/components/v2/SearchV2.svelte', 'utf8');
    expect(src).toContain("void ouvrirArtisteDepuis(ar, 'search', { image: ar?.image_path ?? null });");
  });
  it('l’en-tête de la fiche prend son portrait d’abord, la vignette reçue ensuite', () => {
    const src = readFileSync('src/components/v2/ArtisteServiceV2.svelte', 'utf8');
    expect(src).toContain('imagePath={artiste?.image_path || cible?.image || null}');
  });
});
