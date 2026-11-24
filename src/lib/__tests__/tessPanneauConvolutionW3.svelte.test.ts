// @vitest-environment jsdom
//
// Lot TESS W3 — panneau « Convolution » de l'écran TESS (maquette A1,
// colonne de droite) :
//   1. le tableau « Filters in this set » se dessine depuis `GET ir/status` ;
//      « In use — matches the source » sur la BONNE ligne, « — » ailleurs ;
//   2. un repli rééchantillonné le dit, avec les deux cadences ;
//   3. « Resample the nearest filter » écrit `POST ir/options` ;
//   4. « Browse… » d'un .zip comme d'un .wav seul part en
//      `upload?archive=1&name=…` (T09a), sans aucun `clear` ; la zone est
//      figée au geste (changement de zone pendant un dépôt) ;
//   5. un refus `archive_refused` s'affiche TRADUIT selon sa raison (repli
//      générique pour une raison inconnue), jamais le corps brut ; un 402
//      donne la phrase Premium du client ;
//   6. l'écran TESS monte ce panneau pour `convolution`, et seulement lui ;
//   7. les clés existent dans les 20 langues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({ fetchJSON: vi.fn() }));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import PanneauConvolution from '../../components/v2/tess/PanneauConvolution.svelte';
import ReglagesGreffonTess from '../../components/v2/tess/ReglagesGreffonTess.svelte';
import { locale } from '../i18n';
import { messageRefusPremium } from '../premiumRefus';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const en = dictionnaire('en');
const ZONE = 7;

const JEU_A1 = {
  active: true,
  zone_id: ZONE,
  ir_path: '/d/ir/zone_7.wav',
  set_name: 'living-room.zip',
  resample: true,
  files: [
    { path: '/d/ir/room_44k.wav', sample_rate: 44100, channels: 2, taps: 65536, main: true },
    { path: '/d/ir/room_48k.wav', sample_rate: 48000, channels: 2, taps: 65536 },
    { path: '/d/ir/room_96k.wav', sample_rate: 96000, channels: 2, taps: 131072 },
  ],
  in_use: {
    stream_sample_rate: 96000, file_sample_rate: 96000, path: '/d/ir/room_96k.wav',
    resampled: false, reason: 'exact', description: '96 kHz',
  },
};

let hote: HTMLElement;
let composant: Record<string, any> | null = null;
let statut: any;
let fetchNu: ReturnType<typeof vi.fn>;

function reponse(status: number, corps: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => corps } as unknown as Response;
}

async function attendre() {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function monter(s: any) {
  statut = s;
  composant = mount(PanneauConvolution, { target: hote, props: { zoneId: ZONE } });
  await attendre();
}

const un = (sel: string) => hote.querySelector(sel);
const lignes = () => [...hote.querySelectorAll('[data-conv-filtres] tbody tr')] as HTMLElement[];
const cellules = (tr: HTMLElement) => [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim());

async function deposer(nom: string, octets: number[]) {
  const input = un('[data-conv-parcourir]') as HTMLInputElement;
  const fichier = { name: nom, size: octets.length, arrayBuffer: async () => new Uint8Array(octets).buffer };
  Object.defineProperty(input, 'files', { configurable: true, value: [fichier] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await attendre();
}

beforeEach(() => {
  locale.set('en');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  mocks.fetchJSON.mockReset();
  mocks.fetchJSON.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes('/room-correction/ir/status/')) return statut;
    if (url.includes('/room-correction/ir/options/')) {
      const voulu = JSON.parse(String(init?.body)).resample;
      statut = { ...statut, resample: voulu };
      return { ok: true, zone_id: ZONE, resample: voulu, warning: null };
    }
    throw new Error('route inattendue ' + url);
  });
  fetchNu = vi.fn(async () => reponse(200, { ok: true }));
  vi.stubGlobal('fetch', fetchNu);
});
afterEach(() => {
  if (composant) unmount(composant);
  composant = null;
  hote.remove();
  vi.unstubAllGlobals();
});

