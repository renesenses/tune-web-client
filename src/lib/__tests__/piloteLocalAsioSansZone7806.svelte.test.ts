// @vitest-environment jsdom
//
// tune-server-rust#7806 — fil 2248 (rc10, Windows, Denafrips Pontus). ASIO est
// choisi, le Denafrips est enregistré en ASIO mais SANS zone ; le réexamen
// WASAPI remet « This Computer » (haut-parleurs) en ligne, et toutes les
// lectures DSD y partent : WASAPI, DSD converti en PCM. Rien ne le disait.
//
// Le serveur pose `pilote_local` (`wasapi` / `asio`) sur chaque zone locale
// Windows et liste les sorties ASIO sans zone (`GET /zones/asio-sans-zone`).
// Ce banc MONTE le badge et l'écran Zones : l'avertissement doit apparaître,
// et « Créer la zone ASIO » doit appeler `POST /zones` sur le DAC.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import BadgeHorsBackend from '../../components/v2/BadgeHorsBackend.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import { piloteDeLaZone, sortiesAsioAAvertir } from '../zoneHorsBackend';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const THIS_COMPUTER = {
  id: 1, name: 'This Computer', output_type: 'local', output_device_id: 'local:Haut-parleurs',
  online: true, state: 'stopped', volume: 0.3,
  backend_sortie: 'wasapi', hors_backend_choisi: true, pilote_local: 'wasapi',
};
const ASIO4ALL = {
  id: 5, name: 'ASIO4ALL v2', output_type: 'local', output_device_id: 'local:ASIO4ALL v2',
  online: true, state: 'stopped', volume: 0.3,
  backend_sortie: 'asio', hors_backend_choisi: false, pilote_local: 'asio',
};
const DENAFRIPS = { device_id: 'local:DENAFRIPS USB DAC', name: 'DENAFRIPS USB DAC', backend: 'asio' };

describe('#7806 — le badge du pilote', () => {
  let monte: ReturnType<typeof mount> | null = null;
  afterEach(() => { if (monte) unmount(monte); monte = null; document.body.innerHTML = ''; });
  function rendre(zone: Record<string, unknown>): HTMLElement {
    locale.set('fr');
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    monte = mount(BadgeHorsBackend, { target: cible, props: { zone: zone as any } });
    flushSync();
    return cible;
  }

  it('🔴 la zone ASIO dans le backend choisi porte « ASIO »', () => {
    const cible = rendre(ASIO4ALL);
    expect(cible.querySelector('[data-pilote-local]')?.textContent).toBe('ASIO');
    expect(cible.querySelector('[data-hors-backend]')).toBeNull();
  });

  it('🔴 « This Computer » en WASAPI sous ASIO : UNE pastille « WASAPI », avec la note', () => {
    const cible = rendre(THIS_COMPUTER);
    expect(cible.querySelector('[data-hors-backend]')?.textContent).toBe('WASAPI');
    expect(cible.querySelector('[data-pilote-local]')).toBeNull();
    expect(cible.textContent).toContain('utilisez la zone ASIO');
  });

  it('WASAPI choisi, zone WASAPI : « WASAPI », sans alerte', () => {
    const cible = rendre({ ...THIS_COMPUTER, hors_backend_choisi: false });
    expect(cible.querySelector('[data-pilote-local]')?.textContent).toBe('WASAPI');
    expect(cible.textContent).not.toContain('utilisez la zone ASIO');
  });

  it('hors Windows ou serveur antérieur (pas de `pilote_local`) : rien de nouveau', () => {
    const { pilote_local: _p, ...ancien } = ASIO4ALL;
    expect(rendre(ancien).querySelector('[data-pilote-local]')).toBeNull();
    expect(piloteDeLaZone({})).toBeNull();
    expect(piloteDeLaZone({ pilote_local: 'coreaudio' })).toBeNull();
    expect(piloteDeLaZone({ pilote_local: ' ASIO ' })).toBe('ASIO');
  });

  it('le sélecteur de zones et la fiche de réglages portent le badge', () => {
    const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8').replace(/<!--[\s\S]*?-->/g, '');
    expect(lire('src/components/partages/TransportBar.svelte')).toMatch(/data-pilote-local[^>]*>\{piloteDeLaZone\(z\)\}/);
    expect(lire('src/components/v2/SettingsV2.svelte')).toContain('<BadgeHorsBackend zone={z} />');
  });

  it('les trois libellés existent dans les quinze langues', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      expect(d['v2.zone.piloteLocal'], code).toBeTruthy();
      expect(d['v2.zone.asioSansZone'], code).toContain('{name}');
      expect(d['v2.zone.asioSansZone'], code).toContain('ASIO');
      expect(d['v2.zone.creerZoneAsio'], code).toContain('ASIO');
    }
  });
});

