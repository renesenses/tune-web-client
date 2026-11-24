// @vitest-environment jsdom
//
// tune-server-rust#9179 — la réaffectation des canaux n'est appliquée que par
// une sortie LOCALE. Le serveur le dit (`applies_to_output: false` sur la
// route d'une zone dont la sortie est un lecteur réseau : DLNA, AirPlay,
// OAAT…), et le chemin du signal porte l'étape `channel_remap_not_applied`.
// Le badge, lui, disait « Réaffectation 4 → 2 » sans nuance, quelle que soit
// la zone : on croyait la règle appliquée alors que le lecteur réseau reçoit
// le flux sans réaffectation.
//
// Tenu ici :
//  1. carte de zone dont la sortie n'applique pas la règle → badge nuancé
//     (« non appliquée », infobulle qui dit pourquoi) ;
//  2. fiche album jouée dans une zone réseau → même nuance, lue sur la route
//     de la zone EN COURS ;
//  3. contre-épreuve : sortie locale (`true`) ou inconnue (`null`) → badge
//     inchangé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import BadgeReaffectation from '../../components/v2/BadgeReaffectation.svelte';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';

const ARMEE = {
  key: 'x', saved: true,
  settings: { enabled: true, inputs: 4, outputs: 2, gains_db: [[0, null, -3, null], [null, 0, null, -3]], normalize: true },
  effective: { valid: true, identity: false },
  input_names: null, output_names: null,
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => { locale.set('fr'); });
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

/** `zones` : `applies_to_output` rendu pour chaque zone. */
async function poser(props: Record<string, unknown>, zones: Record<number, boolean | null>) {
  const appels: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    appels.push(url);
    const z = /\/channel-remap\/zones\/(\d+)$/.exec(url);
    const corps = z
      ? { ...ARMEE, zone_id: Number(z[1]), applies_to_output: zones[Number(z[1])] ?? null }
      : { ...ARMEE, album_id: 42 };
    return new Response(JSON.stringify(corps), { headers: { 'content-type': 'application/json' } });
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(BadgeReaffectation, { target: hote, props: props as any });
  flushSync();
  for (let i = 0; i < 8; i++) { await Promise.resolve(); await tick(); }
  flushSync();
  return { el: hote, appels };
}

describe('#9179 — badge de réaffectation hors sortie locale', () => {
  it('🔴 carte d’une zone réseau : « non appliquée », et l’infobulle dit pourquoi', async () => {
    const { el } = await poser({ cible: 'zone', id: 7 }, { 7: false });
    const b = el.querySelector('[data-reaffectation="zone"]');
    expect(b).not.toBeNull();
    expect(b!.getAttribute('data-appliquee')).toBe('false');
    expect(b!.textContent).toMatch(/4\s*→\s*2/);
    expect(b!.textContent).toMatch(/non appliquée/);
    expect(b!.getAttribute('title') ?? '').toMatch(/lecteur réseau/);
  });

  it('🔴 fiche album jouée dans une zone réseau : nuance lue sur la zone en cours', async () => {
    currentZoneId.set(7);
    const { el, appels } = await poser({ cible: 'album', id: 42 }, { 7: false });
    expect(appels.some((u) => u.endsWith('/channel-remap/albums/42'))).toBe(true);
    expect(appels.some((u) => u.endsWith('/channel-remap/zones/7'))).toBe(true);
    const b = el.querySelector('[data-reaffectation="album"]');
    expect(b).not.toBeNull();
    expect(b!.getAttribute('data-appliquee')).toBe('false');
    expect(b!.textContent).toMatch(/non appliquée/);
    expect(b!.getAttribute('title') ?? '').toMatch(/zone en cours/);
  });

  it('contre-épreuve : sortie locale ou inconnue → badge inchangé', async () => {
    for (const applique of [true, null]) {
      const { el } = await poser({ cible: 'zone', id: 3 }, { 3: applique });
      const b = el.querySelector('[data-reaffectation="zone"]');
      expect(b).not.toBeNull();
      expect(b!.hasAttribute('data-appliquee')).toBe(false);
      expect(b!.textContent).not.toMatch(/non appliquée/);
      if (monte) unmount(monte);
      monte = null;
      hote?.remove();
      hote = null;
    }
    currentZoneId.set(3);
    const { el } = await poser({ cible: 'album', id: 42 }, { 3: true });
    const b = el.querySelector('[data-reaffectation="album"]');
    expect(b!.hasAttribute('data-appliquee')).toBe(false);
  });
});
