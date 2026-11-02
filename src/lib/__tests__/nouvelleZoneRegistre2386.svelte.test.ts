// @vitest-environment jsdom
// #2386 : choisir réellement la sortie du registre puis créer sa zone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';

const ID_ASIO = 'local:USB DAC ASIO';
const registre = [
  { id: ID_ASIO, name: 'USB DAC ASIO', type: 'local', available: true, host: '', port: 0 },
  { id: 'local:absent', name: 'Pilote absent', type: 'local', available: false, host: '', port: 0 },
];
const cas = [
  { nom: 'registre seul, liste audio vide', audio: [], statut: 200 },
  { nom: 'registre seul, route audio absente', audio: [], statut: 404 },
  { nom: 'même identité dans les deux listes, une seule option',
    audio: [{ id: ID_ASIO, name: 'USB DAC ASIO', max_channels: 2 }], statut: 200 },
];
let scenario: (typeof cas)[number];
let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
let serveur: any[];
let creations: any[];
let lectures: string[];
async function stabiliser() {
  for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

beforeEach(() => {
  locale.set('fr'); zones.set([]); currentZoneId.set(null);
  for (const n of get(notifications)) notifications.dismiss(n.id);
  serveur = []; creations = []; lectures = [];
  hote = document.createElement('div'); document.body.appendChild(hote);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const chemin = new URL(String(url), window.location.href).pathname;
    const methode = init?.method ?? 'GET';
    let corps: unknown = {};
    let status = 200;
    if (chemin === '/api/v1/zones' && methode === 'POST') {
      const requete = JSON.parse(String(init?.body)); creations.push(requete);
      corps = { ...requete, id: 9, online: true, state: 'stopped', volume: 0.35 };
      serveur = [corps];
    } else if (chemin === '/api/v1/zones') corps = serveur;
    else if (chemin === '/api/v1/devices/audio') {
      status = scenario.statut; corps = status === 200 ? scenario.audio : { error: 'not_found' };
      lectures.push(chemin);
    } else if (chemin === '/api/v1/devices') { corps = registre; lectures.push(chemin); }
    else if (chemin === '/api/v1/system/diagnostics') corps = { zones_doublons: [] };
    else if (/\/(outputs|stereo-pairs|group-delays|groups)$|\/devices\/all$/.test(chemin)) corps = [];
    return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); zones.set([]); currentZoneId.set(null); vi.unstubAllGlobals();
});

describe('#2386 — formulaire Nouvelle zone monté', () => {
  it.each(cas)('$nom', async (exemple) => {
    scenario = exemple;
    composant = mount(ZonesV2, { target: hote }); flushSync(); await stabiliser();
    const ouvrir = [...hote.querySelectorAll<HTMLButtonElement>('header button')]
      .find((b) => b.textContent?.includes('Nouvelle zone'));
    expect(ouvrir, 'le véritable écran doit proposer la création').toBeTruthy();
    ouvrir!.click(); flushSync(); await stabiliser();
    expect(lectures).toContain('/api/v1/devices/audio'); expect(lectures).toContain('/api/v1/devices');
    const formulaire = hote.querySelector<HTMLElement>('.newz')!;
    const choix = formulaire.querySelector<HTMLSelectElement>('select')!;
    const options = [...choix.options].filter((o) => o.value === `local|${ID_ASIO}`);
    expect(options, 'la sortie locale du registre doit être sélectionnable une seule fois').toHaveLength(1);
    expect(options[0].textContent).toBe('USB DAC ASIO');
    expect([...choix.options].some((o) => o.textContent?.includes('Pilote absent'))).toBe(false);
    const creer = formulaire.querySelector<HTMLButtonElement>('button.primaire')!;
    expect(creer.disabled).toBe(true); expect(creations).toEqual([]);
    choix.value = options[0].value; choix.dispatchEvent(new Event('change', { bubbles: true }));
    const nom = formulaire.querySelector<HTMLInputElement>('input')!;
    nom.value = ' Bureau USB '; nom.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    expect(creer.disabled).toBe(false); creer.click(); await stabiliser();
    expect(creations).toEqual([{ name: 'Bureau USB', output_type: 'local', output_device_id: ID_ASIO }]);
    expect(get(zones)).toEqual([expect.objectContaining({ id: 9, name: 'Bureau USB', output_device_id: ID_ASIO })]);
    expect(hote.textContent).toContain('Bureau USB');
  });
});
