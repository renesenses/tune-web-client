// @vitest-environment jsdom
//
// Phase 5 — AUCUNE PERTE D'ACCÈS : groupes de zones, latence, multiroom OAAT.
//
// Avant ce portage, ces capacités n'étaient atteignables que par
// `ZoneManagerView` et son `OaatGroupsPanel`, que la phase 5 supprime :
//   - `listGroups` — la v2 savait grouper (modale de zone, clic droit sur la
//     barre de lecture) mais ne recevait jamais la liste : `groups={[]}` ;
//   - `measureLatency` ;
//   - les huit fonctions `*Oaat*`.
//
// 🔴 Chaque témoin MONTE l'écran Zones v2 (ou le panneau) et fait le geste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

const m = vi.hoisted(() => ({
  listGroups: vi.fn(), groupZones: vi.fn(), ungroupZones: vi.fn(), measureLatency: vi.fn(),
  getOaatGroups: vi.fn(), getOaatGroupStatus: vi.fn(), createOaatGroup: vi.fn(), deleteOaatGroup: vi.fn(),
  addOaatEndpoint: vi.fn(), removeOaatEndpoint: vi.fn(), setOaatGroupVolume: vi.fn(), setOaatEndpointVolume: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  const relais = Object.fromEntries(Object.keys(m).map((k) => [k, (...a: unknown[]) => (m as any)[k](...a)]));
  return {
    ...actual,
    ...relais,
    getZones: vi.fn(async () => ZONES),
    listStereoPairs: vi.fn(async () => []),
    getZonesDoublons: vi.fn(async () => []),
  };
});

import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import GroupesOaatV2 from '../../components/v2/GroupesOaatV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { notifications } from '../stores/notifications';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

const ZONES = [
  { id: 1, name: 'Salon', state: 'stopped', volume: 0.4, output_type: 'dlna', output_device_id: 'uuid:a' },
  { id: 2, name: 'Cuisine', state: 'stopped', volume: 0.3, output_type: 'dlna', output_device_id: 'uuid:b' },
  { id: 3, name: 'Bureau', state: 'stopped', volume: 0.3, output_type: 'local', output_device_id: 'local:x' },
  { id: 4, name: 'Chambre', state: 'stopped', volume: 0.3, output_type: 'dlna', output_device_id: 'uuid:c' },
];
const GROUPE = { group_id: '1', leader_id: 1, zone_ids: [1, 2], auto_synced: false, group_manufacturer: '' };
const OAAT = { id: 'oaat-mr-1', name: 'Rez-de-chaussée', endpoints: [{ host: '192.168.1.60', port: 9740 }] };
const ETAT_OAAT = { streaming: true, multiroom: true, master_volume: 60, endpoints: [
  { endpoint_id: 'ep-1', name: 'Bridge salon', addr: '192.168.1.60:9740', state: 'ready', volume_offset: 0, effective_volume: 60 },
] };

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(composant: any): HTMLDivElement {
  hote = document.createElement('div');
  hote.className = 'tune-v2';
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: {} });
  flushSync();
  return hote;
}
async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
function bouton(el: HTMLElement, texte: string, racine = el): HTMLButtonElement {
  const b = [...racine.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === texte);
  expect(b, `bouton « ${texte} » introuvable`).toBeDefined();
  return b as HTMLButtonElement;
}
function saisir(champ: HTMLInputElement, valeur: string) {
  champ.value = valeur;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: 1, count: 0, devices: [] }),
    { headers: { 'content-type': 'application/json' } })));
  for (const f of Object.values(m)) f.mockReset();
  m.listGroups.mockResolvedValue([GROUPE]);
  m.groupZones.mockResolvedValue({ ...GROUPE, group_id: '2', zone_ids: [3, 4], leader_id: 3 });
  m.ungroupZones.mockResolvedValue(undefined);
  m.measureLatency.mockResolvedValue({ latencies: [
    { zone_id: 1, zone_name: 'Salon', status: 'reachable', control_rtt: { p50_ms: 12.34 } },
    { zone_id: 2, zone_name: 'Cuisine', status: 'probe_failed', control_rtt: null },
  ] });
  m.getOaatGroups.mockResolvedValue({ oaat_groups: [OAAT] });
  m.getOaatGroupStatus.mockResolvedValue(ETAT_OAAT);
  m.createOaatGroup.mockResolvedValue({ id: 'oaat-mr-2', endpoints: 1 });
  m.deleteOaatGroup.mockResolvedValue({ deleted: true });
  m.addOaatEndpoint.mockResolvedValue({ endpoint_id: 'ep-2', host: '192.168.1.61', port: 9740 });
  m.removeOaatEndpoint.mockResolvedValue({ removed: true, endpoint_id: 'ep-1' });
  m.setOaatGroupVolume.mockResolvedValue({ volume: 40 });
  m.setOaatEndpointVolume.mockResolvedValue({ volume: 30 });
  zones.set(ZONES as never);
  currentZoneId.set(1);
  // Le magasin est global au module : on vide ce que le cas précédent a laissé.
  for (const n of get(notifications) as any[]) notifications.dismiss(n.id);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  currentZoneId.set(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('groupes de zones dans Zones v2', () => {
  it('la liste des groupes s’affiche, avec la zone meneuse, et se défait', async () => {
    const el = poser(ZonesV2);
    await attendre();
    expect(m.listGroups).toHaveBeenCalled();
    const groupes = el.querySelector('section.groupes') as HTMLElement;
    expect(groupes, 'section des groupes absente').not.toBeNull();
    expect(groupes.textContent).toContain('Salon + Cuisine');
    expect(groupes.textContent).toContain(fr['zone.leader']);
    bouton(el, fr['zone.ungroup'], groupes).click();
    await attendre();
    expect(m.ungroupZones).toHaveBeenCalledWith('1');
  });

  it('grouper : la PREMIÈRE zone cochée mène, les zones déjà groupées ne sont pas proposées', async () => {
    const el = poser(ZonesV2);
    await attendre();
    const groupes = el.querySelector('section.groupes') as HTMLElement;
    bouton(el, fr['zone.group'], groupes).click();
    await attendre();
    const coches = [...groupes.querySelectorAll('label.coche')];
    expect(coches.map((c) => c.textContent?.trim())).toEqual(['Bureau', 'Chambre']);
    (coches[1].querySelector('input') as HTMLInputElement).click();
    (coches[0].querySelector('input') as HTMLInputElement).click();
    flushSync();
    (groupes.querySelector('button.grouper') as HTMLButtonElement).click();
    await attendre();
    expect(m.groupZones).toHaveBeenCalledWith(4, [4, 3]);
  });

  it('une réponse qui n’est pas une liste ne fait pas planter l’écran', async () => {
    m.listGroups.mockResolvedValue({ version: 1 });
    const el = poser(ZonesV2);
    await attendre();
    expect(el.querySelector('section.groupes'), 'l’écran doit rester utilisable').not.toBeNull();
    expect(el.querySelectorAll('section.groupes .groupe')).toHaveLength(0);
  });
});

describe('latence de commande (Expert)', () => {
  it('mesure toutes les zones et dit la raison quand il n’y a pas de valeur', async () => {
    const el = poser(ZonesV2);
    await attendre();
    bouton(el, fr['v2.zone.latencyMeasure']).click();
    await attendre();
    expect(m.measureLatency).toHaveBeenCalledTimes(1);
    const bloc = el.querySelector('section.latence') as HTMLElement;
    expect(bloc.textContent).toContain('12.3 ms');
    expect(bloc.textContent).toContain(fr['v2.zone.latencyProbeFailed']);
  });

  it('absente au niveau Avancé, comme le multiroom OAAT', async () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
    const el = poser(ZonesV2);
    await attendre();
    expect(el.querySelector('section.latence')).toBeNull();
    expect(el.querySelector('section.oaat')).toBeNull();
    expect(el.querySelector('section.groupes')).not.toBeNull();
  });
});

