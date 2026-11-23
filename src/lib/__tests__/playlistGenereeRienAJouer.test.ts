/**
 * Forum (relevé rc14 du 21/11) — le panneau « Playlist générée » se fermait
 * sans rien dire quand aucun de ses titres n'était jouable : la lecture en
 * masse ne demandait rien au serveur, rendait 0, et `.then(onClose)` fermait
 * le panneau comme si la lecture était partie.
 *
 * Attendu : rien de jouable, aucun appel de lecture, le panneau reste ouvert
 * et un message le dit, dans chaque langue.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ play: vi.fn(), addToQueue: vi.fn() }));
vi.mock('../api', async (orig) => ({ ...(await orig<any>()), ...mocks }));

import * as module from '../parceQueVousAimez';
import type { PlaylistGeneree } from '../parceQueVousAimez';

function injouable(): PlaylistGeneree {
  return {
    id: 'pvaa-2',
    artist: 'Blue Öyster Cult',
    track_count: 2,
    tracks: [
      // Ni identifiant local, ni paire de service : rien à demander au serveur.
      { source: 'local', title: 'Astronomy', artist_name: 'Blue Öyster Cult', duration_ms: 1000 },
      { source: 'qobuz', title: 'Godzilla', artist_name: 'Blue Öyster Cult', duration_ms: 1000 },
    ],
  } as unknown as PlaylistGeneree;
}

function jouable(): PlaylistGeneree {
  return {
    id: 'pvaa-3',
    artist: 'Miles Davis',
    track_count: 1,
    tracks: [{ source: 'local', track_id: 11, title: 'So What', artist_name: 'Miles Davis', duration_ms: 1000 }],
  } as unknown as PlaylistGeneree;
}

beforeEach(() => {
  mocks.play.mockReset().mockResolvedValue({});
  mocks.addToQueue.mockReset().mockResolvedValue({});
});

describe('Playlist générée : rien de jouable', () => {
  it('le panneau reste ouvert et le dit', async () => {
    const lire = (module as any).lireDepuisLePanneau;
    expect(typeof lire, 'lireDepuisLePanneau doit exister').toBe('function');
    const fermer = vi.fn();
    const rienAJouer = vi.fn();
    const n = await lire(3, injouable(), { fermer, rienAJouer });
    expect(n).toBe(0);
    expect(mocks.play).not.toHaveBeenCalled();
    expect(fermer).not.toHaveBeenCalled();
    expect(rienAJouer).toHaveBeenCalledTimes(1);
  });

  it('une liste jouable part et ferme le panneau, sans message', async () => {
    const lire = (module as any).lireDepuisLePanneau;
    const fermer = vi.fn();
    const rienAJouer = vi.fn();
    expect(await lire(3, jouable(), { fermer, rienAJouer })).toBe(1);
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(fermer).toHaveBeenCalledTimes(1);
    expect(rienAJouer).not.toHaveBeenCalled();
  });

  it('le panneau passe par ce chemin, et ne ferme plus sur un simple « then »', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/PlaylistGenereeV2.svelte'), 'utf8');
    expect(src).toContain('lireDepuisLePanneau(');
    expect(src).not.toMatch(/\.then\(onClose,/);
    expect(src).toContain('v2.home.becauseYouLikeNothingPlayable');
  });

  it('chaque langue porte le message', () => {
    const dossier = resolve(__dirname, '../locales');
    const langues = readdirSync(dossier).filter((f) => /^[a-z]{2}\.ts$/.test(f));
    expect(langues.length).toBeGreaterThanOrEqual(15);
    for (const f of langues) {
      const src = readFileSync(resolve(dossier, f), 'utf8');
      expect(src, f).toMatch(/"v2\.home\.becauseYouLikeNothingPlayable": "[^"]+"/);
    }
  });
});
