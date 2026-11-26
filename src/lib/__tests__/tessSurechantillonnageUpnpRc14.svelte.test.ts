// @vitest-environment jsdom
//
// rc14 — TESS : une raison claire quand le suréchantillonnage ne s'applique
// pas, et le PCM proposé sur une zone UPnP dont le serveur publie les cibles.
//
// Relevé sur la zone UPnP de Bertrand (web e1963e64e) : la carte affichait la
// phrase ANGLAISE du serveur (`not_applied_on_transport`,
// `renderer_without_lpcm` absents des 20 langues), et la phrase claire
// n'apparaissait qu'après un clic, dans un panneau vide.
//
// Ce que ces témoins prouvent, sur la carte et le panneau réellement montés :
//   1. zone UPnP sous PURE : le motif PURE prime ;
//   2. zone UPnP sans PURE, `not_applied_on_transport` : une phrase traduite,
//      pas l'anglais du serveur ;
//   3. zone UPnP avec des cibles PCM publiées : le panneau les propose, sans
//      « ne s'applique pas », et le DSD y est dit indisponible ;
//   4. zone locale : rien ne change (rapports ×2 à ×16, aucune note réseau).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import PanneauSurechantillonnageTess from '../../components/v2/tess/PanneauSurechantillonnageTess.svelte';
import CheminTess from '../../components/v2/tess/CheminTess.svelte';
import { ciblesPcmDe, pcmProposable, surSortieReseau, dsdProposable, libelleCiblePcm } from '../tessDsd';
import type { ReponseTessZone } from '../tess';
import { locale } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const en = dictionnaire('en');
const fr = dictionnaire('fr');
const ANGLAIS_DU_SERVEUR = 'Upsampling is not applied on this network output';

const etape = (code: string, over: Record<string, unknown> = {}) => ({
  code, plugin_id: null, fixed: true, requested: true, effective: true, reason: null, detail: null, params: null,
  latency_frames: null, ...over,
});
const PCM = { mode: 'pcm', filter: 'polyvalent', max_ratio: 4, max_rate_hz: null };

function reponse(
  over: Partial<ReponseTessZone> & Record<string, unknown> = {},
  up: Record<string, unknown> = PCM,
  etapeUp: Record<string, unknown> = {},
): ReponseTessZone {
  return {
    contract_version: 1, zone_id: 3, transport: 'local', applicability: { status: 'applied' },
    chain: { version: 1, bypass_all: false, plugins: [], fixed: { headroom: { mode: 'auto' }, upsampling: up, quantization: { dither: 'tpdf' } } },
    active_preset: null, headroom_db: -3, volume: { control: 'software', placement: 'after_upsampling', db: 0 },
    badge: 'processed_by_tess',
    signal_path: [etape('source'), etape('headroom'), etape('upsampling', etapeUp), etape('volume'), etape('quantization'), etape('output')] as any,
    catalog: { plugins: [], groups: [] },
    ...over,
  } as ReponseTessZone;
}
const upnp = (etapeUp: Record<string, unknown>, over: Record<string, unknown> = {}, up: Record<string, unknown> = PCM) =>
  reponse({ transport: 'dlna', ...over }, up, etapeUp);

const CIBLES = [
  { ratio: 2, rate_hz: 88200 },
  { ratio: 4, rate_hz: 176400 },
  { ratio: 8, rate_hz: 352800, accepted: false, reason: 'renderer_rate_unknown' },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const un = (sel: string) => hote!.querySelector<HTMLElement>(sel);
const tous = (sel: string) => Array.from(hote!.querySelectorAll<HTMLElement>(sel));

function monterCarte(r: ReponseTessZone) {
  monte = mount(CheminTess, {
    target: hote!,
    props: { reponse: r, verrouDe: () => null, onSelect() {}, onToggle() {}, onRemove() {}, onMove() {}, onBypass() {}, onAdd() {} } as any,
  });
  flushSync();
}
const carte = () => un('[data-tess-etape="upsampling"] .sous')!.textContent;
function monterPanneau(r: ReponseTessZone, onChange = vi.fn()) {
  monte = mount(PanneauSurechantillonnageTess, { target: hote!, props: { reponse: r, onChange } as any });
  flushSync();
  return onChange;
}

beforeEach(() => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  locale.set('fr');
});
afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  locale.set('en');
});

