// #1429 — GgB, fil 1883, 0.9.161 : sur Streaming ▸ Qobuz ▸ Éditorial, la bande
// « Nouveautés » puis la bande « New Releases » montrent les MÊMES albums dans
// le même ordre. La première est posée en dur (`/streaming/qobuz/new-releases`),
// la seconde vient de la section éditoriale `new-releases` — et les deux
// routes appellent `/album/getFeatured?type=new-releases` côté serveur.
//
// Ce témoin porte sur le CATALOGUE réel (celui que l'écran rend) et sur la
// disposition par défaut qui en découle — pas sur les identifiants seuls :
// le contrôle anti-doublon d'avant ne regardait que des `id`, distincts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as api from '../api';
import { catalogueService, dispositionDefautService, remplacerAliasWidgets } from '../widgetsService';

const SECTIONS_QOBUZ = [
  { id: 'new-releases', name: 'New Releases' },
  { id: 'best-sellers', name: 'Best Sellers' },
  { id: 'press-awards', name: 'Press Awards' },
];

function serveur() {
  vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue(SECTIONS_QOBUZ as any);
  vi.spyOn(api, 'getStreamingGenres').mockResolvedValue([] as any);
  vi.spyOn(api, 'getStreamingFeaturedPlaylistsByTag').mockResolvedValue([] as any);
}

afterEach(() => vi.restoreAllMocks());

describe('#1429 — une seule bande de nouveautés Qobuz', () => {
  it('🔴 le catalogue ne pose pas la section new-releases EN PLUS de la bande Nouveautés', async () => {
    serveur();
    const ids = (await catalogueService('qobuz')).map((w) => w.id);
    expect(ids).toContain('qobuz-nouveautes');
    expect(ids).not.toContain('qobuz-sec-new-releases');
    // Les autres sections restent : seule celle que la bande en dur recouvre part.
    expect(ids).toContain('qobuz-sec-best-sellers');
    expect(ids).toContain('qobuz-sec-press-awards');
  });

  it('🔴 la disposition par défaut ne rend qu’une bande de nouveautés', async () => {
    serveur();
    const d = dispositionDefautService(await catalogueService('qobuz'));
    expect(d.filter((id) => /nouveautes|new-releases/.test(id))).toEqual(['qobuz-nouveautes']);
  });

  it('une disposition enregistrée qui ne gardait que « New Releases » garde ses nouveautés', () => {
    expect(remplacerAliasWidgets(['qobuz-favoris', 'qobuz-sec-new-releases', 'qobuz-sec-best-sellers']))
      .toEqual(['qobuz-favoris', 'qobuz-nouveautes', 'qobuz-sec-best-sellers']);
    // Les deux enregistrées (la disposition par défaut d'avant) : une seule reste.
    expect(remplacerAliasWidgets(['qobuz-nouveautes', 'qobuz-sec-new-releases']))
      .toEqual(['qobuz-nouveautes']);
    expect(remplacerAliasWidgets(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('PageWidgets remplace les alias AVANT de filtrer la disposition enregistrée', () => {
    const src = readFileSync('src/components/v2/PageWidgets.svelte', 'utf8');
    const alias = src.indexOf('dispositionEnregistree = remplacerAliasWidgets(dispositionEnregistree);');
    const filtre = src.indexOf('disposition = dispositionEnregistree.filter((id) => parId(id));');
    expect(alias).toBeGreaterThan(-1);
    expect(filtre).toBeGreaterThan(alias);
  });
});
