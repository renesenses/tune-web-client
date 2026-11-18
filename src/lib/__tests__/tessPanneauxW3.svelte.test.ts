// @vitest-environment jsdom
// TESS W3 — panneaux neufs : Convolution (maquette A1), Declick temps réel
// (Premium), étages fixes dans l'ordre réel de Q9.
//
// Les zones viennent des fixtures RÉELLES du serveur (fixtures/tess, sortie de
// `ReponseTessZone::depuis`). Seules les routes du jeu de filtres
// (`/zones/{id}/tess/convolution`) sont simulées : T08/T09a ne les ont pas
// encore publiées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import EtagesFixesTess from '../../components/v2/tess/EtagesFixesTess.svelte';
import PanneauConvolutionTess from '../../components/v2/tess/PanneauConvolutionTess.svelte';
import PanneauDeclickTess from '../../components/v2/tess/PanneauDeclickTess.svelte';
import { locale } from '../i18n';
import { licenseState } from '../stores/license';
import { normaliserZoneTess, type ZoneTess } from '../tess/contrat';
import { etiquettesEtape } from '../tess/etagesFixes';
import { get } from 'svelte/store';
import { t } from '../i18n';
import A1 from './fixtures/tess/a1-oaat.json';
import DSD from './fixtures/tess/dsd128.json';
import UP from './fixtures/tess/upsampling-pcm-noise.json';
import SANS_PREMIUM from './fixtures/tess/declick-sans-premium.json';

