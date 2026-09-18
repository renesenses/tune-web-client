import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';

vi.mock('../api', () => ({ searchLibrary: vi.fn() }));
import { artisteDeService, ouvrirArtisteDepuis } from '../ouvrirArtisteDepuis';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';

describe('#1194 — les vignettes d’artiste favori d’un service s’ouvrent', () => {
  beforeEach(() => {
    activeView.set('streaming');
    vueDeRetour.set(null);
    ficheArtisteService.set(null as any);
  });

  it('réconcilie `id` et `source_id`, que les routes ne nomment pas pareil', () => {
    // Les favoris rendent `source_id`…
    expect(artisteDeService({ name: 'The Cure', source_id: '42' }, 'qobuz'))
      .toMatchObject({ name: 'The Cure', source: 'qobuz', source_id: '42' });
    // …la recherche rend `id` (mesuré sur le .18 le 07/09/2026).
    expect(artisteDeService({ name: 'Marillion', id: 4626308 }, 'qobuz'))
      .toMatchObject({ source: 'qobuz', source_id: '4626308' });
    // La source portée par l'objet PRIME sur celle de l'écran.
    expect(artisteDeService({ name: 'X', id: '7', source: 'tidal' }, 'qobuz'))
      .toMatchObject({ source: 'tidal' });
  });

  it('sans quoi ouvrir, elle rend un geste ABSENT plutôt qu’un geste qui échoue', () => {
    expect(artisteDeService({}, 'qobuz')).toBeNull();
    expect(artisteDeService(null, 'qobuz')).toBeNull();
    // Un nom seul reste exploitable : la fiche se cherche par le nom.
    expect(artisteDeService({ name: 'Landscape' }, null)).toEqual({ name: 'Landscape' });
  });

  it('le clic mène à la fiche du service, avec le chemin de retour', async () => {
    const cible = artisteDeService({ name: 'Syd Matters', source_id: '99' }, 'qobuz');
    await ouvrirArtisteDepuis(cible, 'streaming');
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toEqual({ service: 'qobuz', id: '99', nom: 'Syd Matters' });
    expect(get(vueDeRetour)).toBe('streaming');
  });

  it('l’écran branche le geste sur la pochette ET sur le nom', () => {
    const src = readFileSync('src/components/v2/StreamingV2.svelte', 'utf8');
    expect(src).toContain('artisteDeService(ar, active)');
    expect(src).toContain("onOuvrir={cible ? () => ouvrirArtisteDepuis(cible, 'streaming') : null}");
    // Le nom était un `<span>` : c'est ce qui le rendait mort au clic.
    expect(src).toMatch(/<button class="an anbtn"[^>]*onclick=\{\(\) => ouvrirArtisteDepuis\(cible, 'streaming'\)\}/);
  });
});
