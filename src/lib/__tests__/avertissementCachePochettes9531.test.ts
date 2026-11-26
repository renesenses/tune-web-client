import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { messageCachePochettes } from '../avertissementCachePochettes';
import en from '../locales/en';
import fr from '../locales/fr';

const t = (dict: Record<string, string>) => (k: string) => dict[k] ?? k;

describe('messageCachePochettes (tune-server-rust#9531)', () => {
  it('traduit le cache non inscriptible, chemin compris', () => {
    const m = messageCachePochettes(
      { path: '/srv/tune/artwork_cache', warning: { code: 'artwork_cache_unwritable', message: 'x' } },
      t(fr as any),
    );
    expect(m).toContain('/srv/tune/artwork_cache');
    expect(m).toContain('ne peut pas être écrit');
  });
  it('traduit le cache relatif au dossier courant, avec la variable à poser', () => {
    const m = messageCachePochettes(
      { path: '/home/a/artwork_cache', warning: { code: 'artwork_cache_relative_to_working_dir' } },
      t(en as any),
    );
    expect(m).toContain('TUNE_ARTWORK_DIR=/home/a/artwork_cache');
  });
  it('un code inconnu garde le message du serveur', () => {
    expect(messageCachePochettes({ path: '/p', warning: { code: 'autre', message: 'du serveur' } }, t(en as any)))
      .toBe('du serveur');
  });
  it('rien à dire sans avertissement, ou sur un serveur plus ancien', () => {
    expect(messageCachePochettes({ path: '/p', warning: null }, t(en as any))).toBeNull();
    expect(messageCachePochettes(undefined, t(en as any))).toBeNull();
  });
  it('l’écran État du serveur affiche le message', () => {
    const src = readFileSync('src/components/v2/TuneHealthV2.svelte', 'utf8');
    expect(src).toContain('messageCachePochettes(');
    expect(src).toContain('diagnostics.artworkCacheTitle');
  });
});
