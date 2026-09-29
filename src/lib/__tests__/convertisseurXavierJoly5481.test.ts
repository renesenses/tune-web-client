// @vitest-environment jsdom
/**
 * Convertisseur, trois nouveautés tirées du rapport de Xavier Joly (0.9.168) :
 *  - tune-server-rust#5481 : choisir la fréquence de sortie d'un Hi-Res, et
 *    dire celle qu'un DSD donnera vraiment ;
 *  - tune-server-rust#5482 : l'archive porte le nom de l'album ;
 *  - tune-server-rust#5483 : ne convertir que les pistes cochées.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ConverterV2 from '../../components/v2/ConverterV2.svelte';
import * as api from '../api';
import { albums } from '../stores/library';
import { activeView } from '../stores/navigation';
import { licenseState } from '../stores/license';
import { tachesConversion } from '../convertisseurTaches';
import { ligneFormat } from '../ligneFormatConvertisseur';
import { frequencesProposees, ligneFormatsEcrits, presetEffectif } from '../convertisseurFrequence';
import { nomDArchive } from '../convertisseurArchive';

vi.mock('../api', async (original) => ({
  ...await original<typeof import('../api')>(),
  getAllAlbums: vi.fn(), getAlbumTracks: vi.fn(), getConverterCapabilities: vi.fn(),
  getConverterPresets: vi.fn(), downloadConversion: vi.fn(), startConversion: vi.fn(),
  getConversionStatus: vi.fn(), listConversions: vi.fn(), cancelConversion: vi.fn(async () => ({ status: 'cancelled' })),
}));
vi.setConfig({ testTimeout: 10000 });

/** Les préréglages de `GET /converter/presets` à partir de #5481. */
const HIRES = {
  id: 'flac-hires', label: 'Hi-Res (FLAC 24-bit, original sample rate)', format: 'flac', quality: '5',
  sample_rate: null, bit_depth: 24, dsd_sample_rate: 176_400,
  sample_rate_choices: [88_200, 96_000, 176_400, 192_000, 352_800],
};
const CD = { id: 'flac-cd', label: 'CD Quality (FLAC 16/44.1)', format: 'flac', quality: '5', sample_rate: 44100, bit_depth: 16 };
const TEXTES = { originalRate: "fréquence d'origine", fromDsd: 'DSD → {rate}', bits: '{n} bits' };
const kHz = (n: number) => n.toLocaleString('fr');

describe('#5481 — la fréquence de sortie', () => {
  it('un préréglage à fréquence fixée ne propose rien ; Hi-Res propose les fréquences du serveur', () => {
    expect(frequencesProposees(CD)).toEqual([]);
    expect(frequencesProposees(HIRES)).toEqual([88_200, 96_000, 176_400, 192_000, 352_800]);
    // Serveur antérieur : pas de liste, pas de choix.
    expect(frequencesProposees({ ...HIRES, sample_rate_choices: undefined })).toEqual([]);
  });
  it('la fréquence choisie part dans la demande ; une fréquence non proposée est ignorée', () => {
    expect(presetEffectif(HIRES, 192_000).sample_rate).toBe(192_000);
    expect(presetEffectif(HIRES, null).sample_rate).toBeNull();
    expect(presetEffectif(CD, 192_000).sample_rate).toBe(44100);
  });
  it('la ligne dit la fréquence que le SERVEUR annonce pour un DSD, même en DSD128', () => {
    const dsd128 = { format: 'dsf', sample_rate: 5_644_800 };
    expect(ligneFormat(HIRES, [dsd128], TEXTES, kHz)).toBe('FLAC · DSD → 176,4 kHz · 24 bits');
    // Contre-épreuve : un serveur antérieur, qui ne l'annonce pas, garde
    // l'ancienne règle recopiée (352,8 kHz en DSD128).
    const { dsd_sample_rate: _, ...ancien } = HIRES;
    expect(ligneFormat(ancien, [dsd128], TEXTES, kHz)).toBe('FLAC · DSD → 352,8 kHz · 24 bits');
    // Une fréquence choisie s'affiche telle quelle.
    expect(ligneFormat(presetEffectif(HIRES, 192_000), [dsd128], TEXTES, kHz)).toBe('FLAC · 192 kHz · 24 bits');
  });
  it('ce qui a été écrit, relu par le serveur', () => {
    expect(ligneFormatsEcrits(null, [{ sample_rate: 176_400, bit_depth: 24 }], '{n} bits', kHz)).toBe('24 bits · 176,4 kHz');
    expect(ligneFormatsEcrits(null, [{ sample_rate: 44_100, bit_depth: null }], '{n} bits', kHz)).toBe('44,1 kHz');
    expect(ligneFormatsEcrits(null, undefined, '{n} bits', kHz)).toBe('');
  });
});

describe('#5482 — le nom de l’archive', () => {
  it('vient du statut, sans jamais de chemin', () => {
    expect(nomDArchive({ archive_name: 'Miles Davis - Miles Smiles (FLAC 24-176.4).zip' })).toBe('Miles Davis - Miles Smiles (FLAC 24-176.4).zip');
    expect(nomDArchive({ archive_name: '../../x.zip' })).toBe('x.zip');
    expect(nomDArchive({})).toBe('');
    expect(nomDArchive(null)).toBe('');
  });
});

