// @vitest-environment jsdom
//
// tune-server-rust#7838 (reprise de #7279, Innuos Zenith, fil 2495) — un
// appareil réseau VU mais incapable de jouer dit pourquoi dans l'écran des
// zones ; une zone simplement éteinte reste « hors ligne ».
//
// Le serveur publie la raison depuis tune-server-rust#7831 (lot rc11) :
// `sortie_reseau_absente`, et, quand la découverte voit l'appareil,
// `raison_sortie_absente` + `services_manquants` ; `GET /devices` publie
// `registered: false` pour un appareil trouvé sans sortie de lecture.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { devices, unboundDevices } from '../stores/devices';
import { locale } from '../i18n';
import { cleRaisonSortieReseau, appareilSansSortie } from '../raisonSortieReseau';
import { candidatsNouvelleZone } from '../appareilsNouvelleZone';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('#7838 — la règle', () => {
  it('nomme le service manquant en mots simples', () => {
    expect(cleRaisonSortieReseau({ raison_sortie_absente: 'services_de_rendu_manquants', services_manquants: ['renderingcontrol'] }))
      .toBe('v2.zone.raisonSansVolume');
    expect(cleRaisonSortieReseau({ raison_sortie_absente: 'services_de_rendu_manquants', services_manquants: ['avtransport'] }))
      .toBe('v2.zone.raisonSansLecture');
    expect(cleRaisonSortieReseau({ raison_sortie_absente: 'services_de_rendu_manquants', services_manquants: ['avtransport', 'renderingcontrol'] }))
      .toBe('v2.zone.raisonSansLectureNiVolume');
  });

  it('une sortie qui n’a pas pu être créée le dit', () => {
    expect(cleRaisonSortieReseau({ raison_sortie_absente: 'sortie_non_enregistree', services_manquants: [] }))
      .toBe('v2.zone.raisonSortieNonCreee');
  });

  it('🔴 sans raison publiée (appareil hors ligne, serveur ancien), rien n’est inventé', () => {
    expect(cleRaisonSortieReseau({})).toBeNull();
    expect(cleRaisonSortieReseau({ services_manquants: ['renderingcontrol'] })).toBeNull();
  });

  it('`registered: false` seul signale un appareil sans sortie ; l’absence vaut `true`', () => {
    expect(appareilSansSortie({ registered: false })).toBe(true);
    expect(appareilSansSortie({ registered: true })).toBe(false);
    expect(appareilSansSortie({})).toBe(false);
  });
});

describe('#7838 — un appareil sans sortie n’est pas proposé comme sortie', () => {
  const ZENITH = { id: 'uuid:zenith', name: 'Innuos Zenith', type: 'dlna', host: '192.0.2.79', port: 49152, available: true, registered: false } as any;
  const MARANTZ = { id: 'uuid:marantz', name: 'Marantz', type: 'dlna', host: '192.0.2.80', port: 49152, available: true, registered: true } as any;
  const ANCIEN = { id: 'uuid:ancien', name: 'Ancien serveur', type: 'dlna', host: '192.0.2.81', port: 49152, available: true } as any;

  afterEach(() => { devices.set([]); zones.set([]); });

  it('ni dans la création d’une zone…', () => {
    const noms = candidatsNouvelleZone([], [ZENITH, MARANTZ, ANCIEN], [], 'Navigateur').map((c) => c.nom);
    expect(noms).not.toContain('Innuos Zenith');
    expect(noms).toContain('Marantz');
    expect(noms).toContain('Ancien serveur');
  });

  it('…ni parmi les appareils libres', () => {
    devices.set([ZENITH, MARANTZ, ANCIEN]);
    zones.set([]);
    expect(get(unboundDevices).map((d) => d.name)).toEqual(['Marantz', 'Ancien serveur']);
  });

  it('Réglages › Appareils le signale au lieu de le montrer comme un appareil ordinaire', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
    const bloc = src.slice(src.indexOf('data-reglage="appareils-reseau"'), src.indexOf("s.id === 'sendspin'"));
    expect(bloc).toContain('{#if appareilSansSortie(d)}');
    expect(bloc).toContain("$t('v2.devices.sansSortie' as any)");
  });
});

describe('#7838 — l’écran des zones', () => {
  let host: HTMLDivElement;
  let component: ReturnType<typeof mount> | undefined;
  let serverZones: Record<string, unknown>[];
  const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  async function settle() {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      flushSync();
    }
  }

  beforeEach(() => {
    localStorage.clear();
    locale.set('fr');
    serverZones = [
      // L'Innuos : vu, il n'annonce pas de contrôle du volume.
      { id: 1, name: 'Innuos Zenith', state: 'stopped', output_type: 'dlna', output_device_id: 'uuid:zenith', online: true,
        sortie_reseau_absente: true, raison_sortie_absente: 'services_de_rendu_manquants', services_manquants: ['renderingcontrol'] },
      // Éteinte : la sortie manque, mais la découverte ne la voit pas.
      { id: 2, name: 'Chambre', state: 'stopped', output_type: 'dlna', output_device_id: 'uuid:chambre', online: false,
        sortie_reseau_absente: true },
      // Ordinaire.
      { id: 3, name: 'Salon', state: 'stopped', output_type: 'dlna', output_device_id: 'uuid:salon', online: true,
        sortie_reseau_absente: false },
    ];
    zones.set(serverZones as never);
    currentZoneId.set(3);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/\/zones(?:\?lang=[a-z]{2})?$/.test(url)) return response(serverZones);
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
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('🔴 la zone vue mais muette dit POURQUOI ; l’éteinte reste « hors ligne » ; l’ordinaire ne dit rien', async () => {
    component = mount(ZonesV2, { target: host });
    flushSync();
    await settle();
    const carte = (nom: string) => [...host.querySelectorAll<HTMLElement>('.grille .carte')]
      .find((c) => c.querySelector('.cnom')?.textContent?.trim() === nom)!;

    const innuos = carte('Innuos Zenith');
    expect(innuos.querySelector('[data-raison-sortie]')?.textContent)
      .toBe('Vu sur le réseau, mais ne peut pas jouer : l’appareil n’annonce pas de contrôle du volume.');
    expect(innuos.querySelector('.rc.bad')?.textContent).toBe('Ne peut pas jouer');

    const chambre = carte('Chambre');
    expect(chambre.querySelector('[data-raison-sortie]')).toBeNull();
    expect(chambre.querySelector('.rc.bad')?.textContent).toBe('Hors ligne');

    const salon = carte('Salon');
    expect(salon.querySelector('[data-raison-sortie]')).toBeNull();
    expect(salon.querySelector('.rc.bad')).toBeNull();
  });

  it('ne propose pas « Rattacher » (ASIO) à une zone réseau sans sortie', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/ZonesV2.svelte'), 'utf-8');
    expect(src).toContain('rattachable: z.sortie_absente === true,');
    expect(src).not.toMatch(/rattachable:[^\n]*sortie_reseau_absente/);
  });
});