describe('rc14 — motifs réseau traduits dans les 20 langues', () => {
  const CLES = ['not_applied_on_transport', 'renderer_without_lpcm', 'renderer_rate_unknown', 'dsd_unavailable_on_network']
    .map((m) => `tess.reason.${m}`);

  it('chaque motif existe, et n’est pas l’anglais hors de en', () => {
    expect(ONZE_LANGUES).toHaveLength(20);
    for (const l of ONZE_LANGUES) {
      for (const k of CLES) {
        expect(dictionnaire(l)[k], `${l} ${k}`).toBeTruthy();
        if (l !== 'en') expect(dictionnaire(l)[k], `${l} ${k}`).not.toBe(en[k]);
      }
    }
  });
});

describe('rc14 — cibles PCM publiées : lecture tolérante', () => {
  it('serveur qui ne publie rien : null, et pas de PCM sur le réseau', () => {
    const r = upnp({ effective: false, reason: 'not_applied_on_transport' });
    expect(ciblesPcmDe(r)).toBeNull();
    expect(surSortieReseau(r)).toBe(true);
    expect(pcmProposable(r)).toBe(false);
  });

  it('les trois emplacements sont lus ; une cadence nue est acceptée', () => {
    expect(ciblesPcmDe(upnp({}, { pcm_capabilities: { targets: CIBLES } }))).toHaveLength(3);
    expect(ciblesPcmDe(upnp({}, {}, { ...PCM, pcm_targets: [176400] }))).toEqual([{ rate_hz: 176400, ratio: null, accepted: true, reason: null }]);
    expect(ciblesPcmDe(upnp({ params: { pcm_targets: [{ ratio: 2 }] } }))![0].ratio).toBe(2);
    // Illisibles : écartées, sans casser la liste.
    expect(ciblesPcmDe(upnp({}, { pcm_capabilities: { targets: [null, 'x', {}, -1, { rate_hz: 96000 }] } }))).toHaveLength(1);
  });

  it('PCM proposé seulement avec une cible acceptée ; jamais de DSD sur le réseau', () => {
    expect(pcmProposable(upnp({}, { pcm_capabilities: { targets: CIBLES } }))).toBe(true);
    expect(pcmProposable(upnp({}, { pcm_capabilities: { targets: [CIBLES[2]] } }))).toBe(false);
    expect(dsdProposable(upnp({}, { pcm_capabilities: { targets: CIBLES }, dsd_capabilities: { output_local: false, targets: [] } }))).toBe(false);
    expect(pcmProposable(reponse())).toBe(true);
    expect(libelleCiblePcm({ ratio: 4, rate_hz: 176400, accepted: true, reason: null })).toBe('×4 · 176.4 kHz');
  });
});

