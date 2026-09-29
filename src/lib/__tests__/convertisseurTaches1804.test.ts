// @vitest-environment jsdom
/**
 * #1804 — Convertisseur, rapport de Xavier Joly (0.9.168) :
 *  2. ligne de format « FLAC · · 24 » (séparateur orphelin, rien pour les MP3) ;
 *  3. quitter la page pendant un encodage fait disparaître la tâche ;
 *  4. une tâche terminée disparaît quand on en lance une nouvelle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ConverterV2 from '../../components/v2/ConverterV2.svelte';
import * as api from '../api';
import { albums } from '../stores/library';
import { activeView } from '../stores/navigation';
import { licenseState } from '../stores/license';
import { tachesConversion, ajouter, fusionner } from '../convertisseurTaches';
import { ligneFormat } from '../ligneFormatConvertisseur';

vi.mock('../api', async (original) => ({
  ...await original<typeof import('../api')>(),
  getAllAlbums: vi.fn(), getAlbumTracks: vi.fn(async () => []), getConverterCapabilities: vi.fn(),
  getConverterPresets: vi.fn(), downloadConversion: vi.fn(), startConversion: vi.fn(),
  getConversionStatus: vi.fn(), listConversions: vi.fn(), cancelConversion: vi.fn(async () => ({ status: 'cancelled' })),
}));
vi.setConfig({ testTimeout: 10000 });

/** Les préréglages que sert `GET /converter/presets` (routes/converter.rs). */
const PRESETS_SERVEUR = [
  { id: 'flac-cd', label: 'CD Quality (FLAC 16/44.1)', format: 'flac', quality: '5', sample_rate: 44100, bit_depth: 16 },
  { id: 'flac-hires', label: 'Hi-Res (FLAC 24-bit, original sample rate)', format: 'flac', quality: '5', sample_rate: null, bit_depth: 24 },
  { id: 'mp3-320', label: 'MP3 CBR 320 kbps', format: 'mp3', quality: '320', sample_rate: null, bit_depth: null },
  { id: 'mp3-v0', label: 'MP3 VBR V0 (~245 kbps)', format: 'mp3', quality: 'v0', sample_rate: null, bit_depth: null },
  { id: 'mp3-192', label: 'MP3 CBR 192 kbps', format: 'mp3', quality: '192', sample_rate: null, bit_depth: null },
  { id: 'opus-128', label: 'Opus 128 kbps', format: 'opus', quality: '128', sample_rate: null, bit_depth: null },
  { id: 'opus-192', label: 'Opus 192 kbps', format: 'opus', quality: '192', sample_rate: null, bit_depth: null },
  { id: 'wav-cd', label: 'WAV 16/44.1 (uncompressed)', format: 'wav', quality: null, sample_rate: 44100, bit_depth: 16 },
  { id: 'alac-cd', label: 'ALAC 16/44.1 (Apple Lossless)', format: 'alac', quality: null, sample_rate: 44100, bit_depth: 16 },
];
const TEXTES = { originalRate: "fréquence d'origine", fromDsd: 'DSD → {rate}', bits: '{n} bits' };
const kHz = (n: number) => n.toLocaleString('fr');
const DSD64 = { format: 'dsf', sample_rate: 2_822_400 };
const FLAC96 = { format: 'flac', sample_rate: 96_000 };

