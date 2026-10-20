// @vitest-environment jsdom
/**
 * #2244 (serveur : tune-server-rust#6546) — Réglages › Zones, « Plages MAC
 * des appareils ».
 *
 * 1. Chaque appareil montre la plage reconnue (`AA:BB:CC:xx:xx:xx`) et sa
 *    marque, jamais la MAC complète ; plage hors table et MAC inconnue se
 *    disent.
 * 2. La table entière se déplie, groupée par marque, avec le nombre de plages
 *    et une recherche par marque ou par préfixe.
 * 3. Serveur ancien (champs absents, route en 404) : rien ne casse, rien ne
 *    s'affiche de plus, le bloc de la table est masqué.
 *
 * Les bancs du haut lisent les fonctions pures ; ceux du bas montent le vrai
 * composant et cliquent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import PlagesMacV2 from '../../components/v2/PlagesMacV2.svelte';
import { etatPlage, filtrerTable, lireTableOui, plageAffichee, type TableOuiAudio } from '../plagesMac';
import { V2_SETTINGS } from '../v2Settings';
import { locale } from '../i18n';

const TABLE: TableOuiAudio = {
  vendors: [
    { name: 'Denon / Marantz', prefixes: ['00:05:CD', '00:06:78'] },
    { name: 'Lumin', prefixes: ['00:08:62'] },
    { name: 'Sonos', prefixes: ['00:04:3C', '00:0E:58', '5C:AA:FD'] },
  ],
  total: 6,
};

describe('plagesMac : les trois états d’un appareil', () => {
  it('plage reconnue → plage et marque', () => {
    expect(etatPlage({ mac_prefix: '00:0E:58', mac_vendor: 'Sonos' }))
      .toEqual({ etat: 'connue', plage: '00:0E:58', marque: 'Sonos' });
  });
  it('plage hors table → la plage seule', () => {
    expect(etatPlage({ mac_prefix: '02:00:00', mac_vendor: null }))
      .toEqual({ etat: 'hors-table', plage: '02:00:00' });
  });
  it('pas de MAC → sans-mac', () => {
    expect(etatPlage({ mac_prefix: null, mac_vendor: null })).toEqual({ etat: 'sans-mac' });
  });
  it('serveur ancien (clé absente) → null, et non « MAC inconnue »', () => {
    expect(etatPlage({})).toBeNull();
    expect(etatPlage({ mac_vendor: 'Sonos' } as never)).toBeNull();
  });
  it('la plage s’affiche masquée sur ses trois derniers octets', () => {
    expect(plageAffichee('70:b3:d5')).toBe('70:B3:D5:xx:xx:xx');
  });
});

describe('plagesMac : la table et sa recherche', () => {
  it('lireTableOui refuse ce qui n’a pas la forme de la route', () => {
    expect(lireTableOui(null)).toBeNull();
    expect(lireTableOui({ error: 'not found' })).toBeNull();
    expect(lireTableOui({ vendors: [] })).toBeNull();
    expect(lireTableOui(TABLE)).toEqual(TABLE);
  });
  it('recherche vide → la table entière', () => {
    expect(filtrerTable(TABLE, '  ')).toEqual(TABLE.vendors);
  });
  it('par marque, sans casse : la marque entière', () => {
    expect(filtrerTable(TABLE, 'marantz')).toEqual([TABLE.vendors[0]]);
  });
  it('par préfixe, quelle que soit la graphie : seules les plages qui commencent ainsi', () => {
    expect(filtrerTable(TABLE, '00:0e')).toEqual([{ name: 'Sonos', prefixes: ['00:0E:58'] }]);
    expect(filtrerTable(TABLE, '000562')).toEqual([]);
    expect(filtrerTable(TABLE, '00-08-62')).toEqual([{ name: 'Lumin', prefixes: ['00:08:62'] }]);
  });
  it('une MAC complète collée retrouve sa plage', () => {
    expect(filtrerTable(TABLE, '5c:aa:fd:12:34:56')).toEqual([{ name: 'Sonos', prefixes: ['5C:AA:FD'] }]);
  });
  it('« 00 » retient toutes les plages qui commencent par 00, sous leur marque', () => {
    const r = filtrerTable(TABLE, '00');
    expect(r.map((v) => v.name)).toEqual(['Denon / Marantz', 'Lumin', 'Sonos']);
    expect(r[2].prefixes).toEqual(['00:04:3C', '00:0E:58']);
  });
});

describe('Réglages › Zones porte la section', () => {
  it('la section macRanges est dans l’onglet Zones', () => {
    const zones = V2_SETTINGS.find((o) => o.id === 'zones')!;
    expect(zones.sections.map((s) => s.id)).toContain('macRanges');
  });
});

// ── Le composant monté ─────────────────────────────────────────────────────

function reponse(corps: unknown, status = 200): Response {
  return {
    ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Not Found',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const hotes: HTMLElement[] = [];
const montes: ReturnType<typeof mount>[] = [];
function monter(props: Record<string, unknown>) {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(PlagesMacV2, { target: hote, props }));
  flushSync();
  return hote;
}
async function attendre() {
  for (let i = 0; i < 8; i++) { await Promise.resolve(); await tick(); }
  flushSync();
}

const APPAREILS_RECENTS = [
  { id: 'a', name: 'Salon', type: 'dlna', host: '192.168.1.10', port: 1400,
    mac_address: '00:0E:58:12:34:56', mac_prefix: '00:0E:58', mac_vendor: 'Sonos' },
  { id: 'b', name: 'Bureau', type: 'dlna', host: '192.168.1.11', port: 1400,
    mac_address: '02:00:00:AA:BB:CC', mac_prefix: '02:00:00', mac_vendor: null },
  { id: 'c', name: 'Cuisine', type: 'airplay', host: '192.168.1.12', port: 7000,
    mac_address: null, mac_prefix: null, mac_vendor: null },
];

let routeOui: () => Response;

beforeEach(() => {
  locale.set('fr');
  routeOui = () => reponse(TABLE);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).endsWith('/devices/oui-audio')) return routeOui();
    return reponse({});
  }));
});

afterEach(() => {
  while (montes.length) unmount(montes.pop()!);
  while (hotes.length) hotes.pop()!.remove();
  vi.unstubAllGlobals();
});

describe('PlagesMacV2 monté', () => {
  it('chaque appareil montre sa plage et sa marque, jamais sa MAC complète', async () => {
    const el = monter({ appareils: APPAREILS_RECENTS });
    await attendre();
    const lignes = [...el.querySelectorAll<HTMLElement>('.pm-dev')];
    expect(lignes.map((l) => l.dataset.etat)).toEqual(['connue', 'hors-table', 'sans-mac']);
    expect(lignes[0].textContent).toContain('00:0E:58:xx:xx:xx · Sonos');
    expect(lignes[1].textContent).toContain('02:00:00:xx:xx:xx · plage non répertoriée');
    expect(lignes[2].textContent).toContain('MAC inconnue');
    expect(el.textContent).not.toContain('12:34:56');
    expect(el.textContent).not.toContain('AA:BB:CC');
  });

  it('la table se déplie, compte les plages par marque et se filtre', async () => {
    const el = monter({ appareils: APPAREILS_RECENTS });
    await attendre();
    const bloc = el.querySelector<HTMLDetailsElement>('details[data-bloc="table-oui"]');
    expect(bloc, 'le bloc de la table manque alors que la route répond').not.toBeNull();
    expect(bloc!.querySelector('summary')!.textContent).toContain('Plages MAC reconnues');
    expect(bloc!.querySelector('summary')!.textContent).toContain('6 plages, 3 marques');
    const compte = (nom: string) =>
      bloc!.querySelector(`[data-marque="${nom}"] .pm-compte`)?.textContent?.trim();
    expect(compte('Sonos')).toBe('3 plages');
    expect(compte('Lumin')).toBe('1 plage');

    const champ = bloc!.querySelector<HTMLInputElement>('input.pm-recherche')!;
    champ.value = 'sonos';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect([...bloc!.querySelectorAll<HTMLElement>('.pm-marque')].map((m) => m.dataset.marque)).toEqual(['Sonos']);

    champ.value = '00:08';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect([...bloc!.querySelectorAll<HTMLElement>('.pm-marque')].map((m) => m.dataset.marque)).toEqual(['Lumin']);

    champ.value = 'zzz';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(bloc!.querySelectorAll('.pm-marque').length).toBe(0);
    expect(bloc!.textContent).toContain('Aucune plage ne correspond.');
  });

  it('serveur ancien : champs absents et route en 404 — rien ne casse, le bloc est masqué', async () => {
    routeOui = () => reponse({ error: 'not found' }, 404);
    const anciens = APPAREILS_RECENTS.map(({ mac_prefix: _p, mac_vendor: _v, ...reste }) => reste);
    const el = monter({ appareils: anciens });
    await attendre();
    expect(el.querySelectorAll('.pm-dev').length).toBe(0);
    expect(el.querySelector('details[data-bloc="table-oui"]')).toBeNull();
    expect(el.textContent).not.toContain('MAC inconnue');
  });

  it('les textes existent en vietnamien', async () => {
    locale.set('vi');
    const el = monter({ appareils: APPAREILS_RECENTS });
    await attendre();
    expect(el.querySelector('.pm-dev[data-etat="sans-mac"]')!.textContent).toContain('Không rõ MAC');
    expect(el.querySelector('summary')!.textContent).toContain('Các dải MAC được nhận diện');
  });
});
