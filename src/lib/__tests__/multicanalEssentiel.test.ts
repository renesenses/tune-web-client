// @vitest-environment jsdom
//
// Multicanal en mode ESSENTIEL — décision de Bertrand du 23/09/2026 : « le
// choix de la disposition multicanal doit être visible en mode Essentiel ».
//
// Sur `main` (4a55356), le sélecteur de canaux n'existait qu'à un endroit :
// la carte de zone de « Réglages par zone », dans l'onglet Appareils — tous
// deux `min: 'intermediate'`. En Essentiel (le niveau par DÉFAUT, décision du
// 14/08), l'onglet entier était absent : un utilisateur en 5.1 qui n'avait
// jamais touché au niveau ne pouvait pas déclarer sa disposition.
//
// 🔴 Ce témoin MONTE l'écran au niveau débutant et regarde le DOM. Une garde
// de source sur la carte des réglages ne suffirait pas : la section peut
// être `beginner` et le sélecteur rester derrière une garde de niveau dans
// la carte de zone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    // Ce que l'écran interroge au montage : réponses inertes.
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { V2_SETTINGS } from '../v2Settings';
import { preferences } from '../stores/preferences';
import { zones } from '../stores/zones';
import type { SettingsLevel } from '../uiLevel';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
/** Ce que `GET /zones` rend : l'écran recharge la liste au montage, et une
 *  liste vide effacerait la zone posée dans le magasin. */
let zonesServeur: unknown[] = [];

const OFFERTES = [
  { id: 'stereo', canaux: 2 },
  { id: 'surround51', canaux: 6 },
  { id: 'surround714', canaux: 12 },
];

function statut(over: Record<string, unknown> = {}) {
  return { requested: null, effective: null, unavailable: false, reason: null, detail: null, ...over };
}

function zone(over: Record<string, unknown> = {}) {
  return {
    id: 21, name: 'Bureau', output_type: 'local', volume: 1, state: 'stopped',
    channel_layout: null, channel_layouts_offered: OFFERTES, channel_layout_status: statut(),
    ...over,
  };
}

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(z: Record<string, unknown>, niveau: SettingsLevel = 'beginner'): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: niveau }));
  zonesServeur = [z];
  zones.set([z] as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabDevices'],
  );
  expect(onglet, `onglet Appareils introuvable au niveau ${niveau}`).toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  // Témoin : la carte de la zone est bien rendue, sinon « absent » ne prouve rien.
  expect(hote.querySelector('#zc-21'), 'carte de zone absente — témoin sans objet').not.toBeNull();
  return hote;
}