describe('#1804 point 2 — la ligne de format', () => {
  it.each(PRESETS_SERVEUR)('$id : une ligne pleine, sans séparateur orphelin', (p) => {
    for (const sources of [[], [FLAC96], [DSD64], [DSD64, FLAC96]]) {
      const ligne = ligneFormat(p, sources, TEXTES, kHz);
      const morceaux = ligne.split(' · ');
      expect(morceaux.length, ligne).toBeGreaterThanOrEqual(2);
      for (const m of morceaux) expect(m.trim(), `morceau vide dans « ${ligne} »`).not.toBe('');
      expect(ligne).not.toMatch(/null|undefined|NaN/);
    }
  });

  it('dit ce que chaque préréglage produit', () => {
    const l = (id: string, sources: any[] = []) => ligneFormat(PRESETS_SERVEUR.find((p) => p.id === id)!, sources, TEXTES, kHz);
    expect(l('flac-cd')).toBe('FLAC · 44,1 kHz · 16 bits');
    expect(l('flac-hires')).toBe("FLAC · fréquence d'origine · 24 bits");
    expect(l('flac-hires', [FLAC96])).toBe("FLAC · fréquence d'origine · 24 bits");
    // Depuis du DSD, la fréquence RÉELLE de sortie (176,4 kHz pour un DSD64).
    expect(l('flac-hires', [DSD64])).toBe('FLAC · DSD → 176,4 kHz · 24 bits');
    expect(l('flac-hires', [{ format: 'dsf', sample_rate: 5_644_800 }, DSD64])).toBe('FLAC · DSD → 176,4 kHz / 352,8 kHz · 24 bits');
    expect(l('flac-hires', [DSD64, FLAC96])).toBe("FLAC · fréquence d'origine · DSD → 176,4 kHz · 24 bits");
    expect(l('mp3-320')).toBe('MP3 · CBR 320 kbps');
    expect(l('mp3-v0')).toBe('MP3 · VBR V0');
    expect(l('mp3-192', [DSD64])).toBe('MP3 · CBR 192 kbps');
    expect(l('opus-128')).toBe('OPUS · 128 kbps');
    expect(l('wav-cd', [DSD64])).toBe('WAV · 44,1 kHz · 16 bits');
    expect(l('alac-cd')).toBe('ALAC · 44,1 kHz · 16 bits');
  });
});

describe('#1804 — la liste des tâches (règles pures)', () => {
  it('lancer AJOUTE une tâche, la plus récente d’abord, sans toucher aux autres', () => {
    const faite = { jobId: 'a', job: { state: 'done', progress: 100 } as any, downloadUrl: null, libelle: 'A' };
    const ts = ajouter([faite], 'b', 'B');
    expect(ts.map((t) => t.jobId)).toEqual(['b', 'a']);
    expect(ts[1]).toBe(faite);
  });
  it('fusionner garde le lien préparé et ajoute ce que seul le serveur connaît', () => {
    const locale = [{ jobId: 'a', job: null, downloadUrl: 'blob:a', libelle: 'A' }];
    const ts = fusionner(locale, [
      { job_id: 'a', state: 'done', progress: 100 } as any,
      { job_id: 'z', state: 'converting', progress: 10 } as any,
    ]);
    expect(ts.map((t) => t.jobId)).toEqual(['z', 'a']);
    expect(ts[1]).toMatchObject({ downloadUrl: 'blob:a', libelle: 'A', job: { state: 'done' } });
  });
});

let target: HTMLDivElement;
let instance: ReturnType<typeof mount> | undefined;
const wait = async (assertion: () => void) => vi.waitFor(() => { flushSync(); assertion(); }, { timeout: 3000 });
async function poser() { instance = mount(ConverterV2, { target }); flushSync(); }
async function retirer() { if (instance) await unmount(instance); instance = undefined; target.replaceChildren(); }
function click(el: Element | null) {
  expect(el).not.toBeNull();
  (el as HTMLButtonElement).click(); flushSync();
}
const album = { id: 12, title: 'Miles Smiles', artist_name: 'Miles Davis', source: 'local', format: 'dsf', sample_rate: 2_822_400 };

