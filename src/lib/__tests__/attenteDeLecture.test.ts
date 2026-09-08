/**
 * « L'ui ne repond plus aux demandes de play un autre album ou piste !! »
 * (Bertrand, 05/09/2026, sur le .18 en 0.9.136).
 *
 * Le diagnostic a montré que le client n'était PAS en cause : le journal du
 * serveur porte 24 `set_queue_ok` et 8 `orchestrator_play_superseded` — les
 * gestes partaient tous. Un pré-transcodage `Aac -> Flac` de 102 s tenait la
 * zone 10, et le serveur ne teste l'annulation qu'après l'avoir mené à terme
 * (renesenses/tune-server-rust#3444).
 *
 * Le défaut CLIENT, lui, est réel et c'est celui que ces gardes tiennent :
 * pendant ces 102 s l'écran ne montrait rien, et c'est ce silence qui a fait
 * recliquer huit fois.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

/** Un garde qui lit du code doit lire le CODE, pas ce qu'on en dit. */
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('attente de lecture — le magasin', () => {
  beforeEach(() => { vi.resetModules(); });

  it('playAndSync allume le témoin, et la zone qui JOUE l éteint', async () => {
    vi.doMock('../api', () => ({
      play: vi.fn(async (zoneId: number) => ({ id: zoneId, state: 'stopped' })),
      getZone: vi.fn(async (zoneId: number) => ({ id: zoneId, state: 'stopped' })),
      setRepeat: vi.fn(async () => ({ repeat: 'one' })),
    }));
    const z = await import('../stores/zones');

    expect(get(z.lectureEnAttente)).toBeNull();

    await z.playAndSync(10, { album_id: 42 });
    // Le serveur accuse réception TOUT DE SUITE et ne rend le son qu'après le
    // pré-transcodage : le témoin doit survivre à la réponse de `play`.
    expect(get(z.lectureEnAttente)).toBe(10);

    // Une autre zone qui se met à jouer ne doit rien éteindre ici.
    z.syncZone({ id: 7, state: 'playing' } as any);
    expect(get(z.lectureEnAttente)).toBe(10);

    z.syncZone({ id: 10, state: 'playing' } as any);
    expect(get(z.lectureEnAttente)).toBeNull();
  });

  it('un échec de la requête éteint le témoin au lieu de le laisser allumé', async () => {
    vi.doMock('../api', () => ({
      play: vi.fn(async () => { throw new Error('boom'); }),
      getZone: vi.fn(async (zoneId: number) => ({ id: zoneId, state: 'stopped' })),
      setRepeat: vi.fn(async () => ({ repeat: 'one' })),
    }));
    const z = await import('../stores/zones');

    await expect(z.playAndSync(10, { album_id: 42 })).rejects.toThrow('boom');
    expect(get(z.lectureEnAttente)).toBeNull();
  });
});

describe('attente de lecture — les gestes v2 sont BRANCHÉS dessus', () => {
  /*
    La coquille v2 a déjà laissé passer six fois du code écrit mais jamais
    appelé. Ici le piège était l'inverse et plus discret : `playAndSync`
    existait, portait déjà la fenêtre de grâce de #1146, et AUCUN écran v2 ne
    l'appelait — tous tapaient `api.play()` en direct.
  */
  const ECRANS = [
    'AlbumDetailV2', 'ArtistesV2', 'CollectionsV2', 'EtiquettesV2', 'FavoritesV2',
    'LibraryV2', 'MediaServersV2', 'PisteActions', 'PlaylistDetailV2',
    'PlaylistsV2', 'SearchV2', 'StreamingV2',
  ];

  it.each(ECRANS)('%s ne contourne pas le point de passage', (nom) => {
    const src = sansCommentaires(lire(`src/components/v2/${nom}.svelte`));
    expect(src).not.toContain('api.play(');
    expect(src).toContain('playAndSync(');
  });

  it('aucun écran v2 n appelle api.play() en direct', () => {
    const { globSync } = require('node:fs') as typeof import('node:fs');
    const fichiers = globSync('src/components/v2/*.svelte');
    const fautifs = fichiers.filter((f) => sansCommentaires(lire(f)).includes('api.play('));
    expect(fautifs).toEqual([]);
  });
});

describe('attente de lecture — le témoin est VISIBLE', () => {
  it('la barre de transport affiche l attente de la zone affichée', () => {
    const src = sansCommentaires(lire('src/components/TransportBar.svelte'));

    expect(src).toContain('lectureEnAttente');
    expect(src).toContain('tb-attente');
    expect(src).toContain("$t('transport.preparing')");
    // Restreint à la zone AFFICHÉE : une attente ailleurs ne clignote pas ici.
    expect(src).toMatch(/\$lectureEnAttente === \$currentZoneId/);
    // Annoncé aux lecteurs d'écran, sans voler le focus.
    expect(src).toContain('aria-live="polite"');
  });

  it('les 11 langues portent la clé', () => {
    const langues = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu'];
    for (const l of langues) {
      expect(lire(`src/lib/locales/${l}.ts`)).toContain('transport.preparing');
    }
  });
});
