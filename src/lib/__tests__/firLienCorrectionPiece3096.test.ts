// @vitest-environment jsdom
//
// Fil 3096 (Xavier, Windows, Edge) — « Importer un filtre FIR… » de l'écran
// Correction de pièce ouvrait Réglages › Appareils sur la liste, sans le bloc
// d'import : ce bloc est sous la garde de niveau « Intermédiaire » de la fiche
// de zone, et le niveau par défaut est « Essentiel ». Le lien doit amener
// DIRECTEMENT au bloc de la zone, quel que soit le niveau.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { zones } from '../stores/zones';

const ZONE = 3096;
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}
async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    json(/\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(String(url)) ? [] : {})));
  zones.set([{ id: ZONE, name: 'Salon', state: 'stopped', output_type: 'local' } as any]);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
});

describe.each(['beginner', 'intermediate', 'expert'] as const)('fil 3096 — lien FIR au niveau %s', (niveau) => {
  it('ouvre la fiche de la zone ET le bloc d’import FIR, visible', async () => {
    preferences.update((p) => ({ ...p, settingsLevel: niveau }));
    v2SettingsTarget.set({ tab: 'devices', section: 'perZone', zone: ZONE, bloc: 'fir' });
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SettingsV2, { target: hote, props: {} });
    flushSync();
    await attendre();

    expect(hote.querySelector(`#zc-${ZONE}`), 'fiche de la zone non ouverte').toBeTruthy();
    const bloc = hote.querySelector(`#fir-${ZONE}`);
    expect(bloc, 'bloc FIR absent de la fiche').toBeTruthy();
    expect(bloc!.querySelector('input[type="file"]'), 'pas de champ d’import').toBeTruthy();
    expect(bloc!.closest('details')!.open, 'repli « Correction de pièce » fermé').toBe(true);
  });
});