let target: HTMLDivElement;
let instance: ReturnType<typeof mount> | undefined;
const wait = async (assertion: () => void) => vi.waitFor(() => { flushSync(); assertion(); }, { timeout: 3000 });
async function poser() { instance = mount(ConverterV2, { target }); flushSync(); }
async function retirer() { if (instance) await unmount(instance); instance = undefined; target.replaceChildren(); }
function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  (el as HTMLElement).click(); flushSync();
}
const album = { id: 12, title: 'Miles Smiles', artist_name: 'Miles Davis', source: 'local', format: 'dsf', sample_rate: 2_822_400 };
const PISTES = [
  { id: 101, title: 'Orbits', track_number: 1, disc_number: 1, file_path: '/m/Miles Smiles/CD1/01 - Orbits.dsf', source: 'local' },
  { id: 102, title: 'Circle', track_number: 2, disc_number: 1, file_path: '/m/Miles Smiles/CD1/02 - Circle.dsf', source: 'local' },
  { id: 103, title: 'Orbits (alt)', track_number: 1, disc_number: 2, file_path: '/m/Miles Smiles/CD2/01 - Orbits.dsf', source: 'local' },
];

describe('l’écran', () => {
  let statuts: Record<string, any>;
  beforeEach(() => {
    vi.clearAllMocks();
    tachesConversion.set([]);
    activeView.set('converter');
    albums.set([album as any]);
    licenseState.update((s) => ({ ...s, tier: 'premium' }));
    statuts = {};
    vi.mocked(api.getConverterCapabilities).mockResolvedValue({ formats: { flac: true }, tools: {} } as any);
    vi.mocked(api.getConverterPresets).mockResolvedValue([HIRES, CD] as any);
    vi.mocked(api.listConversions).mockResolvedValue([]);
    vi.mocked(api.getAlbumTracks).mockResolvedValue(PISTES as any);
    vi.mocked(api.getConversionStatus).mockImplementation(async (id: string) => statuts[id]);
    vi.mocked(api.downloadConversion).mockImplementation(async (id: string) => `blob:${id}`);
    vi.mocked(api.startConversion).mockResolvedValue({ job_id: 'j1', total_tracks: 2 });
    target = document.createElement('div'); document.body.appendChild(target);
  });
  afterEach(async () => { await retirer(); target.remove(); vi.restoreAllMocks(); });

  it('#5483 — déplier un album par disque, décocher une piste : seules les pistes cochées partent', async () => {
    await poser();
    await wait(() => expect(target.querySelector('.source-tracks')).not.toBeNull());
    click(target.querySelector('.card'));
    click(target.querySelector('.source-tracks'));
    await wait(() => expect(target.querySelectorAll('input[data-piste]').length).toBe(3));
    // Les dossiers de l'album, nommés par ce qui les distingue.
    expect([...target.querySelectorAll('.pistes .dl code')].map((c) => c.textContent)).toEqual(['CD1', 'CD2']);
    // L'album entier était coché : toutes ses pistes le sont.
    expect([...target.querySelectorAll<HTMLInputElement>('input[data-piste]')].every((i) => i.checked)).toBe(true);

    click(target.querySelector('input[data-piste="102"]'));
    await wait(() => expect(target.querySelector('.card.partiel')).not.toBeNull());
    click(target.querySelector('.go'));
    await wait(() => expect(api.startConversion).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.startConversion).mock.calls[0][0]).toEqual([{ track_id: 101 }, { track_id: 103 }]);
  });

  it('#5483 — l’album entier part toujours en album_id', async () => {
    await poser();
    await wait(() => expect(target.querySelector('.card')).not.toBeNull());
    click(target.querySelector('.card'));
    click(target.querySelector('.go'));
    await wait(() => expect(api.startConversion).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.startConversion).mock.calls[0][0]).toEqual([{ album_id: 12 }]);
  });

  it('#5481 — choisir 192 kHz part dans la demande, et la ligne le dit', async () => {
    await poser();
    await wait(() => expect(target.querySelector('.chips.freq')).not.toBeNull());
    click(target.querySelector('.card'));
    await wait(() => expect(target.querySelector('.pinfo')?.textContent).toContain('DSD → 176,4'));
    const bouton192 = [...target.querySelectorAll('.chips.freq button')].find((b) => /192/.test(b.textContent ?? ''));
    click(bouton192);
    await wait(() => expect(target.querySelector('.pinfo')?.textContent).toMatch(/192\s*kHz/));
    click(target.querySelector('.go'));
    await wait(() => expect(api.startConversion).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.startConversion).mock.calls[0][3]).toBe(192_000);
  });

  it('#5481 et #5482 — la tâche terminée dit ce qui a été écrit, et l’archive porte le nom de l’album', async () => {
    statuts.j1 = {
      state: 'done', progress: 100, converted: 3, total: 3, download_size: '412.0 MB',
      archive_name: 'Miles Davis - Miles Smiles (FLAC 24).zip',
      output_formats: [{ sample_rate: 176_400, bit_depth: 24 }],
    };
    await poser();
    await wait(() => expect(target.querySelector('.card')).not.toBeNull());
    click(target.querySelector('.card'));
    click(target.querySelector('.go'));
    await wait(() => expect(target.querySelector('.job .done button')).not.toBeNull());
    expect(target.querySelector('.job')!.textContent).toMatch(/24 bits · 176,4 kHz/);
    click(target.querySelector('.job .done button'));
    await wait(() => expect(target.querySelector('a[download]')).not.toBeNull());
    expect(target.querySelector('a[download]')!.getAttribute('download')).toBe('Miles Davis - Miles Smiles (FLAC 24).zip');
  });
});