const zone = (v: unknown) => normaliserZoneTess(v) as ZoneTess;
const RAPPORT = {
  filter_set: 'living-room.zip',
  filters: [
    { file: 'room_44k.wav', sample_rate_hz: 44100, channels: 2, status: 'available', matches_source: null },
    { file: 'room_48k.wav', sample_rate_hz: 48000, channels: 2, status: 'available', matches_source: null },
    { file: 'room_96k.wav', sample_rate_hz: 96000, channels: 2, status: 'in_use', matches_source: true },
  ],
};
const json = (status: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

let host: HTMLDivElement;
let monte: Record<string, unknown> | null = null;
let appels: { url: string; init?: RequestInit }[] = [];
let reponses: Record<string, () => Response>;

function monter(C: any, props: Record<string, unknown>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  monte = mount(C, { target: host, props });
  flushSync();
}
const attendre = async () => { for (let i = 0; i < 6; i++) { await tick(); await new Promise((r) => setTimeout(r, 0)); } flushSync(); };
const sel = (q: string) => host.querySelector(q) as HTMLElement | null;

beforeEach(() => {
  locale.set('en');
  licenseState.update((s) => ({ ...s, tier: 'premium' }));
  appels = [];
  reponses = {
    'GET /tess/convolution': () => json(200, RAPPORT),
    'PUT /tess': () => json(200, A1),
    'GET /tess': () => json(200, A1),
  };
  vi.stubGlobal('fetch', vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    appels.push({ url, init });
    const m = init?.method ?? 'GET';
    const chemin = url.replace(/.*\/zones\/\d+/, '').replace(/\?.*/, '');
    const r = reponses[`${m} ${chemin}`];
    return r ? r() : json(404, { error: 'not found' });
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  host?.remove();
  vi.unstubAllGlobals();
  licenseState.update((s) => ({ ...s, tier: 'free' }));
});

describe('TESS W3 — étages fixes', () => {
  it('FIXED sur les étages fixes, LAST sur la seule étape finale', () => {
    locale.set('en');
    const z = zone(A1);
    const etape = (zz: ZoneTess, code: string, id?: string) =>
      zz.signal_path.find((e) => e.code === code && (id === undefined || e.plugin_id === id))!;
    expect(etiquettesEtape(etape(z, 'headroom'), get(t))).toEqual(['FIXED']);
    expect(etiquettesEtape(etape(z, 'volume'), get(t))).toEqual(['FIXED']);
    expect(etiquettesEtape(etape(z, 'upsampling'), get(t))).toEqual(['FIXED']);
    expect(etiquettesEtape(etape(z, 'quantization'), get(t))).toEqual(['FIXED', 'LAST']);
    expect(etiquettesEtape(etape(z, 'plugin', 'convolution'), get(t))).toEqual([]);
    expect(etiquettesEtape(etape(zone(DSD), 'dsd_modulator'), get(t))).toEqual(['FIXED', 'LAST']);
  });

  it('étiquettes traduites (français)', () => {
    locale.set('fr');
    const q = zone(A1).signal_path.find((e) => e.code === 'quantization')!;
    expect(etiquettesEtape(q, get(t))).toEqual(['FIXE', 'DERNIER']);
  });

  it("ordre réel de Q9 : Headroom avant les greffons ; Upsampling → Volume → Dither après", () => {
    monter(EtagesFixesTess, { zone: zone(A1), position: 'avant' });
    expect([...host.querySelectorAll('[data-etage-fixe]')].map((e) => e.getAttribute('data-etage-fixe'))).toEqual(['headroom']);
    expect(host.textContent).toContain('−3 dB · on automatically');
    expect(host.textContent).toContain('FIXED');
    unmount(monte!); host.remove();

    monter(EtagesFixesTess, { zone: zone(A1), position: 'apres' });
    const codes = [...host.querySelectorAll('[data-etage-fixe]')].map((e) => e.getAttribute('data-etage-fixe'));
    expect(codes, 'la maquette dessine Volume avant Upsampling : le contrat (Q9) fait foi').toEqual(['upsampling', 'volume', 'quantization']);
    const dither = sel('[data-etage-fixe="quantization"]')!;
    expect(dither.textContent).toContain('Dither');
    expect(dither.textContent).toContain('FIXED · LAST');
    expect(sel('[data-etage-fixe="volume"]')!.textContent).toContain('Software · −18 dB');
    expect(sel('[data-etage-fixe="volume"]')!.textContent).not.toContain('LAST');
  });

  it('DSD : le volume juste avant le modulateur, qui est le dernier', () => {
    monter(EtagesFixesTess, { zone: zone(DSD) });
    expect([...host.querySelectorAll('[data-etage-fixe]')].map((e) => e.getAttribute('data-etage-fixe')))
      .toEqual(['headroom', 'upsampling', 'volume', 'dsd_modulator']);
    expect(sel('[data-etage-fixe="dsd_modulator"]')!.textContent).toContain('LAST');
  });

  it('un étage éteint est atténué et dit pourquoi', () => {
    monter(EtagesFixesTess, { zone: zone(A1) });
    const up = sel('[data-etage-fixe="upsampling"]')!;
    expect(up.getAttribute('data-effectif')).toBe('false');
    expect(up.classList.contains('eteint')).toBe(true);
    expect(up.textContent).toContain('Off');
  });
});

describe('TESS W3 — panneau Convolution (A1)', () => {
  it('jeu de filtres, formats acceptés, tableau, « In use — matches the source »', async () => {
    monter(PanneauConvolutionTess, { zone: zone(A1) });
    await attendre();
    expect(sel('[data-tess="jeu"]')!.textContent).toBe('living-room.zip');
    expect(host.textContent).toContain('Browse…');
    expect(host.textContent).toContain('Accepted: a single impulse response (.wav)');
    const lignes = [...host.querySelectorAll('[data-tess="filtres"] tbody tr')];
    expect(lignes.map((l) => l.querySelector('td')!.textContent)).toEqual(['room_44k.wav', 'room_48k.wav', 'room_96k.wav']);
    expect(lignes[0].textContent).toContain('44.1 kHz');
    expect(lignes[0].textContent).toContain('Stereo');
    expect(lignes[0].textContent).toContain('—');
    expect(lignes[2].textContent).toContain('In use — matches the source');
    expect(lignes[2].classList.contains('enService')).toBe(true);
    expect(host.textContent).toContain('Resample the nearest filter');
    expect(host.textContent).toContain('Phase-preserving conversion to the source sample rate');
    expect(host.textContent).toContain('Remove plugin');
  });

  async function deposer(nom: string) {
    const champ = sel('[data-tess="fichier"]') as HTMLInputElement;
    const f = new File([new Uint8Array([80, 75, 3, 4])], nom);
    Object.defineProperty(champ, 'files', { value: [f], configurable: true });
    champ.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre();
  }

  it('zip piégé (chemins ..) : refus traduit, propre, et le jeu en service reste', async () => {
    reponses['POST /tess/convolution'] = () =>
      json(422, { status: 422, code: 'zip_path_traversal', detail: 'entry ../../etc/passwd', plugin_id: 'convolution' });
    monter(PanneauConvolutionTess, { zone: zone(A1) });
    await attendre();
    await deposer('piege.zip');
    const post = appels.find((a) => a.init?.method === 'POST')!;
    expect(post.url).toMatch(/\/zones\/12\/tess\/convolution(\?|$)/);
    expect(post.init!.body).toBeInstanceOf(FormData);
    const refus = sel('[data-tess="refus-import"]')!;
    expect(refus.getAttribute('role')).toBe('alert');
    expect(refus.textContent).toContain('This filter set was refused.');
    expect(refus.textContent).toContain('The archive tries to write outside its own folder');
    expect(refus.textContent, 'pas de détail technique brut quand la phrase suffit').not.toContain('passwd');
    expect(sel('[data-tess="jeu"]')!.textContent).toBe('living-room.zip');
    expect(host.querySelectorAll('[data-tess="filtres"] tbody tr')).toHaveLength(3);
  });

  it.each([
    ['zip_bomb', 'expands to far more data'],
    ['zip_link', 'contains links'],
    ['zip_too_many_files', 'too many files'],
    ['cfg_missing_ir', 'missing from the archive'],
  ])('refus %s', async (code, phrase) => {
    reponses['POST /tess/convolution'] = () => json(422, { status: 422, code, detail: '', plugin_id: null });
    monter(PanneauConvolutionTess, { zone: zone(A1) });
    await attendre();
    await deposer('x.zip');
    expect(sel('[data-tess="refus-import"]')!.textContent).toContain(phrase);
  });

  it('code inconnu : phrase générique + détail du serveur ; 413 HTML du mandataire : trop gros', async () => {
    reponses['POST /tess/convolution'] = () => json(422, { status: 422, code: 'zip_nouveau_piege', detail: 'Nested archive', plugin_id: null });
    monter(PanneauConvolutionTess, { zone: zone(A1) });
    await attendre();
    await deposer('x.zip');
    const r = sel('[data-tess="refus-import"]')!.textContent!;
    expect(r).toContain('Tune could not use this file.');
    expect(r).toContain('Nested archive');
    expect(r).not.toContain('zip_nouveau_piege');

    reponses['POST /tess/convolution'] = () => new Response('<html>413 Request Entity Too Large</html>', { status: 413 });
    await deposer('gros.zip');
    expect(sel('[data-tess="refus-import"]')!.textContent).toContain('The file is too large.');
  });

  it('extension refusée sans aller-retour', async () => {
    monter(PanneauConvolutionTess, { zone: zone(A1) });
    await attendre();
    await deposer('filtre.exe');
    expect(appels.some((a) => a.init?.method === 'POST')).toBe(false);
    expect(sel('[data-tess="refus-import"]')!.textContent).toContain('Only .wav and .zip files are accepted.');
  });

  it('import accepté : nouveau rapport, zone relue et rendue au parent', async () => {
    reponses['POST /tess/convolution'] = () => json(200, { filter_set: 'casque.wav', filters: [
      { file: 'casque.wav', sample_rate_hz: 48000, channels: 2, status: 'in_use', matches_source: false }] });
    const onZone = vi.fn();
    monter(PanneauConvolutionTess, { zone: zone(A1), onZone });
    await attendre();
    await deposer('casque.wav');
    expect(sel('[data-tess="refus-import"]')).toBeNull();
    expect(host.textContent).toContain('In use — resampled to the source rate');
    expect(onZone).toHaveBeenCalledTimes(1);
  });

  it('« Resample the nearest filter » et « Remove plugin » passent par PUT /zones/{id}/tess', async () => {
    const onZone = vi.fn();
    monter(PanneauConvolutionTess, { zone: zone(A1), onZone });
    await attendre();
    const caseR = sel('[data-tess="reechantillonner"]') as HTMLInputElement;
    expect(caseR.checked).toBe(true);
    caseR.checked = false;
    caseR.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre();
    let put = appels.filter((a) => a.init?.method === 'PUT').at(-1)!;
    let corps = JSON.parse(String(put.init!.body));
    expect(corps.plugins.find((m: any) => m.id === 'convolution').settings)
      .toEqual({ filter_set: 'living-room.zip', resample_nearest: false });
    expect(corps.plugins.map((m: any) => m.id), 'les autres maillons intacts').toEqual(['convolution', 'equalizer-graphic', 'crossfeed']);
    expect(corps.fixed).toEqual((A1 as any).chain.fixed);

    (sel('[data-tess="retirer"]') as HTMLButtonElement).click();
    await attendre();
    put = appels.filter((a) => a.init?.method === 'PUT').at(-1)!;
    corps = JSON.parse(String(put.init!.body));
    expect(corps.plugins.map((m: any) => m.id)).toEqual(['equalizer-graphic', 'crossfeed']);
    expect(onZone).toHaveBeenCalledTimes(2);
  });

  it('refus du PUT : dit à l’endroit du geste', async () => {
    reponses['PUT /tess'] = () => json(402, { status: 402, code: 'premium_required', detail: 'x', plugin_id: 'convolution' });
    monter(PanneauConvolutionTess, { zone: zone(A1) });
    await attendre();
    (sel('[data-tess="actif"]') as HTMLInputElement).click();
    await attendre();
    expect(sel('[data-tess="refus-chaine"]')!.textContent).toBe('Requires Tune Premium');
  });
});

describe('TESS W3 — Declick temps réel (Premium)', () => {
  it('réglages et statut actif', async () => {
    monter(PanneauDeclickTess, { zone: zone(UP) });
    expect(sel('[data-tess="valeur-seuil"]')!.textContent).toBe('8');
    expect(sel('[data-tess="valeur-anticipation"]')!.textContent).toBe('15 ms');
    const seuil = sel('[data-tess="seuil"]') as HTMLInputElement;
    expect([seuil.min, seuil.max]).toEqual(['4', '30']);
    const ant = sel('[data-tess="anticipation"]') as HTMLInputElement;
    expect([ant.min, ant.max]).toEqual(['10', '20']);
    expect(sel('[data-tess="statut"]')!.textContent).toContain('Active');
    expect(sel('[data-tess="premium"]')).toBeNull();

    seuil.value = '12';
    seuil.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre();
    const put = appels.filter((a) => a.init?.method === 'PUT').at(-1)!;
    const m = JSON.parse(String(put.init!.body)).plugins.find((x: any) => x.id === 'declick-live');
    expect(m.settings).toEqual({ enabled: true, threshold: 12, lookahead_ms: 15 });
  });

  it('sans Premium : réglages verrouillés, statut = motif du serveur', () => {
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    monter(PanneauDeclickTess, { zone: zone(SANS_PREMIUM) });
    expect(sel('[data-tess="premium"]')!.textContent).toContain('Declick is part of Tune Premium.');
    expect((sel('[data-tess="seuil"]') as HTMLInputElement).disabled).toBe(true);
    expect((sel('[data-tess="anticipation"]') as HTMLInputElement).disabled).toBe(true);
    expect(sel('[data-tess="statut"]')!.textContent).toContain('Requires Tune Premium');
    expect(sel('[data-tess="statut"]')!.textContent).not.toContain('Active');
  });
});
