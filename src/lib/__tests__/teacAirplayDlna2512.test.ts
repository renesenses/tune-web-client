// @vitest-environment jsdom
//
// #2512 (tune-server-rust#7371, TEAC NT-505X : AirPlay et entrée NET/DLNA).
//
// Depuis tune-server-rust#7376 (fusionnée), quand DLNA est le protocole
// primaire d'un appareil, `GET /devices` publie DEUX lignes distinctes pour la
// paire AirPlay/DLNA (`dedup_devices` sort les AirPlay du groupe) : ids et
// types différents, même nom et même hôte possibles. Le contrat côté web :
//
//   1. le sélecteur libelle le protocole quand les noms sont identiques ;
//   2. les deux entrées ne sont jamais refusionnées par nom ou par hôte ;
//   3. le couple (identifiant, type) choisi arrive tel quel à `POST /zones`
//      — une zone DLNA reçoit l'id DLNA et `output_type: dlna` ;
//   4. une zone AirPlay déjà créée n'empêche pas le choix DLNA, et AirPlay
//      reste choisissable séparément.
//
// Annonces synthétiques, aucun appareil ni son.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { candidatsNouvelleZone, libelleCandidat, type CandidatZone } from '../appareilsNouvelleZone';
import { createZone } from '../api';

const HOTE = '192.0.2.50';
const airplay = { id: 'airplay-teac', name: 'TEAC NT-505X', type: 'airplay', host: HOTE, port: 7000, available: true } as any;
const dlna = { id: 'uuid:teac-dlna', name: 'TEAC NT-505X', type: 'dlna', host: HOTE, port: 1400, available: true } as any;
const reseau = (c: CandidatZone[]) => c.filter((x) => x.groupe === 'reseau');

afterEach(() => vi.unstubAllGlobals());

describe('#2512 — TEAC : AirPlay et DLNA restent deux choix', () => {
  it('deux annonces, même nom, même hôte : deux entrées, ni fusionnées ni confondues', () => {
    const c = reseau(candidatsNouvelleZone([], [airplay, dlna], [], 'nav'));
    expect(c.map((x) => [x.outputType, x.deviceId])).toEqual([
      ['airplay', 'airplay-teac'],
      ['dlna', 'uuid:teac-dlna'],
    ]);
    // Clés distinctes : le <select> ne peut pas confondre les deux options.
    expect(new Set(c.map((x) => x.cle)).size).toBe(2);
  });

  it('le libellé nomme le protocole : les deux options se distinguent', () => {
    const c = reseau(candidatsNouvelleZone([], [airplay, dlna], [], 'nav'));
    const libelles = c.map(libelleCandidat);
    expect(libelles).toEqual(['TEAC NT-505X · AirPlay', 'TEAC NT-505X · DLNA']);
    expect(new Set(libelles).size).toBe(2);
  });

  it('une zone AirPlay existe déjà : le choix DLNA reste proposé, avec son propre couple', () => {
    const zoneAirplay = { id: 3, name: 'TEAC', output_type: 'airplay', output_device_id: 'airplay-teac' } as any;
    const c = reseau(candidatsNouvelleZone([], [airplay, dlna], [zoneAirplay], 'nav'));
    expect(c.map((x) => [x.outputType, x.deviceId])).toEqual([['dlna', 'uuid:teac-dlna']]);
  });

  it('le choix explicite DLNA arrive à POST /zones avec l’id DLNA et output_type dlna', async () => {
    const corps: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      corps.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response(JSON.stringify({ id: 9 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const zoneAirplay = { id: 3, name: 'TEAC', output_type: 'airplay', output_device_id: 'airplay-teac' } as any;
    const choix = reseau(candidatsNouvelleZone([], [airplay, dlna], [zoneAirplay], 'nav'))
      .find((x) => x.outputType === 'dlna')!;
    await createZone(choix.nom, choix.outputType, choix.deviceId);
    expect(corps).toEqual([{ name: 'TEAC NT-505X', output_type: 'dlna', output_device_id: 'uuid:teac-dlna' }]);
  });

  it('AirPlay reste choisissable séparément quand la zone DLNA existe', () => {
    const zoneDlna = { id: 4, name: 'TEAC NET', output_type: 'dlna', output_device_id: 'uuid:teac-dlna' } as any;
    const c = reseau(candidatsNouvelleZone([], [airplay, dlna], [zoneDlna], 'nav'));
    expect(c.map((x) => [x.outputType, x.deviceId])).toEqual([['airplay', 'airplay-teac']]);
  });
});
