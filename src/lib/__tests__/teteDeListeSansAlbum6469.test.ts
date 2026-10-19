/**
 * tune-server-rust#6469 — « Écouter le best of » d'ABBA jouait une
 * compilation Qobuz d'artistes variés, toute la file sous la même pochette
 * (FabienM, fil 2302 point 14).
 *
 * Le serveur joue l'ALBUM d'un titre de service lancé seul (#5372). Le best
 * of, « Tout lire » d'une liste de service et « Lire à partir d'ici » lancent
 * pourtant leur TÊTE seule avant d'enfiler la suite : le premier titre phare
 * emportait sa compilation. La tête d'une liste dit donc au serveur que la
 * suite vient du client (`queue_follows`). Les gestes sont injectés : on
 * regarde ce qui part sur le fil.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireListe, lireListeAleatoire, lireListeDepuis, planDeLecture } from '../lectureEnMasse';
import { corpsDeTeteDeListe } from '../pisteFile';
import type { Track } from '../types';

const p = (o: Partial<Track>) => o as Track;
const BEST_OF = [
  p({ id: null, title: 'Slipping Through My Fingers', artist_name: 'ABBA', source: 'qobuz', source_id: '11' }),
  p({ id: null, title: 'Dancing Queen', artist_name: 'ABBA', source: 'qobuz', source_id: '22' }),
  p({ id: null, title: 'Waterloo', artist_name: 'ABBA', source: 'qobuz', source_id: '33' }),
];

function temoin() {
  const envois: { quoi: string; corps: any }[] = [];
  return {
    envois,
    gestes: {
      lire: async (c: any) => { envois.push({ quoi: 'lire', corps: c }); },
      enfiler: async (c: any) => { envois.push({ quoi: 'enfiler', corps: c }); },
      plafond: async () => 500,
    },
  };
}

describe('#6469 — la tête d’une liste de service ne joue pas son album', () => {
  it('« Écouter le best of » : la tête part avec queue_follows, la suite derrière', async () => {
    const t = temoin();
    expect(await lireListe(BEST_OF, t.gestes)).toBe(3);
    expect(t.envois[0]).toMatchObject({ quoi: 'lire', corps: { source_id: '11', queue_follows: true } });
    expect(t.envois[1].quoi).toBe('enfiler');
  });

  it('la lecture aléatoire de la même liste aussi', async () => {
    const t = temoin();
    await lireListeAleatoire(BEST_OF, t.gestes);
    expect(t.envois[0].corps.queue_follows).toBe(true);
  });

  it('« Lire à partir d’ici » aussi, précédents compris', async () => {
    const t = temoin();
    await lireListeDepuis(BEST_OF, 2, t.gestes);
    expect(t.envois[0]).toMatchObject({ quoi: 'lire', corps: { source_id: '33', queue_follows: true } });
  });

  it('un titre SEUL garde le comportement de #5372 : il joue son album', () => {
    const plan = planDeLecture([BEST_OF[0]]) as any;
    expect(plan.tete.queue_follows).toBeUndefined();
  });

  it('une piste locale n’emporte pas le champ', () => {
    expect(corpsDeTeteDeListe(p({ id: 7, title: 'L' }))).toEqual({ track_id: 7 });
  });

  it('le mélange d’un album de service passe par la même tête', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/AlbumDetailV2.svelte'), 'utf8');
    const melange = src.slice(src.indexOf('function shuffle()'), src.indexOf('function shuffle()') + 1200);
    expect(melange).toContain('corpsDeTeteDeListe(l[0])');
  });
});