describe('#1804 points 3 et 4 — l’écran', () => {
  let statuts: Record<string, any>;
  beforeEach(() => {
    vi.clearAllMocks();
    tachesConversion.set([]);
    activeView.set('converter');
    albums.set([album as any]);
    licenseState.update((s) => ({ ...s, tier: 'premium' }));
    statuts = {};
    vi.mocked(api.getConverterCapabilities).mockResolvedValue({ formats: { flac: true, mp3: true }, tools: {} } as any);
    vi.mocked(api.getConverterPresets).mockResolvedValue(PRESETS_SERVEUR as any);
    vi.mocked(api.listConversions).mockResolvedValue([]);
    vi.mocked(api.getConversionStatus).mockImplementation(async (id: string) => statuts[id]);
    vi.mocked(api.downloadConversion).mockImplementation(async (id: string) => `blob:${id}`);
    target = document.createElement('div'); document.body.appendChild(target);
  });
  afterEach(async () => { await retirer(); target.remove(); vi.restoreAllMocks(); });

  it('point 2 — la ligne affichée pour Hi-Res depuis un DSF', async () => {
    await poser();
    await wait(() => expect(target.querySelector('.card')).not.toBeNull());
    click(target.querySelector('.card'));
    click(target.querySelectorAll('.chips button')[1]);
    await wait(() => expect(target.querySelector('.pinfo')?.textContent).toContain('24'));
    const texte = target.querySelector('.pinfo')!.textContent!.replace(/\s+/g, ' ');
    expect(texte).not.toMatch(/·\s*·/);
    expect(texte).toContain('DSD → 176,4 kHz');
  });

  it('point 3 — la tâche en cours est retrouvée en revenant sur la page', async () => {
    statuts.j1 = { state: 'converting', progress: 40, converted: 4, total: 10, current_file: '01 - Orbits.dsf' };
    vi.mocked(api.startConversion).mockResolvedValue({ job_id: 'j1', total_tracks: 10 });
    await poser();
    await wait(() => expect(target.querySelector('.card')).not.toBeNull());
    click(target.querySelector('.card'));
    click(target.querySelector('.go'));
    await wait(() => expect(target.querySelector('.job')?.textContent).toContain('01 - Orbits.dsf'));

    // On quitte l'écran : il est démonté. Le serveur, lui, continue.
    await retirer(); activeView.set('home');
    statuts.j1 = { state: 'done', progress: 100, converted: 10, total: 10, download_size: '412.0 MB' };
    activeView.set('converter'); await poser();

    await wait(() => expect(target.querySelector('.job .done')?.textContent ?? 'aucune tâche retrouvée').toContain('412.0 MB'));
    expect(api.startConversion).toHaveBeenCalledTimes(1);
  });

  it('point 3 — après un rechargement, les tâches que le serveur connaît reviennent', async () => {
    vi.mocked(api.listConversions).mockResolvedValue([
      { job_id: 'ailleurs', state: 'done', progress: 100, converted: 2, total: 2, current_file: '', download_size: '98.1 MB' } as any,
    ]);
    statuts.ailleurs = { state: 'done', progress: 100, converted: 2, total: 2, current_file: '', download_size: '98.1 MB' };
    await poser();
    await wait(() => expect(target.querySelector('.job .done')?.textContent ?? 'aucune tâche retrouvée').toContain('98.1 MB'));
  });

  it('point 3 — un serveur sans la route ne casse rien', async () => {
    vi.mocked(api.listConversions).mockRejectedValue(new Error('404'));
    await poser();
    await wait(() => expect(target.querySelector('.card')).not.toBeNull());
    expect(target.querySelector('.job')).toBeNull();
    expect(target.querySelector('.err')).toBeNull();
  });

  it('point 4 — une tâche terminée reste, téléchargeable, quand on en lance une autre', async () => {
    statuts.j1 = { state: 'done', progress: 100, converted: 10, total: 10, download_size: '412.0 MB' };
    statuts.j2 = { state: 'converting', progress: 10, converted: 1, total: 10, current_file: '02 - Circle.dsf' };
    vi.mocked(api.startConversion)
      .mockResolvedValueOnce({ job_id: 'j1', total_tracks: 10 })
      .mockResolvedValueOnce({ job_id: 'j2', total_tracks: 10 });
    await poser();
    await wait(() => expect(target.querySelector('.card')).not.toBeNull());
    click(target.querySelector('.card'));
    click(target.querySelector('.go'));
    await wait(() => expect(target.querySelector('.job .done button')).not.toBeNull());

    // Le téléchargement de la première n'a PAS été préparé : on relance.
    click(target.querySelector('.go'));
    await wait(() => expect(target.querySelectorAll('.job').length).toBe(2));
    await wait(() => expect(target.textContent).toContain('02 - Circle.dsf'));

    const terminee = [...target.querySelectorAll('.job')].find((j) => j.querySelector('.done'));
    expect(terminee, 'la tâche terminée a disparu').toBeTruthy();
    click(terminee!.querySelector('.done button'));
    await wait(() => expect(target.querySelector('a[download]')?.getAttribute('href')).toBe('blob:j1'));
    expect(api.downloadConversion).toHaveBeenCalledWith('j1');
  });
});
