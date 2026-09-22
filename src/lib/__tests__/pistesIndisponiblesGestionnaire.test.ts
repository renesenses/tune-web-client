import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pisteIndisponible } from '../albumAParaitre';

/**
 * Une piste que le service dit indisponible doit se VOIR (#playlists,
 * Bertrand, 21/09/2026, sur « tttroys playlist »).
 *
 * Mesuré sur le .18 avant d'écrire : la route rend bien `disponible`, et
 * 186 des 1 454 pistes de cette playlist valent `false` — dont la PREMIÈRE,
 * qui s'affichait exactement comme les autres.
 *
 * 🔴 Le mécanisme existait depuis le 17/09 dans `ListePistesV2` et
 * `LignePisteV2`. Le gestionnaire a sa PROPRE liste de pistes : troisième
 * rendu, troisième oubli. Ce test garde les trois d'un coup.
 */
const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const ECRANS = {
  gestionnaire: 'src/components/v2-heritage/PlaylistManagerView.svelte',
  liste: 'src/components/v2/ListePistesV2.svelte',
  ligne: 'src/components/v2/LignePisteV2.svelte',
};

describe('pistes indisponibles', () => {
  it('le prédicat ne se déclenche que sur un `disponible` FAUX', () => {
    expect(pisteIndisponible({ disponible: false })).toBe(true);
    expect(pisteIndisponible({ disponible: true })).toBe(false);
    // Absent ≠ indisponible : un service qui ne dit rien ne condamne pas la
    // piste. C'est le cas de toutes les pistes locales.
    expect(pisteIndisponible({})).toBe(false);
    expect(pisteIndisponible(null)).toBe(false);
  });

  it('🔴 les TROIS rendus de piste la grisent', () => {
    for (const [nom, chemin] of Object.entries(ECRANS)) {
      const src = lire(chemin);
      expect(src, `${nom} n'importe pas le prédicat`).toContain('pisteIndisponible');
      expect(src, `${nom} ne pose pas la classe`).toMatch(/class:indispo/);
    }
  });

  it('et ne la lancent pas : la lire rendrait « no url »', () => {
    const g = lire(ECRANS.gestionnaire);
    expect(g).toContain('if (!indispo) playFromIndex(index)');
    expect(g).toContain('disabled={indispo}');
    expect(lire(ECRANS.ligne)).toContain('if (!indispo) onLire()');
  });

  it('le gestionnaire la NOMME, et avec le bon mot', () => {
    const g = lire(ECRANS.gestionnaire);
    // `playlist.unavailable` = « Indisponible ». Les deux autres écrans
    // utilisent `v2.str.coming` = « À paraître », qui ne veut pas dire la
    // même chose : une piste retirée du catalogue n'est pas à venir.
    expect(g).toContain("$tr('playlist.unavailable')");
    const fr = lire('src/lib/locales/fr.ts');
    expect(fr).toContain("'playlist.unavailable': 'Indisponible'");
  });
});
