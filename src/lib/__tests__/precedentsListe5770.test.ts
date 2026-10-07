// #5770 — « Précédent » deux fois rejouait le titre cliqué.
//
// Les écrans V2 (Favoris, Recherche, Bibliothèque, Streaming, `ListePistesV2`…)
// ne passent pas par `playFromHere` mais par `lectureEnMasse.lireListeDepuis`,
// qui ne jouait que `liste.slice(index)` : les titres d'avant n'entraient
// jamais dans la file, même sur une liste 100 % locale.
import { beforeEach, describe, expect, it } from 'vitest';
import { lireListeDepuis } from '../lectureEnMasse';
import { corpsDesPrecedents, oublierCapaciteCurseur } from '../precedentsEnTete';

const local = (id: number) => ({ id, title: `t${id}`, source: 'local' }) as any;
const flux = (sid: string) => ({ id: null, title: sid, source: 'qobuz', source_id: sid }) as any;

/** Les deux gestes, qui consignent ce qu'ils reçoivent. */
function gestes(reponse: unknown = { queue_length: 9, queue_position: 2 }) {
  const lus: any[] = [];
  const enfiles: any[] = [];
  return {
    lus,
    enfiles,
    g: {
      lire: async (c: Record<string, unknown>) => { lus.push(c); },
      enfiler: async (c: any) => { enfiles.push(c); return reponse; },
    },
  };
}

beforeEach(() => oublierCapaciteCurseur());

describe('liste 100 % locale : toute la liste, `start_index` au rang cliqué', () => {
  it('un seul appel, aucune insertion', async () => {
    const { lus, enfiles, g } = gestes();
    const n = await lireListeDepuis([local(1), local(2), local(3), local(4)], 2, g);
    expect(lus).toEqual([{ track_ids: [1, 2, 3, 4], start_index: 2 }]);
    expect(enfiles).toEqual([]);
    expect(n).toBe(4);
  });

  it('premier rang : la forme d’avant, sans `start_index`', async () => {
    const { lus, g } = gestes();
    await lireListeDepuis([local(1), local(2)], 0, g);
    expect(lus).toEqual([{ track_ids: [1, 2] }]);
  });

  it('une ligne non désignable avant le rang ne décale pas le départ', async () => {
    const { lus, g } = gestes();
    await lireListeDepuis([local(1), { id: null, title: 'x' } as any, local(3)], 2, g);
    expect(lus).toEqual([{ track_ids: [1, 3], start_index: 1 }]);
  });
});

describe('liste de service ou mixte : la suite, PUIS les précédents en tête', () => {
  it('service : tête, reste, puis précédents en `position: 0`, dans l’ordre', async () => {
    const { lus, enfiles, g } = gestes();
    const n = await lireListeDepuis([flux('x'), flux('y'), flux('z'), flux('w')], 2, g);
    expect(lus).toHaveLength(1);
    expect(lus[0]).toMatchObject({ source: 'qobuz', source_id: 'z' });
    expect(enfiles).toHaveLength(2);
    expect(enfiles[0].tracks.map((t: any) => t.source_id)).toEqual(['w']);
    expect(enfiles[0]).not.toHaveProperty('position');
    expect(enfiles[1]).toEqual({
      tracks: [
        expect.objectContaining({ source: 'qobuz', source_id: 'x' }),
        expect.objectContaining({ source: 'qobuz', source_id: 'y' }),
      ],
      position: 0,
    });
    expect(n).toBe(4);
  });

  it('précédents mixtes : un par un, aux rangs 0, 1, 2', async () => {
    const { enfiles, g } = gestes();
    await lireListeDepuis([local(1), flux('a'), local(2), flux('b'), flux('c')], 3, g);
    expect(enfiles.slice(1)).toEqual([
      { track_id: 1, position: 0 },
      { tracks: [expect.objectContaining({ source_id: 'a' })], position: 1 },
      { track_id: 2, position: 2 },
    ]);
  });

  it('précédents tous locaux devant une suite de service : un seul appel', async () => {
    const { enfiles, g } = gestes();
    await lireListeDepuis([local(1), local(2), flux('a'), flux('b')], 2, g);
    expect(enfiles[1]).toEqual({ track_ids: [1, 2], position: 0 });
  });

  it('🔴 serveur ancien (pas de `queue_position`) : la suite seule, comme avant', async () => {
    const { enfiles, g } = gestes({ queue_length: 4 });
    const n = await lireListeDepuis([flux('x'), flux('y'), flux('z'), flux('w')], 2, g);
    expect(enfiles).toHaveLength(1);
    expect(enfiles.some((c) => 'position' in c)).toBe(false);
    expect(n).toBe(2);
  });

  it('dernier titre cliqué : rien en tête tant que le serveur est inconnu, puis oui', async () => {
    const a = gestes();
    await lireListeDepuis([flux('x'), flux('y')], 1, a.g);
    expect(a.enfiles).toEqual([]);

    // Une réponse antérieure de la session a tranché : on peut insérer.
    await lireListeDepuis([flux('x'), flux('y'), flux('z')], 1, gestes().g);
    const b = gestes();
    await lireListeDepuis([flux('x'), flux('y')], 1, b.g);
    expect(b.enfiles).toEqual([{ tracks: [expect.objectContaining({ source_id: 'x' })], position: 0 }]);
  });
});

describe('corpsDesPrecedents', () => {
  it('rien à remettre : aucune requête', () => {
    expect(corpsDesPrecedents([])).toEqual([]);
    expect(corpsDesPrecedents([{ id: null, title: 'x' } as any])).toEqual([]);
  });
});
