// @vitest-environment jsdom
// TESS W5 — chemin du signal ouvert depuis la pastille TESS de la barre de
// lecture (maquette A4).
//
// Concordance avec le serveur : les zones sont les fixtures RÉELLES de
// `ReponseTessZone::depuis` (fixtures/tess, tune-core @ 0f5fff472d). La route T16
// (`tess/t16-chemin-signal-8df74e`) n'étant pas publiée, la dernière épreuve
// simule les `params` qu'elle ajoute (fichier de RI, bandes, préréglage,
// format de sortie), conformément au contrat § 8 « T16 ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import CheminDuSignalTess from '../../components/v2/tess/CheminDuSignalTess.svelte';
import PastilleTess from '../../components/v2/tess/PastilleTess.svelte';
import { locale } from '../i18n';
import { normaliserZoneTess, type ZoneTess } from '../tess/contrat';
import { ouvrirEcranTess } from '../tess/navigationTess';
import A1 from './fixtures/tess/a1-oaat.json';
import PURE from './fixtures/tess/pure-0db.json';
import HQ from './fixtures/tess/hqplayer.json';
import DSD from './fixtures/tess/dsd128.json';
import BYPASS from './fixtures/tess/bypass-all.json';

const zone = (v: unknown) => normaliserZoneTess(v) as ZoneTess;
const json = (status: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

let host: HTMLDivElement;
let monte: Record<string, unknown> | null = null;
function monter(C: any, props: Record<string, unknown>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  monte = mount(C, { target: host, props });
  flushSync();
}
const attendre = async () => { for (let i = 0; i < 6; i++) { await tick(); await new Promise((r) => setTimeout(r, 0)); } flushSync(); };
const sel = (q: string) => host.querySelector(q) as HTMLElement | null;
const lignes = () => [...host.querySelectorAll('[data-tess="etapes"] .ligne')].map((l) => [
  l.querySelector('span')!.textContent, l.querySelector('.val')!.textContent,
]);

beforeEach(() => locale.set('en'));
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  host?.remove();
  ouvrirEcranTess.set(null);
  vi.unstubAllGlobals();
});

