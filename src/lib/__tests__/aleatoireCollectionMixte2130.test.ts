import { describe, expect, it } from 'vitest';
import { lireListe, lireListeAleatoire, planAleatoire, planDeLecture } from '../lectureEnMasse';
import type { Track } from '../types';

// #2130, fil forum 2243 (rc4) : « Aléatoire » en haut de la collection
// intelligente « Sorties sept oct 26 » laissait la file en albums entiers.
// Une collection MIXTE (albums locaux + albums de service) part en
// « tête puis reste ». La tête locale partait en `{ track_id }` seul : pour
// le serveur, c'est la « demande nue » de la barre de transport, qui GARDE la
// file quand le titre y figure déjà (`routes/playback.rs`, #4298). Après un
// « Tout lire » de la même collection, le titre tiré y figure toujours : la
// file d'albums restait, et la suite mélangée s'enfilait derrière.
//
// La garde rejoue ce contrat serveur, pas seulement la forme des corps.

const locale = (id: number, album: number): Track =>
  ({ id, title: `L${id}`, album_id: album, duration_ms: 1000 }) as unknown as Track;
const service = (sid: string): Track =>
  ({ id: null, source: 'qobuz', source_id: sid, title: `S${sid}`, duration_ms: 1000 }) as unknown as Track;

/** Le contrat de `POST /zones/{id}/play` et `POST …/queue`, réduit à la file. */
function serveur() {
  let file: string[] = [];
  const cle = (c: any) => (c.track_id != null ? `L${c.track_id}` : `S${c.source_id}`);
  return {
    get file() { return file; },
    lire: async (c: any) => {
      if (c.track_ids) { file = c.track_ids.map((i: number) => `L${i}`); return; }
      const nue = c.track_id != null && c.start_index == null && c.album_id == null && c.playlist_id == null;
      // Demande nue (piste locale) ou titre de service seul déjà en file : file gardée.
      if ((nue || c.track_id == null) && file.includes(cle(c))) return;
      file = [cle(c)];
    },
    enfiler: async (c: any) => {
      file = [...file, ...(c.tracks ?? []).map((t: any) => `S${t.source_id}`), ...(c.track_ids ?? []).map((i: number) => `L${i}`)];
    },
    plafond: async () => 500,
  };
}

const collection: Track[] = [
  ...[1, 2, 3, 4, 5, 6].map((i) => locale(i, 10)),
  ...[7, 8, 9, 10, 11, 12].map((i) => locale(i, 20)),
  ...['a', 'b', 'c', 'd'].map(service),
];

describe('#2130 — « Aléatoire » d’une collection mixte remplace la file', () => {
  it('après « Tout lire », « Aléatoire » donne une file neuve, sans l’ancienne', async () => {
    for (let essai = 0; essai < 50; essai++) {
      const s = serveur();
      await lireListe(collection, s);
      expect(s.file).toHaveLength(collection.length);
      await lireListeAleatoire(collection, s);
      // Chaque titre une seule fois : l'ancienne file n'est pas restée devant.
      expect(s.file).toHaveLength(collection.length);
      expect(new Set(s.file).size).toBe(collection.length);
    }
  });

  it('la tête locale d’une liste mixte est un nouveau geste (`start_index: 0`)', () => {
    const plan = planDeLecture([locale(1, 10), service('a')]);
    expect(plan).toMatchObject({ voie: 'tete-et-reste', tete: { track_id: 1, start_index: 0 } });
  });

  it('le tirage met en tête un titre local quand la liste en compte un', () => {
    for (let essai = 0; essai < 50; essai++) {
      const plan = planAleatoire([service('a'), service('b'), service('c'), locale(1, 10)], 500);
      expect(plan).toMatchObject({ voie: 'tete-et-reste', tete: { track_id: 1, start_index: 0 } });
    }
  });

  it('une tête de service garde son corps de titre seul', () => {
    const plan = planDeLecture([service('a'), locale(1, 10)]);
    expect(plan).toMatchObject({ voie: 'tete-et-reste', tete: { source: 'qobuz', source_id: 'a' } });
    expect((plan as any).tete.start_index).toBeUndefined();
  });
});
