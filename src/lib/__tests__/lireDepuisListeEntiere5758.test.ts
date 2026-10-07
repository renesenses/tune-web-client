// renesenses/tune-server-rust#5758, point 1 — « Lire à partir d'ici » met
// toute la liste en file et démarre au titre cliqué, comme une playlist
// lancée par `start_index`. Ce fichier tient ce que #5770 laissait ouvert :
// la borne des précédents, l'ordre d'une liste mixte, et le titre cliqué
// local dans une liste mixte.
import { beforeEach, describe, expect, it } from 'vitest';
import { lireListeDepuis } from '../lectureEnMasse';
import { PRECEDENTS_MAX, oublierCapaciteCurseur, segmentsHomogenes } from '../precedentsEnTete';

const local = (id: number) => ({ id, title: `t${id}`, source: 'local' }) as any;
const flux = (sid: string) => ({ id: null, title: sid, source: 'qobuz', source_id: sid }) as any;

/** Les deux gestes, qui consignent ce qu'ils reçoivent. */
function gestes(repondre: (c: any) => unknown = () => ({ queue_length: 9, queue_position: 2 })) {
  const lus: any[] = [];
  const enfiles: any[] = [];
  return {
    lus,
    enfiles,
    g: {
      lire: async (c: Record<string, unknown>) => { lus.push(c); },
      enfiler: async (c: any) => { enfiles.push(c); return repondre(c); },
    },
  };
}

/** Ce qu'une requête désigne, dans l'ordre où le serveur le rangera. */
function designes(c: any): string[] {
  if (c.track_id != null) return [`L${c.track_id}`];
  // Le serveur range les pistes de service d'une requête AVANT ses locales.
  return [
    ...(c.tracks ?? []).map((t: any) => t.source_id),
    ...(c.track_ids ?? []).map((id: number) => `L${id}`),
  ];
}

beforeEach(() => oublierCapaciteCurseur());

describe('borne des précédents', () => {
  it('la borne vaut 200 titres', () => {
    expect(PRECEDENTS_MAX).toBe(200);
  });

  it('liste locale très longue : au plus 200 titres avant le titre cliqué', async () => {
    const liste = Array.from({ length: 5000 }, (_, i) => local(i + 1));
    const { lus, g } = gestes();
    await lireListeDepuis(liste, 4000, g);
    expect(lus).toHaveLength(1);
    const ids = lus[0].track_ids as number[];
    // Les 200 titres qui précèdent IMMÉDIATEMENT le 4 001ᵉ, puis toute la suite.
    expect(ids[0]).toBe(3801);
    expect(ids).toHaveLength(200 + 1000);
    expect(lus[0].start_index).toBe(200);
    expect(ids[lus[0].start_index]).toBe(4001);
  });

  it('sous la borne : toute la liste, rien n’est retiré', async () => {
    const liste = Array.from({ length: 150 }, (_, i) => local(i + 1));
    const { lus, g } = gestes();
    await lireListeDepuis(liste, 120, g);
    expect(lus[0].track_ids).toHaveLength(150);
    expect(lus[0].start_index).toBe(120);
  });

  it('liste de service très longue : 200 précédents en tête, les plus proches', async () => {
    // Une première réponse annonce `queue_position` : le serveur suit le curseur.
    const liste = Array.from({ length: 400 }, (_, i) => flux(`s${i}`));
    const { enfiles, g } = gestes();
    const n = await lireListeDepuis(liste, 300, g);
    const tete = enfiles.find((c) => c.position === 0);
    expect(tete.tracks).toHaveLength(200);
    expect(tete.tracks[0].source_id).toBe('s100');
    expect(tete.tracks[199].source_id).toBe('s299');
    expect(n).toBe(100 + 200);
  });
});

describe('liste mixte : l’ordre de la liste, dans la file', () => {
  it('la suite garde son ordre (segments homogènes, pas un bloc mixte)', async () => {
    const { enfiles, g } = gestes();
    await lireListeDepuis([flux('a'), local(1), flux('b'), local(2), local(3), flux('c')], 0, g);
    const suite = enfiles.filter((c) => !('position' in c)).flatMap(designes);
    expect(suite).toEqual(['L1', 'b', 'L2', 'L3', 'c']);
  });

  it('les précédents aussi, chacun à son rang', async () => {
    const { enfiles, g } = gestes();
    await lireListeDepuis([local(1), local(2), flux('a'), local(3), flux('b'), flux('z'), flux('y')], 5, g);
    const tete = enfiles.filter((c) => 'position' in c);
    expect(tete.map((c) => c.position)).toEqual([0, 2, 3, 4]);
    expect(tete.flatMap(designes)).toEqual(['L1', 'L2', 'a', 'L3', 'b']);
  });

  it('un titre local disparu : le segment suivant suit le rang RÉEL', async () => {
    // Le serveur n'insère qu'une des deux pistes locales (l'autre a disparu).
    const { enfiles, g } = gestes((c) => ({
      queue_length: 9,
      queue_position: 2,
      added: c.track_ids ? 1 : designes(c).length,
    }));
    await lireListeDepuis([local(1), local(2), flux('a'), flux('z'), flux('y')], 3, g);
    const tete = enfiles.filter((c) => 'position' in c);
    expect(tete).toEqual([
      { track_ids: [1, 2], position: 0 },
      { tracks: [expect.objectContaining({ source_id: 'a' })], position: 1 },
    ]);
  });

  it('segmentsHomogenes coupe à chaque changement de nature, jamais ailleurs', () => {
    const s = segmentsHomogenes([local(1), local(2), flux('a'), local(3), flux('b'), flux('c')]);
    expect(s.map((x) => x.length)).toEqual([2, 1, 1, 2]);
    expect(segmentsHomogenes([])).toEqual([]);
  });
});

describe('titre cliqué local dans une liste mixte', () => {
  it('🔴 jamais `{ track_id }` seul : `start_index` en fait un nouveau geste', async () => {
    // `{ track_id }` seul est la « demande nue » de la barre de transport :
    // le serveur garde alors la file existante si le titre y figure.
    const { lus, g } = gestes();
    await lireListeDepuis([flux('a'), local(7), flux('b')], 1, g);
    expect(lus).toEqual([{ track_id: 7, start_index: 0 }]);
  });
});
