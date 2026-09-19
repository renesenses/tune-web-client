import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Enrichissement — deux gestes portés de l'ancienne interface, seul écran qui
 * les offrait : la passe FORCÉE des portraits d'artistes (remplacer un mauvais
 * portrait, que la passe normale saute), et la recherche des pochettes
 * d'ALBUM manquantes.
 */
const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
const debut = V2.indexOf("{:else if s.id === 'enrichment'}");
const bloc = V2.slice(debut, V2.indexOf('{:else if s.id ===', debut + 1));
const corps = (nom: string) => {
  const i = V2.indexOf(`async function ${nom}(`);
  expect(i, `fonction introuvable : ${nom}`).toBeGreaterThan(-1);
  return V2.slice(i, V2.indexOf('\n  }\n', i));
};

describe('Enrichissement : portraits forcés, pochettes d’album', () => {
  it('la passe forcée est offerte, et vise la route qui n’épargne aucun artiste', () => {
    expect(bloc).toContain('onclick={forceCovers}');
    expect(corps('forceCovers')).toContain('api.forceRefetchArtistImages()');
    // Et la passe normale reste distincte : les deux boutons ne se confondent pas.
    expect(bloc).toContain('onclick={startCovers}');
    expect(corps('startCovers')).not.toContain('forceRefetchArtistImages');
  });

  it('la recherche des pochettes d’album est offerte', () => {
    expect(bloc).toContain('onclick={rescanAlbumCovers}');
    expect(corps('rescanAlbumCovers')).toContain('api.rescanArtwork()');
  });

  it('un échec de lancement est dit', () => {
    for (const f of ['forceCovers', 'rescanAlbumCovers']) {
      expect(corps(f), f).toContain("enrichErr = get(t)('settings.errStartFailed')");
    }
  });
});
