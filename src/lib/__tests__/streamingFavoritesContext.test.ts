import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/StreamingView.svelte'),
  'utf8',
);
const favorites = source.slice(
  source.indexOf('<!-- Favorite tracks -->'),
  source.indexOf('{:else if searching}'),
);

describe('favoris streaming — contexte de liste #2140', () => {
  it('le double-clic et le bouton transmettent tous deux l index de la liste', () => {
    expect(favorites.match(/playFavoriteTrack\(i\)/g)).toHaveLength(2);
  });

  it('aucune action des favoris ne retombe sur la lecture d une piste isolée', () => {
    expect(favorites).not.toContain('playStreamingTrack(track)');
  });
});
