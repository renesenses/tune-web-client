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
 * Revue Codex de #2237 : la zone n'était vérifiée qu'AVANT la relecture. Si
 * l'utilisateur change de zone pendant `GET …/queue`, la réponse de l'ancienne
 * zone écrasait la file de la nouvelle (zone affichée 8, file de la zone 7).
 */
describe('basculerAleatoire — une réponse périmée n’écrase pas la file', () => {
  function attente<T>() {
    let resoudre!: (v: T) => void;
    const promesse = new Promise<T>((r) => (resoudre = r));
    return { promesse, resoudre };
  }

  it('la zone change pendant la relecture : la file de la nouvelle zone reste', async () => {
    let zone = 7;
    const lecture = attente<{ tracks: Track[]; position: number; length: number }>();
    const partie = attente<void>();
    const p: PortesAleatoire = {
      basculer: async () => ({ shuffle: true, queue_reordered: true }),
      lireFile: () => {
        partie.resoudre();
        return lecture.promesse;
      },
      zoneAffichee: () => zone,
    };
    const enCours = basculerAleatoire(7, true, p);
    // La relecture de la zone 7 est bien PARTIE avant le changement de zone.
    await partie.promesse;
    // L'utilisateur passe sur la zone 8, dont la file est chargée.
    zone = 8;
    const FILE_ZONE_8 = [piste(80, 'zone 8')];
    queueTracks.set(FILE_ZONE_8);
    queueLength.set(1);
    lecture.resoudre({ tracks: [piste(70, 'zone 7')], position: 0, length: 1 });
    expect(await enCours).toBe(true);
    expect(get(queueTracks).map((t) => t.title)).toEqual(['zone 8']);
    expect(get(queueLength)).toBe(1);
  });

  it('deux bascules rapprochées : la réponse de la première, arrivée en dernier, est ignorée', async () => {
    const premiere = attente<{ tracks: Track[]; position: number; length: number }>();
    const seconde = attente<{ tracks: Track[]; position: number; length: number }>();
    const lectures = [premiere.promesse, seconde.promesse];
    const parties = [attente<void>(), attente<void>()];
    let n = 0;
    const p: PortesAleatoire = {
      basculer: async (_z, enabled) => ({ shuffle: enabled, queue_reordered: true }),
      lireFile: () => {
        parties[n++].resoudre();
        return lectures.shift()!;
      },
      zoneAffichee: () => 7,
    };
    const a = basculerAleatoire(7, true, p);
    await parties[0].promesse;
    const b = basculerAleatoire(7, false, p);
    await parties[1].promesse;
    seconde.resoudre({ tracks: ANCIENNE, position: 0, length: ANCIENNE.length });
    await b;
    premiere.resoudre({ tracks: MELANGEE, position: 0, length: MELANGEE.length });
    await a;
    expect(get(queueTracks).map((t) => t.title)).toEqual(['A', 'B', 'C', 'D']);
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
