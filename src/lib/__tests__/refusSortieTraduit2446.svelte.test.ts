// @vitest-environment jsdom
// #2446 : clic réel → vraie API → notification et détails réellement rendus.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
vi.hoisted(() => {
  class AudioMuet {
    volume = 1; muted = false; src = ''; currentTime = 0;
    addEventListener() {} removeEventListener() {} load() {} pause() {}
    play() { return Promise.resolve(); }
  }
  (globalThis as any).Audio = AudioMuet;
});
import PisteActions from '../../components/v2/PisteActions.svelte';
import ToastContainer from '../../components/partages/ToastContainer.svelte';
import { locale, t } from '../i18n';
import { currentZoneId } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { MOTIF_ASIO_BLOQUE } from '../rearmementAsio';

const PHRASE = 'L’appareil de la zone « NanoPlayer témoin » ne s’est pas annoncé sur le réseau depuis le démarrage du serveur.';
const REARMEMENT = '/api/v1/system/audio/asio-warm-scan/rearm';
let corps: any;
let appels: { chemin: string; methode: string; corps: unknown }[];
let hote: HTMLDivElement;
let composants: ReturnType<typeof mount>[];
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), {
  status, headers: { 'Content-Type': 'application/json' },
});
const messageAffiche = () => {
  const copie = document.querySelector('.toast-msg')!.cloneNode(true) as HTMLElement;
  copie.querySelector('details')?.remove(); return copie.textContent?.trim();
};
async function jouer() {
  composants.push(mount(PisteActions, { target: hote, props: { piste: { id: 21, title: 'Piste témoin', source: 'local' } as any } }));
  composants.push(mount(ToastContainer, { target: hote })); flushSync();
  const bouton = hote.querySelector<HTMLButtonElement>('button.pa[aria-label]');
  expect(bouton?.getAttribute('aria-label')).toBe(get(t)('v2.pa.play'));
  bouton!.click(); flushSync();
  await vi.waitFor(() => expect(hote.querySelectorAll('.toast')).toHaveLength(1));
  // Laisser aussi remonter le refus dans PisteActions : pas de seconde annonce.
  await new Promise((r) => setTimeout(r, 0)); flushSync();
  expect(hote.querySelectorAll('.toast')).toHaveLength(1);
  expect(appels.filter((a) => a.methode === 'POST')).toEqual([
    { chemin: '/api/v1/zones/7/play', methode: 'POST', corps: { track_id: 21 } },
  ]);
}
beforeEach(() => {
  locale.set('fr'); currentZoneId.set(7); appels = []; composants = [];
  corps = { error: 'zone_output_unavailable', message: PHRASE };
  for (const n of get(notifications)) notifications.dismiss(n.id);
  hote = document.createElement('div'); document.body.append(hote);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const chemin = new URL(String(url), window.location.href).pathname;
    appels.push({ chemin, methode: init?.method ?? 'GET', corps: init?.body ? JSON.parse(String(init.body)) : null });
    if (chemin === '/api/v1/zones/7/play') return json(corps, 409);
    if (chemin === REARMEMENT) return json({ status: 'rearmed', retry: 'next_restart' });
    return json([]);
  }));
});
afterEach(async () => {
  for (const c of composants) await unmount(c);
  hote.remove(); currentZoneId.set(null); locale.set('fr');
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.unstubAllGlobals();
});
describe('#2446 — refus ordinaire traduit jusqu’au message affiché', () => {
  it.each(['ro', 'en', 'fr'] as const)('%s : le conseil est traduit et la phrase française reste repliée', async (langue) => {
    locale.set(langue); await jouer();
    expect(messageAffiche()).toBe(get(t)('zone.outputMissingBanner'));
    expect(messageAffiche()).not.toContain(PHRASE);
    const details = hote.querySelector<HTMLDetailsElement>('details.toast-detail')!;
    expect(details).not.toBeNull(); expect(details.open).toBe(false);
    expect(details.querySelector('code')?.textContent).toContain(PHRASE);
    expect(details.querySelector('code')?.textContent).toContain('NanoPlayer témoin');
    expect(details.querySelector('code')?.textContent).toContain('zone_output_unavailable');
    details.querySelector('summary')!.click(); expect(details.open).toBe(true);
    expect(hote.querySelector('.toast-action')).toBeNull();
  });
  it('le code seul suffit à afficher le conseil roumain', async () => {
    locale.set('ro'); corps = { error: 'zone_output_unavailable' }; await jouer();
    expect(messageAffiche()).toBe(get(t)('zone.outputMissingBanner'));
  });
  it.each([false, true])('le refus ASIO précis garde son explication et respecte can_rearm=%s', async (possible) => {
    const explication = 'Le balayage ASIO témoin est suspendu après un échec précédent.';
    corps = { error: 'zone_output_unavailable', message: explication, reason: MOTIF_ASIO_BLOQUE,
      can_rearm: possible, rearm_endpoint: REARMEMENT };
    await jouer(); expect(messageAffiche()).toBe(explication);
    const action = hote.querySelector<HTMLButtonElement>('.toast-action');
    expect(!!action).toBe(possible);
    if (action) {
      action.click(); flushSync();
      await vi.waitFor(() => expect(appels.some((a) => a.chemin === REARMEMENT && a.methode === 'POST')).toBe(true));
      await vi.waitFor(() => expect(hote.querySelector('.toast-success')?.textContent).toMatch(/prochain démarrage/i));
      expect(appels.filter((a) => a.chemin.endsWith('/play'))).toHaveLength(1);
    }
  });
});