describe('TESS W5 — panneau « Signal path » (A4)', () => {
  it('traité par TESS : badge, étapes dans l’ordre réel de Q9, Transport et Device', () => {
    monter(CheminDuSignalTess, { zone: zone(A1), appareil: 'atelier [Verox]' });
    expect(sel('[data-tess="badge"]')!.textContent).toBe('Processed by TESS · 64-bit');
    expect(sel('[data-tess="source"]')!.textContent).toBe('PCM 24-bit / 96 kHz');
    expect(lignes()).toEqual([
      ['Headroom', '−3 dB (auto)'],
      ['Convolution', 'living-room.zip'],
      ['Graphic EQ', 'On'],
      ['Upsampling', 'Off'],
      ['Volume control', 'Software · −18 dB'],
      ['Dither', 'TPDF dither'],
    ]);
    expect(host.textContent, 'un greffon décoché n’est pas une étape').not.toContain('Crossfeed');
    expect(sel('[data-tess="transport"]')!.textContent).toBe('OAAT');
    expect(sel('[data-tess="appareil"]')!.textContent).toBe('atelier [Verox]');
    expect(host.textContent).toContain('In Pure mode, the TESS step disappears and the badge reads “Bit-perfect”.');
  });

  it('Pure : pas d’étape TESS, badge « Bit-perfect »', () => {
    monter(CheminDuSignalTess, { zone: zone(PURE) });
    expect(sel('[data-tess="badge"]')!.textContent).toBe('Bit-perfect');
    expect(sel('[data-tess="etapes"]')).toBeNull();
    expect(sel('[data-tess="source"]')).not.toBeNull();
  });

  it('hors TESS : badge et motif, aucune étape', () => {
    monter(CheminDuSignalTess, { zone: zone(HQ) });
    expect(sel('[data-tess="badge"]')!.textContent).toBe('Outside TESS');
    expect(sel('[data-tess="hors-tess"]')!.textContent).toBe('HQPlayer applies its own processing');
    expect(sel('[data-tess="etapes"]')).toBeNull();
    expect(sel('[data-tess="transport"]')!.textContent).toBe('HQPlayer');
  });

  it('DSD : volume juste avant le modulateur', () => {
    monter(CheminDuSignalTess, { zone: zone(DSD) });
    expect(lignes().map(([n]) => n)).toEqual(['Headroom', 'Graphic EQ', 'Upsampling', 'Volume control', 'DSD modulator']);
    expect(sel('[data-tess="transport"]')!.textContent).toBe('Local output');
  });

  it('Bypass all : les greffons restent visibles, éteints, avec leur motif', () => {
    monter(CheminDuSignalTess, { zone: zone(BYPASS) });
    const conv = sel('[data-greffon="convolution"]')!;
    expect(conv.classList.contains('eteinte')).toBe(true);
    expect(conv.textContent).toContain('Bypass all');
  });

  it('paramètres de T16 (simulés, conformes au contrat § 8)', () => {
    const z = structuredClone(A1) as any;
    z.signal_path[0].params = { ...z.signal_path[0].params, service: 'Qobuz', codec: 'FLAC' };
    z.signal_path.find((e: any) => e.plugin_id === 'convolution').params = { file: 'room_96k.wav', sample_rate_hz: 96000, matches_source: true };
    z.signal_path.find((e: any) => e.plugin_id === 'equalizer-graphic').params = { bands: 31, preset: 'Jazz' };
    z.signal_path.at(-1).params = { kind: 'pcm', sample_rate_hz: 96000, bits: 24, channels: 2 };
    monter(CheminDuSignalTess, { zone: zone(z), appareil: 'atelier [Verox]' });
    expect(sel('[data-tess="source"]')!.textContent).toBe('Qobuz · FLAC 24-bit / 96 kHz');
    expect(lignes()).toContainEqual(['Convolution', 'room_96k.wav · matches 96 kHz']);
    expect(lignes()).toContainEqual(['Graphic EQ', '31 bands · Jazz']);
    expect(sel('[data-tess="transport"]')!.textContent).toBe('OAAT · PCM 24-bit / 96 kHz');
  });

  it('« Open TESS » : présent seulement si la coquille sait ouvrir l’écran', () => {
    monter(CheminDuSignalTess, { zone: zone(A1) });
    expect(sel('[data-tess="ouvrir"]')).toBeNull();
    unmount(monte!); host.remove();
    const ouvrir = vi.fn();
    monter(CheminDuSignalTess, { zone: zone(A1), onOuvrir: ouvrir });
    (sel('[data-tess="ouvrir"]') as HTMLButtonElement).click();
    expect(ouvrir).toHaveBeenCalledTimes(1);
  });
});

describe('TESS W5 — pastille de la barre de lecture', () => {
  it('serveur sans TESS (404) : RIEN ne s’affiche', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { error: 'Not Found' })));
    monter(PastilleTess, { zoneId: 12 });
    await attendre();
    expect(host.innerHTML.replace(/<!---->/g, '').trim()).toBe('');
  });

  it('serveur TESS : la pastille ouvre le chemin, « Open TESS » ouvre l’écran', async () => {
    const f = vi.fn(async () => json(200, A1));
    vi.stubGlobal('fetch', f);
    const ouvrir = vi.fn();
    ouvrirEcranTess.set(ouvrir);
    monter(PastilleTess, { zoneId: 12, appareil: 'atelier [Verox]' });
    await attendre();
    const p = sel('[data-tess="pastille"]') as HTMLButtonElement;
    expect(p.textContent).toContain('TESS');
    expect(sel('[data-tess-chemin]')).toBeNull();
    p.click();
    await attendre();
    expect(sel('[data-tess-chemin]')).not.toBeNull();
    expect(f.mock.calls.length, 'relu à l’ouverture').toBeGreaterThanOrEqual(2);
    (sel('[data-tess="ouvrir"]') as HTMLButtonElement).click();
    flushSync();
    expect(ouvrir).toHaveBeenCalledTimes(1);
    expect(sel('[data-tess-chemin]'), 'le panneau se referme').toBeNull();
  });

  it('pas de zone : rien, et aucun appel', async () => {
    const f = vi.fn(async () => json(200, A1));
    vi.stubGlobal('fetch', f);
    monter(PastilleTess, { zoneId: null });
    await attendre();
    expect(sel('[data-tess="pastille"]')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
