import { describe, it, expect } from 'vitest';
import { enceintesSendspin } from '../sendspinExclusions';
import { V2_SETTINGS } from '../v2Settings';

// Liste d'exclusion Sendspin (tune-server-rust #3326, serveur rc4).
describe('enceintesSendspin', () => {
  it('une annonce contactée est exclue par son client_id, une annonce jamais contactée par son identifiant', () => {
    const l = enceintesSendspin({
      players: [
        { id: 'sendspin:10.0.0.5:8928', name: 'Voice PE', host: '10.0.0.5', port: 8928, client_id: 'CID-A', excluded: false },
        { id: 'sendspin:10.0.0.6:8928', name: 'Cuisine', host: '10.0.0.6', port: 8928, client_id: null, excluded: true },
      ],
      handshaked: [{ client_id: 'CID-A', name: 'Voice PE salon' }],
      excluded: ['sendspin:10.0.0.6:8928'],
    });
    expect(l).toEqual([
      { cle: 'CID-A', nom: 'Voice PE salon', adresse: '10.0.0.5:8928', exclue: false },
      { cle: 'sendspin:10.0.0.6:8928', nom: 'Cuisine', adresse: '10.0.0.6:8928', exclue: true },
    ]);
  });

  it('montre aussi les enceintes vues par le protocole seul et les exclusions devenues invisibles', () => {
    const l = enceintesSendspin({
      players: [],
      handshaked: [{ client_id: 'CID-B', name: 'Atelier', excluded: false }],
      excluded: ['CID-C'],
    });
    expect(l.map((e) => [e.cle, e.exclue])).toEqual([
      ['CID-B', false],
      ['CID-C', true],
    ]);
  });

  it('une réponse vide ne casse rien', () => {
    expect(enceintesSendspin({})).toEqual([]);
  });

  it('la section Sendspin existe dans Audio', () => {
    const audio = V2_SETTINGS.find((t) => t.id === 'audio');
    expect(audio?.sections.some((s) => s.id === 'sendspin')).toBe(true);
  });
});