describe('rc14 — zone UPnP : la carte « Suréchantillonnage »', () => {
  it('🔴 sous PURE : le motif PURE prime', () => {
    monterCarte(upnp({ effective: false, reason: 'pure_mode' }));
    expect(carte()).toBe(fr['tess.reason.pure_mode']);
  });

  it('🔴 sans PURE, `not_applied_on_transport` : phrase traduite, pas l’anglais du serveur', () => {
    monterCarte(upnp({ effective: false, reason: 'not_applied_on_transport', detail: ANGLAIS_DU_SERVEUR }));
    expect(carte()).toBe(fr['tess.reason.not_applied_on_transport']);
    expect(carte()).not.toContain('Upsampling');
  });

  it('`renderer_rate_unknown` et `dsd_unavailable_on_network` : traduits aussi', () => {
    monterCarte(upnp({ effective: false, reason: 'renderer_rate_unknown', detail: 'renderer declares no rate' }));
    expect(carte()).toBe(fr['tess.reason.renderer_rate_unknown']);
    unmount(monte!);
    monte = null;
    monterCarte(upnp({ effective: false, reason: 'dsd_unavailable_on_network' }, {}, { mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' }));
    expect(carte()).toBe(fr['tess.reason.dsd_unavailable_on_network']);
  });

  it('cible PCM en cadence, effective : la carte la dit', () => {
    monterCarte(upnp({}, { pcm_capabilities: { targets: CIBLES } }, { mode: 'pcm', filter: 'polyvalent', max_ratio: null, max_rate_hz: 176400 }));
    expect(carte()).toBe('PCM · 176.4 kHz · polyvalent');
  });
});

describe('rc14 — zone UPnP : le panneau', () => {
  it('🔴 serveur sans cibles PCM : « ne s’applique pas sur une sortie réseau », rien de proposé', () => {
    monterPanneau(upnp({ effective: false, reason: 'not_applied_on_transport' }));
    expect(un('[data-tess-surech-reseau]')!.textContent).toBe(fr['tess.dsd.network']);
    expect(un('[data-tess-surech-mode]')).toBeNull();
  });

  it('serveur sans cibles, `renderer_rate_unknown` : le panneau dit ce motif', () => {
    monterPanneau(upnp({ effective: false, reason: 'renderer_rate_unknown' }));
    expect(un('[data-tess-surech-reseau]')!.textContent).toBe(fr['tess.reason.renderer_rate_unknown']);
  });

  it('🔴 cibles PCM publiées : proposées, sans note réseau ; choisir envoie la cible', () => {
    const onChange = monterPanneau(upnp({}, { pcm_capabilities: { targets: CIBLES } }));
    expect(un('[data-tess-surech-reseau]')).toBeNull();
    expect(un('[data-tess-surech-mode="pcm"]')).not.toBeNull();
    expect(un('[data-tess-surech-mode="dsd"]')).toBeNull();
    const options = tous('[data-tess-surech-cible-pcm]') as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual(['2', '4', '8']);
    expect(options[1].textContent).toBe('×4 · 176.4 kHz');
    expect(options[2].disabled).toBe(true);
    expect(options[2].textContent).toBe(`×8 · 352.8 kHz · ${fr['tess.reason.renderer_rate_unknown']}`);
    // Les rapports fixes de la sortie locale ne sont pas proposés à la place.
    expect(tous('[data-tess-surech-rapport] option').map((o) => (o as HTMLOptionElement).value)).toEqual(['', '2', '4', '8']);
    const select = un('[data-tess-surech-rapport]') as HTMLSelectElement;
    expect(select.value).toBe('4');
    select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(onChange).toHaveBeenCalledWith({ mode: 'pcm', filter: 'polyvalent', max_ratio: 2, max_rate_hz: null });
  });

  it('cible publiée en cadence seule : envoyée en `max_rate_hz`', () => {
    const onChange = monterPanneau(upnp({}, { pcm_capabilities: { targets: [{ rate_hz: 192000 }] } }, { mode: 'pcm', filter: 'polyvalent', max_ratio: null, max_rate_hz: null }));
    const select = un('[data-tess-surech-rapport]') as HTMLSelectElement;
    select.value = 'hz:192000';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(onChange).toHaveBeenCalledWith({ mode: 'pcm', filter: 'polyvalent', max_ratio: null, max_rate_hz: 192000 });
  });

  it('DSD réglé sur une zone réseau avec cibles PCM : « DSD non disponible », aucune cible DSD', () => {
    monterPanneau(upnp({}, { pcm_capabilities: { targets: CIBLES } }, { mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' }));
    expect(un('[data-tess-surech-dsd-reseau]')!.textContent).toBe(fr['tess.reason.dsd_unavailable_on_network']);
    expect(un('[data-tess-dsd-cible]')).toBeNull();
    expect(un('[data-tess-surech-reseau]')).toBeNull();
  });
});

describe('rc14 — zone locale : inchangée', () => {
  it('panneau : rapports ×2 à ×16, aucune note réseau ; carte « PCM · ×4 · polyvalent »', () => {
    // Même si un serveur publiait des cibles PCM, la sortie locale garde ses rapports.
    monterPanneau(reponse({ pcm_capabilities: { targets: [{ rate_hz: 96000 }] } }));
    expect(un('[data-tess-surech-reseau]')).toBeNull();
    expect(un('[data-tess-surech-cible-pcm]')).toBeNull();
    expect(tous('[data-tess-surech-rapport] option').map((o) => (o as HTMLOptionElement).value)).toEqual(['', '2', '4', '8', '16']);
    unmount(monte!);
    monte = null;
    monterCarte(reponse());
    expect(carte()).toBe('PCM · ×4 · polyvalent');
  });
});