describe('multiroom OAAT (Expert)', () => {
  it('Zones v2 charge les groupes OAAT et leur état', async () => {
    const el = poser(ZonesV2);
    await attendre();
    expect(m.getOaatGroups).toHaveBeenCalled();
    expect(m.getOaatGroupStatus).toHaveBeenCalledWith('oaat-mr-1');
    expect(el.querySelector('section.oaat')?.textContent).toContain('Rez-de-chaussée');
  });

  it('créer un groupe : nom, point, création', async () => {
    const el = poser(GroupesOaatV2);
    await attendre();
    bouton(el, fr['v2.oaat.newGroup']).click();
    await attendre();
    saisir(el.querySelector('input.large') as HTMLInputElement, 'Étage');
    saisir(el.querySelector('input.hote') as HTMLInputElement, '192.168.1.70');
    (el.querySelector('button.ajouter') as HTMLButtonElement).click();
    await attendre();
    (el.querySelector('button.creer') as HTMLButtonElement).click();
    await attendre();
    expect(m.createOaatGroup).toHaveBeenCalledWith('Étage', [{ host: '192.168.1.70', port: 9740 }]);
  });

  it('un refus servi en 200 ({ error }) n’est pas annoncé comme une création (#1779)', async () => {
    m.createOaatGroup.mockResolvedValue({ error: 'Ces appareils ne répondent pas comme des points de diffusion Tune' });
    const el = poser(GroupesOaatV2);
    await attendre();
    bouton(el, fr['v2.oaat.newGroup']).click();
    await attendre();
    saisir(el.querySelector('input.large') as HTMLInputElement, 'Étage');
    saisir(el.querySelector('input.hote') as HTMLInputElement, '192.168.1.99');
    (el.querySelector('button.ajouter') as HTMLButtonElement).click();
    await attendre();
    (el.querySelector('button.creer') as HTMLButtonElement).click();
    await attendre();
    const n = get(notifications) as any[];
    expect(n.some((x) => x.level === 'error' && String(x.message).includes('points de diffusion'))).toBe(true);
    expect(n.some((x) => x.level === 'success')).toBe(false);
    // Le formulaire reste ouvert : rien n'a été créé.
    expect(el.querySelector('button.creer')).not.toBeNull();
  });

  it('déplier : volumes, retrait et ajout d’un point, suppression du groupe', async () => {
    const el = poser(GroupesOaatV2);
    await attendre();
    (el.querySelector('button.gnom') as HTMLButtonElement).click();
    await attendre();
    const curseurs = el.querySelectorAll('input[type="range"]');
    expect(curseurs).toHaveLength(2);
    saisir(curseurs[0] as HTMLInputElement, '40');
    saisir(curseurs[1] as HTMLInputElement, '30');
    await new Promise((r) => setTimeout(r, 260));
    await attendre();
    expect(m.setOaatGroupVolume).toHaveBeenCalledWith('oaat-mr-1', 40);
    expect(m.setOaatEndpointVolume).toHaveBeenCalledWith('oaat-mr-1', 'ep-1', 30);

    (el.querySelector('button.retirer') as HTMLButtonElement).click();
    await attendre();
    expect(m.removeOaatEndpoint).toHaveBeenCalledWith('oaat-mr-1', 'ep-1');

    (el.querySelector('button.ajout-point') as HTMLButtonElement).click();
    await attendre();
    saisir(el.querySelector('.groupe input.hote') as HTMLInputElement, '192.168.1.61');
    bouton(el, fr['v2.oaat.addEndpoint'], el.querySelector('.groupe') as HTMLElement).click();
    await attendre();
    expect(m.addOaatEndpoint).toHaveBeenCalledWith('oaat-mr-1', '192.168.1.61', 9740);

    (el.querySelector('button.supprimer') as HTMLButtonElement).click();
    await attendre();
    expect(m.deleteOaatGroup).toHaveBeenCalledWith('oaat-mr-1');
  });
});
