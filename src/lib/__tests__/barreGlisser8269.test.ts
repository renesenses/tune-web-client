// @vitest-environment jsdom
//
// Discussion #8269 — décision de Bertrand du 12/11/2026 : le GLISSER sur la
// barre de lecture du bas, comme sur Lecture en cours (SeekBar), pour la barre
// classique ET la forme d'onde. Pendant le glisser, rien ne part ; UNE seule
// recherche au relâchement ; le `click` qui suit n'en envoie pas une seconde.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { seekPositionMs } from '../stores/nowPlaying';
import { mobileNowPlayingOpen } from '../stores/navigation';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let fetchMock: ReturnType<typeof vi.fn>;
const souffler = async (n = 10) => {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};
const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => corps, text: async () => JSON.stringify(corps),
} as unknown as Response);
const seeks = () => fetchMock.mock.calls
  .filter((c) => String(c[0]).includes('/seek'))
  .map((c) => JSON.parse(String((c[1] as RequestInit).body)).position_ms as number);

function zoneAvec(track: Record<string, unknown>) {
  zones.set([{
    id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4,
    current_track: { title: 'Titre', artist_name: 'Artiste', album_title: 'Album', duration_ms: 200000, sample_rate: 44100, bit_depth: 16, format: 'flac', ...track },
  }] as never);
}

async function monterBarre(): Promise<HTMLElement> {
  monte = mount(TransportBar, { target: hote! });
  await souffler();
  const piste = hote!.querySelector<HTMLElement>('.progress-track')!;
  piste.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 400, bottom: 20, width: 400, height: 20, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return piste;
}

const souris = (type: string, x: number) => new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
function toucher(type: string, x: number | null) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'touches', { value: x === null ? [] : [{ clientX: x, clientY: 5 }] });
  return ev;
}

beforeEach(() => {
  locale.set('en');
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  fetchMock = vi.fn(async (url: string) => {
    const m = String(url).match(/\/library\/tracks\/(\d+)\/waveform/);
    if (m) return reponse({ track_id: Number(m[1]), waveform: Array.from({ length: 200 }, (_, i) => (i % 10) / 10 + 0.05) });
    return reponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  currentZoneId.set(1);
  seekPositionMs.set(20_000);
  mobileNowPlayingOpen.set(false);
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } }
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

for (const [nom, barreOnde, track] of [
  ['barre classique', false, { source: 'qobuz', track_id: 1, source_id: 'q1' }],
  ['forme d’onde', true, { source: 'local', track_id: 301 }],
] as const) {
  describe(`#8269 — glisser sur la barre du bas (${nom})`, () => {
    beforeEach(() => {
      preferences.update((p) => ({ ...p, barreOnde, barreVuMetres: false }));
      zoneAvec(track);
    });

    it('🔴 souris : la barre suit sans rien envoyer, UNE recherche au relâchement, le click suivant n’en ajoute pas', async () => {
      const piste = await monterBarre();
      expect(!!piste.querySelector('.onde'), 'mode attendu').toBe(barreOnde);
      piste.dispatchEvent(souris('mousedown', 100));
      window.dispatchEvent(souris('mousemove', 200));
      window.dispatchEvent(souris('mousemove', 300));
      await souffler(3);
      expect(seeks(), 'aucune recherche pendant le glisser').toEqual([]);
      expect(piste.getAttribute('aria-valuenow')).toBe('150000');
      window.dispatchEvent(souris('mouseup', 300));
      piste.dispatchEvent(souris('click', 300));
      await souffler(3);
      expect(seeks()).toEqual([150_000]);
      expect(get(seekPositionMs)).toBe(150_000);
      // Un clic simple, ensuite, cherche toujours (une fois).
      piste.dispatchEvent(souris('mousedown', 40));
      window.dispatchEvent(souris('mouseup', 40));
      piste.dispatchEvent(souris('click', 40));
      await souffler(3);
      expect(seeks()).toEqual([150_000, 20_000]);
    });

    it('🔴 tactile : idem au doigt, et le relâchement n’ouvre pas Lecture en cours', async () => {
      const piste = await monterBarre();
      piste.dispatchEvent(toucher('touchstart', 40));
      const deplacement = toucher('touchmove', 120);
      window.dispatchEvent(deplacement);
      window.dispatchEvent(toucher('touchmove', 200));
      await souffler(3);
      expect(deplacement.defaultPrevented, 'la page ne défile pas pendant le glisser').toBe(true);
      expect(seeks()).toEqual([]);
      window.dispatchEvent(toucher('touchend', null));
      await souffler(3);
      expect(seeks()).toEqual([100_000]);
      expect(get(mobileNowPlayingOpen)).toBe(false);
    });
  });
}
