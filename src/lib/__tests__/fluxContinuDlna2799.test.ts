// @vitest-environment jsdom
//
// web#2799 — interrupteur « Flux continu entre les pistes » d'une zone DLNA
// (serveur : renesenses/tune-server-rust#8082, PR #8406, lot rc12).
//
// Contrat : la zone porte `dlna_flux_continu: boolean`, toujours présent sur un
// serveur qui connaît le réglage. Absent (serveur plus ancien) ⇒ pas
// d'interrupteur. Écriture : `PATCH /zones/{id}` avec
// `{"dlna_flux_continu": true|false}`.
//
// Le banc MONTE la fiche (`RendererConfig`) et lit la requête qui part
// vraiment : un nom de champ mal orthographié passerait sinon au vert.
// Contre-épreuve : sur `origin/main`, aucun `[data-reglage="zone-flux-continu"]`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import RendererConfig from '../../components/partages/RendererConfig.svelte';
import type { Zone } from '../types';
import lFr from '../locales/fr';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const fr = lFr as unknown as Record<string, string>;
type Requete = { methode: string; chemin: string; corps: unknown };
let requetes: Requete[] = [];
let monte: Record<string, any> | null = null;

function zone(over: Record<string, unknown> = {}): Zone {
  return { id: 7, name: 'Salon', output_type: 'dlna', output_device_id: 'uuid:salon', ...over } as unknown as Zone;
}
function monter(z: Zone): HTMLElement {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(RendererConfig, { target: hote, props: { zone: z } });
  flushSync();
  return hote;
}
const interrupteur = (h: HTMLElement) =>
  h.querySelector<HTMLInputElement>('[data-reglage="zone-flux-continu"] input[type="checkbox"]');

beforeEach(() => {
  requetes = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const chemin = new URL(String(url), 'http://tune.test').pathname;
    const corps = init?.body ? JSON.parse(String(init.body)) : null;
    requetes.push({ methode: (init?.method ?? 'GET').toUpperCase(), chemin, corps });
    return new Response(JSON.stringify({ ...zone(), ...(corps ?? {}) }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('#2799 — l’interrupteur n’apparaît que là où il agit', () => {
  it('serveur plus ancien (champ absent) : pas d’interrupteur', () => {
    expect(interrupteur(monter(zone()))).toBeNull();
  });

  it('zone OpenHome, même si le champ est publié : pas d’interrupteur', () => {
    expect(interrupteur(monter(zone({ output_type: 'openhome', dlna_flux_continu: false })))).toBeNull();
  });

  it('🔴 zone DLNA qui publie le champ : l’interrupteur, son libellé et son aide', () => {
    const h = monter(zone({ dlna_flux_continu: false }));
    const i = interrupteur(h);
    expect(i, 'interrupteur absent alors que le serveur publie le champ').not.toBeNull();
    expect(i!.checked).toBe(false);
    expect(h.textContent).toContain(fr['renderer.fluxContinu']);
    expect(h.textContent).toContain(fr['renderer.fluxContinuHint']);
    expect(fr['renderer.fluxContinu']).toBe('Flux continu entre les pistes');
  });

  it('activé côté serveur : coché', () => {
    expect(interrupteur(monter(zone({ dlna_flux_continu: true })))!.checked).toBe(true);
  });
});

describe('#2799 — ce qui part sur le réseau', () => {
  it('🔴 cocher envoie PATCH /zones/7 {"dlna_flux_continu": true}', async () => {
    const i = interrupteur(monter(zone({ dlna_flux_continu: false })))!;
    i.checked = true;
    i.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(requetes.some((r) => r.methode === 'PATCH')).toBe(true));
    const p = requetes.filter((r) => r.methode === 'PATCH').at(-1)!;
    expect(p.chemin).toBe('/api/v1/zones/7');
    expect(p.corps).toEqual({ dlna_flux_continu: true });
  });

  it('décocher envoie {"dlna_flux_continu": false}', async () => {
    const i = interrupteur(monter(zone({ dlna_flux_continu: true })))!;
    i.checked = false;
    i.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(requetes.some((r) => r.methode === 'PATCH')).toBe(true));
    expect(requetes.filter((r) => r.methode === 'PATCH').at(-1)!.corps).toEqual({ dlna_flux_continu: false });
  });
});

describe('#2799 — les textes existent dans les quinze langues', () => {
  it.each(ONZE_LANGUES)('%s', (code) => {
    const d = dictionnaire(code);
    expect(d['renderer.fluxContinu'], code).toBeTruthy();
    expect(d['renderer.fluxContinuHint'], code).toBeTruthy();
  });
});
