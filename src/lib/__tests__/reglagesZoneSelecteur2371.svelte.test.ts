// @vitest-environment jsdom
//
// web#2371 (Van Der Graaf Generator, forum-hifi : où se règle le gapless ?) —
// la fenêtre des réglages de la zone (`ZoneConfigModal`, seule à porter le
// gapless) ne s'ouvrait que par un CLIC DROIT sur le bouton de zone de la
// barre de lecture : introuvable, impossible au doigt et au clavier. web#2141
// n'avait ouvert que la section « Lecture groupée ».
//
// Le témoin MONTE la barre de lecture, ouvre le sélecteur de zones par un
// CLIC (comme au doigt), y trouve « Réglages de la zone… », et vérifie que la
// fenêtre de la zone s'ouvre EN HAUT (case gapless présente, aucun défilement
// vers une section).
//
// Contre-épreuve : sans l'entrée `data-reglages-zone`, les deux tests 🔴
// tombent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { selecteurZoneOuvert } from '../stores/selecteurZone';
import { locale } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');
const ZONES = [
  { id: 1, name: 'Salon', output_type: 'dlna', output_device_id: 'uuid:1', state: 'stopped', online: true },
  { id: 2, name: 'Cuisine', output_type: 'dlna', output_device_id: 'uuid:2', state: 'stopped', online: true },
];

const hotes: HTMLElement[] = [];
const montes: ReturnType<typeof mount>[] = [];
let defile: string[] = [];

beforeEach(() => {
  locale.set('fr');
  defile = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));
  (Element.prototype as any).scrollIntoView = function () { defile.push((this as HTMLElement).dataset.section ?? ''); };
});
afterEach(() => {
  while (montes.length) unmount(montes.pop()!);
  while (hotes.length) hotes.pop()!.remove();
  document.querySelectorAll('.modal-overlay, .zone-config-modal').forEach((n) => n.remove());
  zones.set([]);
  currentZoneId.set(null);
  selecteurZoneOuvert.set(false);
  delete (Element.prototype as any).scrollIntoView;
  vi.unstubAllGlobals();
});

function poser(liste = ZONES): HTMLElement {
  zones.set(liste as never);
  currentZoneId.set(1);
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(TransportBar, { target: hote }));
  flushSync();
  return hote;
}
const entree = (h: HTMLElement) => h.querySelector<HTMLButtonElement>('.zone-popover [data-reglages-zone]');

describe('web#2371 — les réglages de la zone s’ouvrent depuis le sélecteur de zones', () => {
  it('🔴 un CLIC sur le bouton de zone montre « Réglages de la zone… », même avec une seule zone', () => {
    const h = poser([ZONES[0]]);
    h.querySelector<HTMLButtonElement>('.zone-selector-btn')!.click();
    flushSync();
    const b = entree(h);
    expect(b, 'aucune entrée « Réglages de la zone… » dans le sélecteur').not.toBeNull();
    // Un vrai bouton : atteignable au clavier (Tab, Entrée) sans tabindex forcé.
    expect(b!.tagName).toBe('BUTTON');
    expect(b!.getAttribute('tabindex')).toBeNull();
    expect(b!.textContent?.trim()).toBe(fr['zone.settingsOpen']);
    expect(b!.getAttribute('title')).toBe(fr['zone.settingsOpenTip']);
    // Ce n'est pas une zone de plus.
    expect(h.querySelectorAll('.zone-popover .zone-popover-name').length).toBe(1);
  });

  it('🔴 elle ouvre la fenêtre de la zone pilotée, en haut, avec le gapless', async () => {
    const h = poser();
    h.querySelector<HTMLButtonElement>('.zone-selector-btn')!.click();
    flushSync();
    entree(h)!.click();
    flushSync();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    expect(document.body.textContent).toContain(fr['zoneConfig.gaplessLabel']);
    expect(defile, 'la fenêtre a défilé vers une section au lieu de s’ouvrir en haut').toEqual([]);
    expect(h.querySelector('.zone-popover'), 'le sélecteur ne s’est pas refermé').toBeNull();
  });

  it.each(ONZE_LANGUES)('%s porte l’entrée et sa bulle', (code) => {
    const d = dictionnaire(code);
    expect(d['zone.settingsOpen']).toBeTruthy();
    expect(d['zone.settingsOpenTip']).toBeTruthy();
  });
});