describe('#7806 — DAC ASIO sans zone, dans Destinations sonores', () => {
  it('la règle retire une sortie qu’une zone porte déjà', () => {
    expect(sortiesAsioAAvertir([DENAFRIPS], [THIS_COMPUTER, ASIO4ALL])).toEqual([DENAFRIPS]);
    expect(sortiesAsioAAvertir([DENAFRIPS], [{ output_device_id: DENAFRIPS.device_id }])).toEqual([]);
    expect(sortiesAsioAAvertir(null, [])).toEqual([]);
  });

  let hote: HTMLDivElement;
  let composant: ReturnType<typeof mount> | undefined;
  let serveur: any[];
  let sansZone: any[];
  let statutSansZone: number;
  let creations: any[];
  async function stabiliser() {
    for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
  }
  beforeEach(() => {
    locale.set('fr'); zones.set([]); currentZoneId.set(null);
    serveur = [THIS_COMPUTER, ASIO4ALL]; sansZone = [DENAFRIPS]; statutSansZone = 200; creations = [];
    // La liste des zones arrive par le magasin (chargée par l'application).
    zones.set(serveur as any);
    hote = document.createElement('div'); document.body.appendChild(hote);
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const chemin = new URL(String(url), window.location.href).pathname;
      const methode = init?.method ?? 'GET';
      let corps: unknown = {};
      let status = 200;
      if (chemin === '/api/v1/zones' && methode === 'POST') {
        const requete = JSON.parse(String(init?.body)); creations.push(requete);
        corps = { ...requete, id: 9, online: true, state: 'stopped', volume: 0.3, pilote_local: 'asio' };
        serveur = [...serveur, corps]; sansZone = [];
      } else if (chemin === '/api/v1/zones') corps = serveur;
      else if (chemin === '/api/v1/zones/asio-sans-zone') {
        status = statutSansZone;
        corps = status === 200 ? { sorties: sansZone } : { error: 'not_found' };
      } else if (chemin === '/api/v1/system/diagnostics') corps = { zones_doublons: [] };
      else if (/\/(outputs|stereo-pairs|group-delays|groups)$|\/devices(\/all|\/audio)?$/.test(chemin)) corps = [];
      return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
    }));
  });
  afterEach(async () => {
    if (composant) await unmount(composant);
    composant = undefined; hote.remove(); zones.set([]); currentZoneId.set(null); vi.unstubAllGlobals();
  });

  it('🔴 l’avertissement nomme le Denafrips, et « Créer la zone ASIO » crée sa zone', async () => {
    composant = mount(ZonesV2, { target: hote }); flushSync(); await stabiliser();
    const bandeau = hote.querySelector<HTMLElement>(`[data-asio-sans-zone="${DENAFRIPS.device_id}"]`);
    expect(bandeau, hote.innerHTML.slice(0, 400)).toBeTruthy();
    expect(bandeau!.textContent).toContain('DENAFRIPS USB DAC');
    expect(bandeau!.textContent).toContain('WASAPI');
    const bouton = bandeau!.querySelector<HTMLButtonElement>('button')!;
    expect(bouton.textContent).toContain('Créer la zone ASIO');
    bouton.click(); await stabiliser();
    expect(creations).toEqual([{ name: 'DENAFRIPS USB DAC', output_type: 'local', output_device_id: DENAFRIPS.device_id }]);
    expect(get(zones).some((z) => z.output_device_id === DENAFRIPS.device_id)).toBe(true);
    expect(hote.querySelector('[data-asio-sans-zone]'), 'la zone existe : l’avertissement se tait').toBeNull();
  });

  it('serveur antérieur (404) : aucun avertissement, l’écran s’affiche', async () => {
    statutSansZone = 404;
    composant = mount(ZonesV2, { target: hote }); flushSync(); await stabiliser();
    expect(hote.querySelector('[data-asio-sans-zone]')).toBeNull();
    expect(hote.textContent).toContain('This Computer');
  });
});