describe('W3 — tableau des filtres et filtre en usage', () => {
  it('dessine le jeu de la maquette A1 et marque la ligne employée', async () => {
    await monter(JEU_A1);
    expect(un('[data-conv-jeu]')?.textContent?.trim()).toBe('living-room.zip');
    const l = lignes();
    expect(l.map(cellules)).toEqual([
      ['room_44k.wav', '44.1 kHz', en['tess.conv.stereo'], '—'],
      ['room_48k.wav', '48 kHz', en['tess.conv.stereo'], '—'],
      ['room_96k.wav', '96 kHz', en['tess.conv.stereo'], 'In use — matches the source'],
    ]);
    expect(l.map((tr) => tr.dataset.convUsage)).toEqual(['non', 'non', 'oui']);
    expect(l[2].classList.contains('usage')).toBe(true);
    expect((un('[data-conv-repli]') as HTMLInputElement).checked).toBe(true);
  });

  it('dit le repli rééchantillonné, de 48 kHz à 96 kHz', async () => {
    await monter({
      ...JEU_A1,
      files: [JEU_A1.files[0], JEU_A1.files[1]],
      in_use: { stream_sample_rate: 96000, file_sample_rate: 48000, path: '/d/ir/room_48k.wav', resampled: true, reason: 'same_family' },
    });
    const l = lignes();
    expect(cellules(l[1])[3]).toBe('In use — resampled from 48 kHz to 96 kHz');
    expect(cellules(l[0])[3]).toBe('—');
  });

  it('sans `in_use.path` (serveur plus ancien) : la ligne se trouve par sa cadence', async () => {
    await monter({ ...JEU_A1, set_name: undefined, in_use: { stream_sample_rate: 44100, file_sample_rate: 44100, resampled: false } });
    expect(lignes().map((tr) => tr.dataset.convUsage)).toEqual(['oui', 'non', 'non']);
    // Sans `set_name` (serveur d'avant T09a) : le nom du fichier principal.
    expect(un('[data-conv-jeu]')?.textContent?.trim()).toBe('room_44k.wav');
  });

  it('sans filtre : « No filter loaded », pas de tableau', async () => {
    await monter({ active: false, zone_id: ZONE, ir_path: null, files: [], resample: true, in_use: null });
    expect(un('[data-conv-jeu]')?.textContent?.trim()).toBe(en['tess.conv.noFilterSet']);
    expect(un('[data-conv-filtres]')).toBeNull();
  });
});

describe('W3 — gestes', () => {
  it('« Resample the nearest filter » écrit POST ir/options', async () => {
    await monter(JEU_A1);
    const c = un('[data-conv-repli]') as HTMLInputElement;
    c.checked = false;
    c.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre();
    const appel = mocks.fetchJSON.mock.calls.find(([u]) => String(u).includes('/room-correction/ir/options/7'));
    expect(appel).toBeTruthy();
    expect(appel![1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(appel![1].body))).toEqual({ resample: false });
    expect((un('[data-conv-repli]') as HTMLInputElement).checked).toBe(false);
  });

  it('un .zip part en upload?archive=1&name=… et le jeu se relit', async () => {
    await monter({ active: false, files: [], resample: true, in_use: null });
    fetchNu.mockImplementation(async () => {
      statut = JEU_A1;
      return reponse(200, {
        ok: true, zone_id: ZONE, set_name: 'living-room.zip', files: JEU_A1.files,
        imported: [{ name: 'room_44k.wav', sample_rate: 44100, channels: 2, source: 'wav' }],
        ignored: [{ name: 'readme.txt', reason: 'not_a_filter' }], active: true,
      });
    });
    await deposer('living-room.zip', [0x50, 0x4b, 0x03, 0x04, 0, 0]);
    expect(fetchNu).toHaveBeenCalledTimes(1);
    const [url, init] = fetchNu.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/room-correction\/ir\/upload\/7\?archive=1&name=living-room\.zip$/);
    expect(init.method).toBe('POST');
    expect(lignes()).toHaveLength(3);
    expect(un('[data-conv-message]')?.textContent?.trim()).toBe(
      en['tess.conv.loaded'].replace('{name}', 'living-room.zip') + ' ' + en['tess.conv.ignored'].replace('{names}', 'readme.txt'),
    );
  });

  it('un zip reconnu à sa signature, même sans extension', async () => {
    await monter(JEU_A1);
    await deposer('filtres', [0x50, 0x4b, 0x03, 0x04, 9]);
    expect(String(fetchNu.mock.calls[0][0])).toContain('?archive=1&name=filtres');
  });

  it('un .wav seul part aussi en upload?archive=1&name=… : un seul envoi, aucun clear', async () => {
    await monter(JEU_A1);
    await deposer('salon.wav', [0x52, 0x49, 0x46, 0x46]);
    const urls = fetchNu.mock.calls.map(([u]) => String(u));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/room-correction\/ir\/upload\/7\?archive=1&name=salon\.wav$/);
    expect(urls.some((u) => u.includes('/ir/clear/'))).toBe(false);
  });

  it('un .wav refusé (400 sans code) : « file could not be loaded », pas « serveur pas à jour »', async () => {
    await monter(JEU_A1);
    fetchNu.mockImplementation(async () => reponse(400, { error: 'not a RIFF/WAVE file' }));
    await deposer('salon.wav', [0x52, 0x49, 0x46, 0x46]);
    expect(un('[data-conv-message]')?.textContent?.trim()).toBe(en['tess.conv.uploadError']);
  });
});

