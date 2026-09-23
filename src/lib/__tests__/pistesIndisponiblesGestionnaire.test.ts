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
 * `LignePisteV2`. Le gestionnaire avait alors sa PROPRE liste de pistes :
 * troisième rendu, troisième oubli. Depuis le 23/09/2026 il rend la liste
 * commune (Bertrand) : il n'y a plus que DEUX rendus à garder — et l'écran
 * doit toujours nommer la chose avec le bon mot, par la prop prévue pour ça.
 */
const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const ECRANS = {
  liste: 'src/components/v2/ListePistesV2.svelte',
  ligne: 'src/components/v2/LignePisteV2.svelte',
};
const GESTIONNAIRE = 'src/components/v2-heritage/PlaylistManagerView.svelte';

describe('pistes indisponibles', () => {
  it('le prédicat ne se déclenche que sur un `disponible` FAUX', () => {
    expect(pisteIndisponible({ disponible: false })).toBe(true);
    expect(pisteIndisponible({ disponible: true })).toBe(false);
    // Absent ≠ indisponible : un service qui ne dit rien ne condamne pas la
    // piste. C'est le cas de toutes les pistes locales.
    expect(pisteIndisponible({})).toBe(false);
    expect(pisteIndisponible(null)).toBe(false);
  });

  it('🔴 les DEUX rendus de piste la grisent', () => {
    for (const [nom, chemin] of Object.entries(ECRANS)) {
      const src = lire(chemin);
      expect(src, `${nom} n'importe pas le prédicat`).toContain('pisteIndisponible');
      expect(src, `${nom} ne pose pas la classe`).toMatch(/class:indispo/);
    }
  });

  it('et ne la lancent pas : la lire rendrait « no url »', () => {
    expect(lire(ECRANS.liste)).toContain('if (!indispo) onLire(p, i)');
    expect(lire(ECRANS.liste)).toContain('disabled={indispo}');
    expect(lire(ECRANS.ligne)).toContain('if (!indispo) onLire()');
  });

  it('🔴 le gestionnaire ne rend plus de piste lui-même : il passe par la liste commune', () => {
    const g = lire(GESTIONNAIRE);
    expect(g).toMatch(/<ListePistesV2 pistes=\{detailTracks\}/);
    expect(g).not.toContain('pisteIndisponible');
    expect(g).not.toContain('track-item');
  });

  it('et la NOMME encore avec le bon mot, par la prop de la liste', () => {
    // `playlist.unavailable` = « Indisponible ». Le défaut de la liste est
    // `v2.str.coming` = « À paraître », qui ne veut pas dire la même chose :
    // une piste retirée du catalogue n'est pas à venir. L'écran le dit.
    expect(lire(GESTIONNAIRE)).toContain('etiquetteIndispo="playlist.unavailable"');
    for (const chemin of Object.values(ECRANS)) {
      const src = lire(chemin);
      expect(src, `${chemin} ignore la prop`).toContain('$t(etiquetteIndispo as any)');
      expect(src, `${chemin} garde un libellé en dur`).not.toContain("$t('v2.str.coming' as any)");
    }
    const fr = lire('src/lib/locales/fr.ts');
    expect(fr).toContain("'playlist.unavailable': 'Indisponible'");
  });
});
