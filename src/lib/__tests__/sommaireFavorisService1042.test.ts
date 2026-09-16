/**
 * #1042 — GgB, fil 1671 : « il faut scroller complètement chaque catégorie
 * albums, artistes, titres, possible d'avoir des sous index favoris pour y
 * accéder ». Un sommaire collé en haut des favoris d'un service : une
 * pastille par nature présente, avec son compte, qui amène à sa section.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(process.cwd(), 'src/components/v2/StreamingV2.svelte'), 'utf-8')
  .replace(/<!--[\s\S]*?-->/g, '');

describe('#1042 — le sommaire des favoris de service', () => {
  it('🔴 une pastille par nature PRÉSENTE, avec son compte, et rien à une seule nature', () => {
    expect(src).toContain("{ id: 'fav-albums', cle: 'v2.rech.albums', n: favAlbums.length }");
    expect(src).toContain("{ id: 'fav-artistes', cle: 'v2.rech.artists', n: favArtists.length }");
    expect(src).toContain("{ id: 'fav-titres', cle: 'v2.rech.tracks', n: favTracks.length }");
    expect(src).toContain('].filter((x) => x.n > 0)}');
    expect(src).toContain('{#if natures.length > 1}');
    expect(src).toContain('<span class="n">{x.n}</span>');
  });
  it('🔴 chaque pastille amène à SA section — les ancres existent', () => {
    expect(src).toContain('onclick={() => allerA(x.id)}');
    expect(src).toContain('<section class="sec" id="fav-albums">');
    expect(src).toContain('<section class="sec" id="fav-artistes">');
    expect(src).toContain('<section class="sec" id="fav-titres">');
    expect(src).toContain("document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });");
  });
  it('collé en haut du défilement', () => {
    expect(src).toMatch(/\.sommaire\{position:sticky; top:0;/);
  });
  it('le libellé accessible existe dans les onze langues', async () => {
    for (const code of ['fr', 'en', 'de', 'es', 'it', 'ro', 'sv', 'hu', 'ja', 'ko', 'zh']) {
      const dico = (await import(`../locales/${code}`)).default as Record<string, string>;
      expect(dico['v2.stream.favIndex'], code).toBeTruthy();
    }
  });
});
