// @vitest-environment jsdom
/**
 * web#3314 (suite de #3180) — vrais composants, vrais stores ; seules les
 * frontières HTTP, WebSocket et matchMedia sont simulées.
 *
 * - « Ne plus jouer ici » existe aussi dans le sélecteur de zone de la barre,
 *   dans la feuille mobile et dans la fenêtre de la zone ;
 * - la ligne « Ce téléphone » de la feuille suit la prise de l'onglet
 *   (`idCetAppareil` n'était lu qu'au montage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import TransportBar from '../../components/partages/TransportBar.svelte';
import ZoneConfigModal from '../../components/partages/ZoneConfigModal.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { selecteurZoneOuvert } from '../stores/selecteurZone';
import { locale } from '../i18n';
import { retenirZoneDeCetAppareil, zonesRetenues } from '../zoneNavigateurProprietaire';

const ZONES = [
  { id: 10, name: 'Eversolo DMP-A8', output_type: 'dlna', state: 'playing', online: true, volume: 0.4 },
  { id: 15, name: 'Pixel de Bertrand', output_type: 'browser', state: 'stopped', online: true, volume: 1 },
];

function reponse(corps: unknown): Response {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const hotes: HTMLElement[] = [];
const montes: ReturnType<typeof mount>[] = [];
function monter(C: any, props: Record<string, unknown> = {}) {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  const m = mount(C, { target: hote, props });
  montes.push(m);
  flushSync();
  return hote;
}
async function attendre() {
  for (let i = 0; i < 5; i++) { await Promise.resolve(); await tick(); }
  flushSync();
}

let petitEcran = true;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  locale.set('fr');
  petitEcran = true;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (/\/zones(\?|$)/.test(String(url))) return reponse(ZONES);
    if (/\/groups(\?|$)/.test(String(url))) return reponse([]);
    return reponse({});
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: petitEcran && /max-width:\s*768px/.test(q), media: q,
    addEventListener() {}, removeEventListener() {},
  }));
  zones.set(ZONES as never);
  currentZoneId.set(15);
  selecteurZoneOuvert.set(false);
});

afterEach(() => {
  while (montes.length) unmount(montes.pop()!);
  while (hotes.length) hotes.pop()!.remove();
  zones.set([]);
  currentZoneId.set(null);
  selecteurZoneOuvert.set(false);
  vi.unstubAllGlobals();
});

function ouvrirFeuille(el: HTMLElement) {
  el.querySelector<HTMLButtonElement>('.mobile-zone-wrapper button')!.click();
  flushSync();
}
const geste = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.zone-sheet [data-ne-plus-jouer-ici]');

describe('« Ne plus jouer ici » dans la feuille des zones', () => {
  it('relâche la zone pilotée que cet onglet tient, et ferme la feuille', () => {
    retenirZoneDeCetAppareil(15);
    const el = monter(TransportBar);
    ouvrirFeuille(el);
    const b = geste(el);
    expect(b?.textContent).toContain('Ne plus jouer ici');
    b!.click();
    flushSync();
    expect(zonesRetenues() ?? []).not.toContain(15);
    expect(get(selecteurZoneOuvert)).toBe(false);
    ouvrirFeuille(el);
    expect(geste(el)).toBeNull();
  });

  it("contre-épreuve : absent quand la zone pilotée n'est pas tenue ici", () => {
    retenirZoneDeCetAppareil(15);
    currentZoneId.set(10);
    const el = monter(TransportBar);
    ouvrirFeuille(el);
    expect(el.querySelector('.zone-sheet')).not.toBeNull();
    expect(geste(el)).toBeNull();
  });

  it('apparaît dès que cet onglet prend la zone, sans remonter la barre', () => {
    const el = monter(TransportBar);
    ouvrirFeuille(el);
    expect(geste(el)).toBeNull();
    retenirZoneDeCetAppareil(15);
    flushSync();
    expect(geste(el)).not.toBeNull();
  });
});

describe('« Ce téléphone » suit la prise de l\'onglet', () => {
  const ligne = (el: HTMLElement) => el.querySelector('.zone-sheet .zone-popover-item.cet-appareil');

  it('devient active quand la zone pilotée est prise après le montage', () => {
    const el = monter(TransportBar);
    ouvrirFeuille(el);
    expect(ligne(el)?.classList.contains('active')).toBe(false);
    retenirZoneDeCetAppareil(15);
    flushSync();
    expect(ligne(el)?.classList.contains('active')).toBe(true);
  });

  it('cesse de l\'être après « Ne plus jouer ici »', () => {
    retenirZoneDeCetAppareil(15);
    const el = monter(TransportBar);
    ouvrirFeuille(el);
    expect(ligne(el)?.classList.contains('active')).toBe(true);
    geste(el)!.click();
    flushSync();
    ouvrirFeuille(el);
    expect(ligne(el)?.classList.contains('active')).toBe(false);
  });
});

describe('« Ne plus jouer ici » dans la fenêtre de la zone', () => {
  const props = (zone: unknown) => ({
    zone, allZones: ZONES, groups: [], section: null,
    onClose: () => {}, onDelete: async () => {}, onGroupChanged: () => {}, onRenamed: () => {},
  });

  it('relâche la zone tenue ici, et le bouton disparaît', async () => {
    retenirZoneDeCetAppareil(15);
    const el = monter(ZoneConfigModal, props(ZONES[1]));
    await attendre();
    const b = el.querySelector<HTMLButtonElement>('[data-ne-plus-jouer-ici]');
    expect(b?.textContent).toContain('Ne plus jouer ici');
    b!.click();
    flushSync();
    expect(zonesRetenues() ?? []).not.toContain(15);
    expect(el.querySelector('[data-ne-plus-jouer-ici]')).toBeNull();
  });

  it("contre-épreuve : absent pour la zone navigateur d'un autre appareil", async () => {
    retenirZoneDeCetAppareil(99);
    const el = monter(ZoneConfigModal, props(ZONES[1]));
    await attendre();
    expect(el.querySelector('[data-ne-plus-jouer-ici]')).toBeNull();
  });
});

describe('sélecteur de zone de la barre (grand écran)', () => {
  it('porte aussi « Ne plus jouer ici »', () => {
    petitEcran = false;
    retenirZoneDeCetAppareil(15);
    const el = monter(TransportBar);
    selecteurZoneOuvert.set(true);
    flushSync();
    const b = el.querySelector<HTMLButtonElement>('.zone-popover:not(.zone-sheet) [data-ne-plus-jouer-ici]');
    expect(b).not.toBeNull();
    b!.click();
    flushSync();
    expect(zonesRetenues() ?? []).not.toContain(15);
  });
});
