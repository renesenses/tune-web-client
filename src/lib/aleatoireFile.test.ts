import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { basculerAleatoire, type PortesAleatoire } from './aleatoireFile';
import { queueLength, queuePosition, queueTracks } from './stores/queue';
import type { Track } from './types';

/**
 * tune-server-rust#6526 — le serveur RÉORDONNE la file quand on bascule
 * l'aléatoire. La file affichée doit être relue tout de suite, sinon l'écran
 * montre l'ancien ordre alors que la zone joue le nouveau.
 */

const piste = (id: number, title: string) => ({ id, title }) as unknown as Track;
const ANCIENNE = [piste(1, 'A'), piste(2, 'B'), piste(3, 'C'), piste(4, 'D')];
const MELANGEE = [piste(1, 'A'), piste(4, 'D'), piste(2, 'B'), piste(3, 'C')];

function portes(
  reponse: { shuffle: boolean; queue_reordered?: boolean },
  zoneAffichee: number | null = 7,
  lecture: () => Promise<{ tracks: Track[]; position: number; length: number }> = async () => ({
    tracks: MELANGEE,
    position: 0,
    length: MELANGEE.length,
  }),
) {
  const appels: string[] = [];
  const p: PortesAleatoire = {
    basculer: async (zoneId, enabled) => {
      appels.push(`basculer:${zoneId}:${enabled}`);
      return reponse;
    },
    lireFile: async (zoneId) => {
      appels.push(`lire:${zoneId}`);
      return lecture();
    },
    zoneAffichee: () => zoneAffichee,
  };
  return { p, appels };
}

beforeEach(() => {
  queueTracks.set(ANCIENNE);
  queuePosition.set(0);
  queueLength.set(ANCIENNE.length);
});

describe('basculerAleatoire — la file affichée suit le mélange du serveur', () => {
  it('relit la file de la zone affichée après la bascule, et rend l’état du serveur', async () => {
    const { p, appels } = portes({ shuffle: true, queue_reordered: true });
    expect(await basculerAleatoire(7, true, p)).toBe(true);
    expect(appels).toEqual(['basculer:7:true', 'lire:7']);
    expect(get(queueTracks).map((t) => t.title)).toEqual(['A', 'D', 'B', 'C']);
    expect(get(queueLength)).toBe(4);
  });

  it('relit aussi quand le serveur, plus ancien, ne dit pas s’il a réordonné', async () => {
    const { p, appels } = portes({ shuffle: false });
    expect(await basculerAleatoire(7, false, p)).toBe(false);
    expect(appels).toContain('lire:7');
  });

  it('ne relit pas quand le serveur dit n’avoir rien réordonné', async () => {
    const { p, appels } = portes({ shuffle: true, queue_reordered: false });
    await basculerAleatoire(7, true, p);
    expect(appels).toEqual(['basculer:7:true']);
    expect(get(queueTracks)).toBe(ANCIENNE);
  });

  it('ne touche pas la file affichée pour une AUTRE zone (carte de zone)', async () => {
    const { p, appels } = portes({ shuffle: true, queue_reordered: true }, 3);
    await basculerAleatoire(7, true, p);
    expect(appels).toEqual(['basculer:7:true']);
    expect(get(queueTracks)).toBe(ANCIENNE);
  });

  it('une relecture qui échoue garde la file et ne fait pas échouer la bascule', async () => {
    const { p } = portes({ shuffle: true, queue_reordered: true }, 7, async () => {
      throw new Error('réseau');
    });
    expect(await basculerAleatoire(7, true, p)).toBe(true);
    expect(get(queueTracks)).toBe(ANCIENNE);
  });
});

/**
 * Les quatre boutons Aléatoire passent par la MÊME bascule — barre de lecture,
 * « Lecture en cours », carte de zone, et l'écran File d'attente qui n'en
 * avait pas. Un appel direct à `api.setShuffle` dans un gabarit relirait sans
 * la file : l'écran mentirait de nouveau.
 */
describe('les boutons Aléatoire utilisent basculerAleatoire', () => {
  const racine = resolve(__dirname, '..');
  const surfaces = [
    'components/partages/TransportBar.svelte',
    'components/partages/NowPlaying.svelte',
    'components/v2/ligne1/CarteZoneL1.svelte',
    'components/v2/QueueV2.svelte',
  ];
  for (const fichier of surfaces) {
    it(fichier, () => {
      const source = readFileSync(resolve(racine, fichier), 'utf8');
      expect(source).toMatch(/basculerAleatoire\(/);
      expect(source).not.toMatch(/api\.setShuffle\(/);
    });
  }
});
