import { expect, it, vi } from 'vitest';
import { etatSourceUpnp, disponibiliteUpnp, type RegistreUpnp } from '../stores/disponibiliteUpnp';
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../api', () => ({ getMediaServers: mocks.read }));
import type { MediaServer } from '../types';

it('une annonce manquée ou une réponse ancienne ne prouve pas une absence', () => {
  const registre = (s: Partial<MediaServer>) => ({ connu: true, serveurs: new Map([['uuid:nas', { id: 'uuid:nas', name: 'NAS', ...s } as MediaServer]]) });
  expect(etatSourceUpnp('uuid:nas|piste', registre({ reachable: false, presence: 'present' })).etat).toBe('stale');
  expect(etatSourceUpnp('uuid:nas|piste', registre({})).etat).toBe('unknown');
  expect(etatSourceUpnp('uuid:nas|piste', registre({ reachable: true, active: false })).etat).toBe('disabled');
  expect(etatSourceUpnp('uuid:inconnu|piste', registre({ reachable: true })).etat).toBe('unknown');
});


it('un registre qui ne répond plus perd son état connu, puis récupère au sondage suivant', async () => {
  vi.useFakeTimers();
  mocks.read.mockResolvedValueOnce([{ id: 'uuid:nas', name: 'NAS', reachable: true }]);
  mocks.read.mockImplementationOnce((signal: AbortSignal) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('annulation')));
  }));
  mocks.read.mockResolvedValue([{ id: 'uuid:nas', name: 'NAS', presence: 'absent', reachable: false }]);
  let dernier: RegistreUpnp = { connu: false, serveurs: new Map() };
  const quitter = disponibiliteUpnp.subscribe(r => { dernier = r; });
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(etatSourceUpnp('uuid:nas|p', dernier).etat).toBe('present');
    await vi.advanceTimersByTimeAsync(38_000);
    expect(dernier.connu).toBe(false);
    expect(etatSourceUpnp('uuid:nas|p', dernier).etat).toBe('unknown');
    await vi.advanceTimersByTimeAsync(22_000);
    expect(etatSourceUpnp('uuid:nas|p', dernier).etat).toBe('absent');
  } finally { quitter(); vi.useRealTimers(); }
});
