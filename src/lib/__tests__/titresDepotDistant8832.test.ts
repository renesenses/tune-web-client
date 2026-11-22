// tune-server-rust#8832 (fil 2833) — « Lire à partir d'ici » sur les titres
// d'un serveur Tune DISTANT envoyait au serveur local les identifiants du
// serveur distant : `set_queue_pistes_absentes … apercu_ids_absents=[12335]`,
// puis « track not found ». La lecture d'une piste distante passe par son URL
// de flux, jouée en `source: upnp` par le serveur local.
import { describe, expect, it } from 'vitest';
import { lireTitresDepuis, type DepotDistant } from '../tuneRemote';
import type { Track } from '../types';

const depot: DepotDistant = {
  base: 'http://192.168.1.29:8888/api/v1',
  nom: 'Tune du NAS',
  hote: '192.168.1.29:8888',
};

const piste = (id: number, title: string) =>
  ({ id, title, source: 'local', artist_name: 'Artiste', duration_ms: 1000 }) as unknown as Track;

function gestes() {
  const lus: Record<string, unknown>[] = [];
  const enfiles: Record<string, unknown>[] = [];
  return {
    lus,
    enfiles,
    g: {
      lire: async (c: Record<string, unknown>) => { lus.push(c); },
      enfiler: async (c: any) => { enfiles.push(c); },
      plafond: async () => 500,
    },
  };
}

describe('#8832 — titres d’un serveur Tune distant', () => {
  it('ne part jamais par identifiant de piste : URL de flux en source upnp', async () => {
    const { lus, enfiles, g } = gestes();
    const liste = [piste(12334, 'A'), piste(12335, 'B'), piste(12336, 'C')];
    const n = await lireTitresDepuis(depot, liste, 1, g);
    expect(n).toBe(2);
    const tous = [...lus, ...enfiles];
    for (const c of tous) {
      expect(c).not.toHaveProperty('track_id');
      expect(c).not.toHaveProperty('track_ids');
    }
    expect(lus).toHaveLength(1);
    expect(lus[0]).toMatchObject({
      source: 'upnp',
      source_id: 'http://192.168.1.29:8888/api/v1/library/tracks/12335/audio',
      title: 'B',
    });
    expect(enfiles.map((c) => c.source_id)).toEqual([
      'http://192.168.1.29:8888/api/v1/library/tracks/12336/audio',
    ]);
  });

  it('sans dépôt, la bibliothèque locale garde sa lecture par identifiants', async () => {
    const { lus, g } = gestes();
    await lireTitresDepuis(null, [piste(1, 'A'), piste(2, 'B')], 0, g);
    expect(lus[0]).toMatchObject({ track_ids: [1, 2] });
  });
});
