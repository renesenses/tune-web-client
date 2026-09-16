import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mentionAussiSur } from '../aussiSur';

describe('« aussi sur … » — phase 5 UPnP', () => {
  it('dit le local sur un album distant, les serveurs sur un album local', () => {
    expect(mentionAussiSur([{ album_id: 10, local: true, serveur: null }])).toEqual({ cle: 'v2.album.alsoOnLocal', serveurs: [] });
    expect(mentionAussiSur([
      { album_id: 11, local: false, serveur: 'Salon' },
      { album_id: 12, local: false, serveur: 'Salon' },
      { album_id: 13, local: false, serveur: 'Bureau' },
    ])).toEqual({ cle: 'v2.album.alsoOn', serveurs: ['Salon', 'Bureau'] });
  });

  it('se tait quand il n’y a rien, et reste vague sans nom de serveur', () => {
    expect(mentionAussiSur([])).toBeNull();
    expect(mentionAussiSur(null)).toBeNull();
    expect(mentionAussiSur([{ album_id: 11, local: false, serveur: ' ' }])).toEqual({ cle: 'v2.album.alsoOnNetwork', serveurs: [] });
  });

  it('la fiche album appelle la route et rend la mention', () => {
    const src = readFileSync(fileURLToPath(new URL('../../components/v2/AlbumDetailV2.svelte', import.meta.url)), 'utf8');
    expect(src.includes('api.getAussiSur(')).toBe(true);
    expect(src).toMatch(/\{#if mention\}<div class="qbadge/);
    const api = readFileSync(fileURLToPath(new URL('../api.ts', import.meta.url)), 'utf8');
    expect(api).toMatch(/\/library\/albums\/\$\{albumId\}\/aussi-sur/);
  });
});