describe('W3 — la zone est figée au geste', () => {
  async function monterReactif() {
    const props = $state({ zoneId: ZONE });
    composant = mount(PanneauConvolution, { target: hote, props });
    await attendre();
    return props;
  }
  const JEU_ZONE_8 = { ...JEU_A1, zone_id: 8, set_name: 'bureau.zip', files: [JEU_A1.files[0]] };

  it('zone changée PENDANT l’envoi : rien n’est relu ni affiché pour l’autre zone', async () => {
    statut = JEU_A1;
    const props = await monterReactif();
    let liberer!: (r: Response) => void;
    fetchNu.mockImplementation(() => new Promise<Response>((r) => { liberer = r; }));
    await deposer('living-room.zip', [0x50, 0x4b, 0x03, 0x04]);
    expect(String(fetchNu.mock.calls[0][0])).toContain('/ir/upload/7?');
    // L'écran passe sur la zone 8 pendant que le dépôt de la zone 7 est en vol.
    statut = JEU_ZONE_8;
    props.zoneId = 8;
    await attendre();
    const lecturesAvant = mocks.fetchJSON.mock.calls.length;
    liberer(reponse(200, { ok: true, zone_id: ZONE, set_name: 'living-room.zip', files: JEU_A1.files, active: true }));
    await attendre();
    // Aucune relecture après coup, aucun message de la zone 7 sur l'écran de la zone 8.
    expect(mocks.fetchJSON.mock.calls.length).toBe(lecturesAvant);
    expect(un('[data-conv-message]')).toBeNull();
    expect(un('[data-conv-jeu]')?.textContent?.trim()).toBe('bureau.zip');
    expect(fetchNu).toHaveBeenCalledTimes(1);
  });

  it('zone changée PENDANT la lecture du fichier : rien n’est envoyé', async () => {
    statut = JEU_A1;
    const props = await monterReactif();
    let lu!: (b: ArrayBuffer) => void;
    const input = un('[data-conv-parcourir]') as HTMLInputElement;
    const fichier = { name: 'salon.wav', size: 4, arrayBuffer: () => new Promise<ArrayBuffer>((r) => { lu = r; }) };
    Object.defineProperty(input, 'files', { configurable: true, value: [fichier] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre();
    statut = JEU_ZONE_8;
    props.zoneId = 8;
    await attendre();
    lu(new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer);
    await attendre();
    expect(fetchNu).not.toHaveBeenCalled();
  });
});

describe('W3 — refus affichés proprement', () => {
  const refus = (reason: string) => ({
    error: 'archive refused: ' + reason, code: 'archive_refused', reason,
    message_key: `api.roomCorrection.archive.${reason}`,
  });

  it.each(['symlink', 'unsafe_path', 'compression_ratio', 'too_large', 'matrix_routing'])(
    'archive_refused/%s : la phrase traduite de la raison', async (raison) => {
      await monter(JEU_A1);
      fetchNu.mockImplementation(async () => reponse(400, refus(raison)));
      await deposer('piege.zip', [0x50, 0x4b, 0x03, 0x04]);
      const m = un('[data-conv-message]');
      expect(m?.getAttribute('role')).toBe('alert');
      expect(m?.textContent?.trim()).toBe(en[`tess.conv.archive.${raison}`]);
      expect(m?.textContent).not.toContain('archive_refused');
      expect(m?.textContent).not.toContain('{');
      // Le jeu affiché n'a pas bougé.
      expect(lignes()).toHaveLength(3);
    });

  it('raison inconnue : le repli générique, en français aussi', async () => {
    locale.set('fr');
    await monter(JEU_A1);
    fetchNu.mockImplementation(async () => reponse(400, refus('raison_future')));
    await deposer('piege.zip', [0x50, 0x4b, 0x03, 0x04]);
    expect(un('[data-conv-message]')?.textContent?.trim()).toBe(dictionnaire('fr')['tess.conv.archive.generic']);
  });

  it("serveur d'avant l'import d'archives : il le dit, sans le texte du serveur", async () => {
    await monter(JEU_A1);
    fetchNu.mockImplementation(async () => reponse(400, { error: 'not a RIFF/WAVE file' }));
    await deposer('jeu.zip', [0x50, 0x4b, 0x03, 0x04]);
    expect(un('[data-conv-message]')?.textContent?.trim()).toBe(en['tess.conv.archiveUnsupported']);
  });

  it('402 : la phrase Premium du client', async () => {
    await monter(JEU_A1);
    const corps = { error: 'premium_required', code: 'room_correction', message: '« Room Correction » nécessite Tune Premium.' };
    fetchNu.mockImplementation(async () => reponse(402, corps));
    await deposer('jeu.zip', [0x50, 0x4b, 0x03, 0x04]);
    const texte = un('[data-conv-message]')?.textContent?.trim();
    expect(texte).toBe(messageRefusPremium(corps));
    expect(texte).not.toContain('nécessite');
  });
});

describe('W3 — branchement dans l’écran TESS', () => {
  function monterReglages(id: string) {
    composant = mount(ReglagesGreffonTess, {
      target: hote,
      props: { lien: { id, enabled: true, settings: null }, nom: id, zoneId: ZONE, onToggle: () => {}, onRemove: () => {} },
    });
  }

  it('convolution : le panneau, sous l’en-tête commun (« × Remove plugin » compris)', async () => {
    statut = JEU_A1;
    monterReglages('convolution');
    await attendre();
    expect(un('[data-conv-filtres]')).toBeTruthy();
    expect(hote.textContent).not.toContain(en['tess.pluginSettingsSoon']);
    expect(un('.retirer')?.textContent).toContain(en['tess.removePlugin']);
  });

  it('un autre greffon garde l’emplacement d’attente', async () => {
    monterReglages('crossfeed');
    await attendre();
    expect(un('[data-conv-filtres]')).toBeNull();
    expect(hote.textContent).toContain(en['tess.pluginSettingsSoon']);
    expect(mocks.fetchJSON).not.toHaveBeenCalled();
  });
});

describe('W3 — traductions', () => {
  it('chaque clé tess.conv.* existe et est non vide dans les 20 langues', () => {
    const cles = Object.keys(en).filter((k) => k.startsWith('tess.conv.'));
    expect(cles.length).toBe(37);
    expect(ONZE_LANGUES).toHaveLength(20);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of cles) expect(d[k], `${l} ${k}`).toBeTruthy();
    }
  });
});
