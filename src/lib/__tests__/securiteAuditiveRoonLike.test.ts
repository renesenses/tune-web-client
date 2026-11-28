// @vitest-environment jsdom
//
// Sécurité auditive en Roon-like (28/11/2026).
//
// Tous les contrôles de volume que l'interface Roon-like met sous la main —
// la barre de transport (et son panneau Volume, en tablette et en iPhone),
// les flèches du clavier, l'écran Zones — doivent suivre le MÊME chemin que
// le curseur de volume de Tune : même plafond (sécurité, confort), même refus
// en volume fixe ou PURE. La preuve demandée : aller au maximum sur une zone
// plafonnée à 60 % donne 60, par chaque chemin.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import { bornerCurseur } from '../limitesVolume';
import { cibleVolumeClavier } from '../keyboard';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const ZONE_60 = { id: 1, name: 'Salon', state: 'playing', output_type: 'dlna', volume: 0.4, volume_limit_safety: 0.6 };

describe('plafond de 60 % — le curseur de Tune (VolumeControl, transport Roon-like)', () => {
  it('tirer le curseur au maximum donne 60', () => {
    expect(bornerCurseur(ZONE_60 as any, 1, 0.4)).toBeCloseTo(0.6, 6);
  });
  it('le confort borne aussi, tant qu’on est en dessous', () => {
    const z = { ...ZONE_60, volume_limit_comfort: 0.5 };
    expect(bornerCurseur(z as any, 1, 0.4)).toBeCloseTo(0.5, 6);
  });
});

describe('plafond de 60 % — les flèches du clavier', () => {
  it('↑ à 59 % monte à 60, ↑ à 60 % reste à 60', () => {
    expect(cibleVolumeClavier(ZONE_60 as any, 0.59, 'up')).toBeCloseTo(0.6, 6);
    expect(cibleVolumeClavier(ZONE_60 as any, 0.6, 'up')).toBeCloseTo(0.6, 6);
  });
  it('cent appuis sur ↑ depuis 40 % : jamais au-delà de 60', () => {
    let v = 0.4;
    for (let i = 0; i < 100; i++) v = cibleVolumeClavier(ZONE_60 as any, v, 'up');
    expect(v).toBeCloseTo(0.6, 6);
  });
  it('↑ ne baisse jamais (état reçu au-dessus du plafond) ; ↓ descend', () => {
    expect(cibleVolumeClavier(ZONE_60 as any, 0.8, 'up')).toBe(0.8);
    expect(cibleVolumeClavier(ZONE_60 as any, 0.6, 'down')).toBeCloseTo(0.59, 6);
  });
  it('le gestionnaire refuse en volume fixe / non commandable et sous verrou PURE', () => {
    const code = lire('src/lib/keyboard.ts');
    const i = code.indexOf("case 'ArrowUp':");
    const bloc = code.slice(i, i + 400);
    expect(bloc).toContain('if (!volumeCommandable(zone) || isVolumeLocked()) break;');
    expect(bloc).toContain("cibleVolumeClavier(zone, vol, 'up')");
  });
});

describe('Roon-like n’a pas de chemin de volume à lui', () => {
  it('la barre de transport (bureau, tablette, iPhone) monte le curseur de Tune', () => {
    expect(lire('src/components/salon/TransportSalon.svelte')).toContain('<VolumeControl />');
  });
  it('aucun composant Roon-like n’envoie de volume lui-même', () => {
    for (const f of ['TransportSalon', 'LectureSalon', 'ShellSalon', 'FileSalon', 'AccueilSalon']) {
      const code = lire(`src/components/salon/${f}.svelte`);
      expect(code, f).not.toMatch(/setVolume|reglerVolume|setGroupVolume/);
    }
  });
  it('pas de molette ni de touche Fin / Page↑ qui contournerait le curseur', () => {
    const code = lire('src/lib/keyboard.ts');
    for (const k of ["'End'", "'Home'", "'PageUp'", "'PageDown'", 'wheel']) expect(code, k).not.toContain(k);
  });
});

// ── L'écran Zones (ouvert depuis le sélecteur de zone en Roon-like) ─────
let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let parties: { url: string; method: string; body: any }[];
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
async function settle() {
  for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

describe('plafond de 60 % — l’écran Zones', () => {
  beforeEach(() => {
    localStorage.clear();
    locale.set('fr');
    parties = [];
    const serveur = [ZONE_60];
    zones.set(serveur as never);
    currentZoneId.set(1);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      parties.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (/\/zones(?:\?lang=[a-z]{2})?$/.test(url)) return response(serveur);
      if (url.endsWith('/zones/stereo-pairs')) return response([]);
      if (url.includes('tune-tested.json')) return response({ version: 1, count: 0, devices: [] });
      if (url.endsWith('/system/diagnostics')) return response({ zones_doublons: [] });
      return response({});
    }));
    host = document.createElement('div');
    document.body.append(host);
  });
  afterEach(async () => {
    if (component) await unmount(component);
    component = undefined;
    host.remove();
    zones.set([]);
    currentZoneId.set(null);
    vi.unstubAllGlobals();
  });

  it('pousser le curseur à 100 envoie 60', async () => {
    component = mount(ZonesV2, { target: host });
    flushSync();
    await settle();
    const curseur = host.querySelector<HTMLInputElement>('input[type="range"]');
    expect(curseur, 'la carte de la zone porte un curseur').toBeTruthy();
    curseur!.value = '100';
    curseur!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    await settle();
    const puts = parties.filter((p) => p.method === 'PUT' && /\/zones\/1\/volume/.test(p.url));
    expect(puts.length).toBeGreaterThan(0);
    for (const p of puts) expect(p.body.volume).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(puts[puts.length - 1].body.volume).toBeCloseTo(0.6, 6);
  });
});