const selecteur = (h: HTMLElement) => h.querySelector<HTMLSelectElement>('#zc-21 .canaux select');
const ligneEffective = (h: HTMLElement) => h.querySelector<HTMLElement>('#zc-21 .canaux-effectif');

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      const corps = JSON.parse(String(init.body ?? '{}'));
      return new Response(JSON.stringify({ ...zone(), ...corps }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const u = String(url);
    const corps = /\/zones(\?|$)/.test(u) ? zonesServeur
      : /\/(profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  vi.unstubAllGlobals();
});

describe('la carte des réglages — le multicanal est atteignable en Essentiel', () => {
  /** La carte est la SOURCE UNIQUE : l'écran et la recherche du menu avatar
   *  la lisent tous les deux. */
  it('l’onglet Appareils et « Réglages par zone » sont au niveau débutant', () => {
    const onglet = V2_SETTINGS.find((t) => t.id === 'devices');
    expect(onglet, 'onglet Appareils introuvable').toBeDefined();
    expect(onglet!.min, 'l’onglet reste masqué au niveau par défaut').toBe('beginner');
    const section = onglet!.sections.find((s) => s.id === 'perZone');
    expect(section, 'section perZone absente de la carte').toBeDefined();
    expect(section!.min, 'la section reste masquée au niveau par défaut').toBe('beginner');
  });

  it('🔴 au plus juste : les deux autres sections de l’onglet ne descendent PAS', () => {
    // Le compteur d'appareils et la sauvegarde des réglages n'ont rien à
    // faire en Essentiel ; c'est le sélecteur de canaux que Bertrand veut
    // voir, pas l'onglet entier.
    const onglet = V2_SETTINGS.find((t) => t.id === 'devices')!;
    for (const id of ['devices', 'sauvegardeReglages']) {
      expect(onglet.sections.find((s) => s.id === id)?.min, id).toBe('intermediate');
    }
  });
});

describe('l’écran Réglages au niveau DÉBUTANT — le sélecteur est là', () => {
  it('propose ce que le serveur offre, précédé de « Suivre l’appareil »', { timeout: 60_000 }, async () => {
    const h = await poser(zone());
    const sel = selecteur(h);
    expect(sel, 'aucun sélecteur de canaux au niveau débutant').not.toBeNull();
    expect(sel!.disabled).toBe(false);
    const options = [...sel!.options].map((o) => [o.value, o.textContent?.trim()]);
    expect(options).toEqual([
      ['', fr['zoneConfig.channelsFollow']],
      ['stereo', 'Stéréo'],
      ['surround51', '5.1'],
      ['surround714', '7.1.4 (Atmos)'],
    ]);
  });

  it('🔴 les réglages réservés restent masqués : DSD, débit, gain, volume fixe', { timeout: 60_000 }, async () => {
    // L'écran actuel range DSD et débit maximal en `expert`, volume fixe et
    // paroles en `intermediate` (`lib/settingLevels`). Descendre la section
    // ne doit pas les offrir à un débutant.
    const h = await poser(zone());
    const carte = h.querySelector('#zc-21')!;
    expect(carte.querySelector('.zr'), 'la rangée DSD/débit/paroles/volume est rendue').toBeNull();
    expect(carte.querySelector('.trim'), 'le gain est rendu').toBeNull();
    expect(carte.querySelector('.zde'), 'l’éditeur d’appareil est rendu').toBeNull();
    expect(carte.textContent).not.toContain('DSD');
  });

  it('contre-témoin : au niveau Avancé, la rangée DSD/débit revient et le sélecteur reste', { timeout: 60_000 }, async () => {
    const h = await poser(zone(), 'intermediate');
    const carte = h.querySelector('#zc-21')!;
    expect(carte.querySelector('.zr')).not.toBeNull();
    expect(carte.querySelector('.trim')).not.toBeNull();
    expect(selecteur(h)).not.toBeNull();
  });

  it('`unavailable` ⇒ sélecteur désactivé et motif traduit', { timeout: 60_000 }, async () => {
    const h = await poser(zone({
      output_type: 'dlna',
      channel_layout_status: statut({ unavailable: true, reason: 'sortie_non_locale', detail: 'cette zone ne sort pas par une carte son locale' }),
    }));
    expect(selecteur(h)!.disabled).toBe(true);
    expect(h.querySelector('#zc-21')!.textContent).toContain(fr['zoneConfig.channelsUnavailableNonLocal']);
  });
});

describe('« Sortie réelle » — ce que la zone sort vraiment', () => {
  it('`effective` différent du choix ⇒ la ligne est rendue, libellée comme le sélecteur', { timeout: 60_000 }, async () => {
    const h = await poser(zone({
      channel_layout: 'surround714',
      channel_layout_status: statut({ requested: 'surround714', effective: 'surround51' }),
    }));
    const ligne = ligneEffective(h);
    expect(ligne, 'aucune ligne « Sortie réelle »').not.toBeNull();
    expect(ligne!.textContent).toBe(fr['zoneConfig.channelsEffective'].replace('{layout}', '5.1'));
    expect(ligne!.textContent).toBe('Sortie réelle : 5.1');
  });

  it('« Suivre l’appareil » (aucun choix) et une sortie connue ⇒ rendue aussi', { timeout: 60_000 }, async () => {
    // C'est le cas du débutant : il n'a rien choisi, et c'est précisément là
    // qu'il veut savoir ce que l'appareil a tranché.
    const h = await poser(zone({
      channel_layout: null,
      channel_layout_status: statut({ effective: 'stereo' }),
    }));
    expect(ligneEffective(h)?.textContent).toBe('Sortie réelle : Stéréo');
  });

  it('identique au choix ⇒ absente', { timeout: 60_000 }, async () => {
    const h = await poser(zone({
      channel_layout: 'surround51',
      channel_layout_status: statut({ requested: 'surround51', effective: 'surround51' }),
    }));
    expect(selecteur(h), 'témoin : le sélecteur est là').not.toBeNull();
    expect(ligneEffective(h)).toBeNull();
  });

  it('`effective` absent (null, ou vieux serveur sans statut) ⇒ absente', { timeout: 60_000 }, async () => {
    const h1 = await poser(zone({ channel_layout: 'surround51', channel_layout_status: statut({ effective: null }) }));
    expect(ligneEffective(h1)).toBeNull();
    unmount(monte!); monte = null; hote?.remove(); hote = null;
    const h2 = await poser(zone({ channel_layout: 'surround51', channel_layout_status: undefined }));
    expect(selecteur(h2)).not.toBeNull();
    expect(ligneEffective(h2)).toBeNull();
  });

  it('id inconnu (serveur plus récent) ⇒ l’id brut, jamais la clé i18n', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ channel_layout_status: statut({ effective: 'quad' }) }));
    const texte = ligneEffective(h)?.textContent ?? '';
    expect(texte).toBe('Sortie réelle : quad');
    expect(texte).not.toContain('zoneConfig.');
  });
});

describe('la clé dans les ONZE langues', () => {
  // Les dictionnaires viennent de `onzeDictionnaires` (chargés à la
  // collecte) : un `import()` dynamique par langue est ce que #1308 interdit.
  for (const l of ONZE_LANGUES) {
    it(l, () => {
      const dict = dictionnaire(l);
      expect(dict['zoneConfig.channelsEffective'], `${l} : clé absente`).toBeTruthy();
      expect(dict['zoneConfig.channelsEffective'], `${l} : gabarit sans {layout}`).toContain('{layout}');
    });
  }
});
