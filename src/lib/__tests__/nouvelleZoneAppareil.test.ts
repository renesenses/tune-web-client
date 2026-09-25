// Bug du .18, 17/09/2026 : « impossible de créer une nouvelle zone ! Comment
// sélectionner un appareil ?? » — `POST /zones` refuse depuis #3835 une zone
// qui annonce une sortie sans appareil, et ZonesV2 n'en proposait aucun.
import { describe, expect, it } from 'vitest';
import { candidatsNouvelleZone } from '../appareilsNouvelleZone';

const loc = (name: string) => ({ id: `local:${name}`, name, max_channels: 2 }) as any;
const dev = (o: any) => ({ host: 'h', port: 1, available: true, ...o });

describe('les appareils proposés à la création d’une zone', () => {
  it('navigateur, sorties du serveur, puis appareils du réseau libres', () => {
    const c = candidatsNouvelleZone(
      [loc('Default ALSA Output')],
      [
        dev({ id: 'uuid:eversolo', name: 'Eversolo DMP-A8', type: 'dlna' }),
        dev({ id: 'uuid:libre', name: 'Décodeur TV', type: 'dlna' }),
        dev({ id: 'air:1', name: 'Mac13,1', type: 'airplay', available: false }),
      ],
      [{ id: 10, name: 'Eversolo', output_device_id: 'uuid:eversolo' } as any],
      'Cet ordinateur',
    );
    expect(c.map((x) => [x.groupe, x.nom, x.outputType, x.deviceId])).toEqual([
      ['navigateur', 'Cet ordinateur', 'browser', undefined],
      ['local', 'Default ALSA Output', 'local', 'local:Default ALSA Output'],
      ['reseau', 'Décodeur TV', 'dlna', 'uuid:libre'],
    ]);
  });

  it('toute proposition autre que le navigateur NOMME son appareil — sinon le serveur refuse', () => {
    const c = candidatsNouvelleZone([loc('USB DAC')], [dev({ id: 'x', name: 'X', type: 'chromecast' })], [], 'nav');
    for (const x of c.filter((x) => x.outputType !== 'browser')) expect(x.deviceId, x.nom).toBeTruthy();
  });

  it('une zone masquée se restaure par l’identité qui la tient', () => {
    const c = candidatsNouvelleZone([], [dev({
      id: 'uuid:neuf', name: 'Salon', type: 'dlna', zone_hidden: true, hidden_zone_device_id: 'uuid:ancien',
    })], [], 'nav');
    expect(c[1].deviceId).toBe('uuid:ancien');
  });

  // Fil 1927 (FabienM, 0.9.164) : « le bouton associer n'est pas proposé pour
  // ma zone Parents » — une Beosound Stage en zone DLNA, qui parle aussi Cast.
  // Le serveur replie le Cast dans `capabilities.alternatives` de la ligne
  // DLNA ; une zone sur la tête DLNA faisait disparaître le Cast avec elle.
  const beosound = (o: any = {}) => dev({
    id: 'uuid:beosound-dlna', name: 'Beosound Stage', type: 'dlna',
    capabilities: { alternatives: [
      { id: 'uuid:beosound-dlna-2', name: 'Beosound Stage', device_type: 'dlna' },
      { id: 'cast:beosound', name: 'Beosound Stage', device_type: 'chromecast' },
    ] },
    ...o,
  });
  const parents = { id: 7, name: 'Parents', output_device_id: 'uuid:beosound-dlna' } as any;

  it('fil 1927 — la zone DLNA tient l’appareil : son Cast reste proposé pour une seconde zone', () => {
    const c = candidatsNouvelleZone([], [beosound()], [parents], 'nav');
    expect(c.filter((x) => x.groupe === 'reseau').map((x) => [x.outputType, x.deviceId, x.nom])).toEqual([
      ['chromecast', 'cast:beosound', 'Beosound Stage'],
    ]);
  });

  it('fil 1927 — contre-épreuve : un Cast déjà tenu par une zone n’est pas reproposé', () => {
    const cast = { id: 8, name: 'Parents Cast', output_device_id: 'cast:beosound' } as any;
    const c = candidatsNouvelleZone([], [beosound()], [parents, cast], 'nav');
    expect(c.filter((x) => x.groupe === 'reseau')).toEqual([]);
  });

  it('fil 1927 — appareil libre : la tête et chaque AUTRE protocole, jamais deux fois le même', () => {
    const c = candidatsNouvelleZone([], [beosound()], [], 'nav');
    expect(c.filter((x) => x.groupe === 'reseau').map((x) => [x.outputType, x.deviceId])).toEqual([
      ['dlna', 'uuid:beosound-dlna'],
      ['chromecast', 'cast:beosound'],
    ]);
  });

  it('fil 1927 — une zone masquée garde son seul chemin de restauration', () => {
    const c = candidatsNouvelleZone([], [beosound({ zone_hidden: true, hidden_zone_device_id: 'uuid:beosound-dlna' })], [], 'nav');
    expect(c.filter((x) => x.groupe === 'reseau').map((x) => x.deviceId)).toEqual(['uuid:beosound-dlna']);
  });
});
