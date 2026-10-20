// @vitest-environment jsdom
//
// web#2141 (Didier, rc4, fil 2215) — « je ne vois toujours pas la section
// "Lecture groupée" ». Elle ne s'ouvrait que par un CLIC DROIT sur le bouton
// de zone de la barre de lecture (le clic gauche ouvre le sélecteur) :
// introuvable, et impossible sur tablette ou téléphone.
//
// Le témoin MONTE la barre de lecture, ouvre le sélecteur de zones par un
// CLIC (comme au doigt), y trouve « Lecture groupée… », et vérifie que la
// fenêtre de la zone s'ouvre, à la section Lecture groupée.
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
const entree = (h: HTMLElement) => h.querySelector<HTMLButtonElement>('.zone-popover [data-lecture-groupee]');

describe('web#2141 — la lecture groupée s’ouvre depuis le sélecteur de zones', () => {
  it('🔴 un CLIC sur le bouton de zone montre « Lecture groupée… »', () => {
    const h = poser();
    h.querySelector<HTMLButtonElement>('.zone-selector-btn')!.click();
    flushSync();
    const b = entree(h);
    expect(b, 'aucune entrée « Lecture groupée… » dans le sélecteur').not.toBeNull();
    expect(b!.textContent?.trim()).toBe(fr['zone.groupedPlaybackOpen']);
    expect(b!.getAttribute('title')).toBe(fr['zone.groupedPlaybackOpenTip']);
    // Ce n'est pas une zone de plus : la liste des noms n'en compte que deux.
    expect(h.querySelectorAll('.zone-popover .zone-popover-name').length).toBe(2);
  });

  it('🔴 elle ouvre la fenêtre de la zone pilotée, à la section Lecture groupée', async () => {
    const h = poser();
    h.querySelector<HTMLButtonElement>('.zone-selector-btn')!.click();
    flushSync();
    entree(h)!.click();
    flushSync();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    expect(document.body.textContent).toContain(fr['zone.groupedPlayback']);
    expect(document.body.textContent).toContain(fr['zone.selectZonesToSync'].replace('{name}', 'Salon'));
    expect(defile, 'la fenêtre ne descend pas à la section Lecture groupée').toContain('groupe');
    // Le sélecteur s'est refermé.
    expect(h.querySelector('.zone-popover')).toBeNull();
  });

  it('une seule zone : rien à grouper, pas d’entrée', () => {
    const h = poser([ZONES[0]]);
    h.querySelector<HTMLButtonElement>('.zone-selector-btn')!.click();
    flushSync();
    expect(entree(h)).toBeNull();
  });

  it.each(ONZE_LANGUES)('%s porte l’entrée et sa bulle', (code) => {
    const d = dictionnaire(code);
    expect(d['zone.groupedPlaybackOpen']).toBeTruthy();
    expect(d['zone.groupedPlaybackOpenTip']).toBeTruthy();
  });
});
