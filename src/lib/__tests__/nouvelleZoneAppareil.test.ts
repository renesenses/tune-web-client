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
});
