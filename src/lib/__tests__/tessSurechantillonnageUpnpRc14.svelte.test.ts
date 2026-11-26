// @vitest-environment jsdom
//
// rc14 — TESS : une raison claire quand le suréchantillonnage ne s'applique
// pas, et le PCM proposé sur une zone DLNA/OpenHome, selon le contrat de
// tune-server-rust#9565 (`delivery.upsampling`, `params` de l'étape,
// `refus_reseau`).
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
//   3. zone DLNA/OpenHome : le PCM est proposé, les cadences annoncées par le
//      lecteur servent de cible maximale, la décision de la lecture (cadences
//      ou refus motivé) est dite, et le DSD y est dit indisponible ;
//   4. lecteur sans sonde (BluOS…) ou serveur antérieur : rien de proposé,
//      avec le motif ;
//   5. zone locale : rien ne change (rapports ×2 à ×16, aucune note réseau).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import PanneauSurechantillonnageTess from '../../components/v2/tess/PanneauSurechantillonnageTess.svelte';
import CheminTess from '../../components/v2/tess/CheminTess.svelte';
import { ciblesPcmDe, pcmProposable, surSortieReseau, dsdProposable, surechReseauDe, cleMotifSurechReseau, motifReseauSansPcm } from '../tessDsd';
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

/** Les cadences qu'un lecteur annonce (#9565 : PCM seulement). */
const ANNONCEES = [192000, 44100, 96000, 48000, 176400, 88200];
/** `delivery.upsampling` de #9565, appliqué et refusé. */
const APPLIQUE = { active: true, from_hz: 44100, to_hz: 176400, filter: 'polyvalent', headroom_db: -3, offered_rates_hz: ANNONCEES };
const refuse = (reason: string, offered_rates_hz: number[] = []) => ({ active: false, reason, offered_rates_hz });
/** L'étape `upsampling` refusée par la lecture (#9565 § 2). */
const etapeRefusee = (code: string, refusal_text?: string) => ({
  effective: false, reason: 'not_in_service', detail: code,
  params: { offered_rates_hz: [], refusal: code, ...(refusal_text ? { refusal_text } : {}) },
});

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
  const CLES = [
    'not_applied_on_transport', 'renderer_rate_unknown', 'renderer_rate_not_higher', 'renderer_without_rate_probe',
    'source_not_supported_on_network', 'upsampling_file_only', 'upsampling_too_slow_for_file', 'strict_bitperfect',
    'not_evaluated_yet', 'dsd_unavailable_on_network',
  ].map((m) => `tess.reason.${m}`);

  it('chaque motif existe, et n’est pas l’anglais hors de en', () => {
    expect(ONZE_LANGUES).toHaveLength(20);
    for (const l of ONZE_LANGUES) {
      for (const k of CLES) {
        expect(dictionnaire(l)[k], `${l} ${k}`).toBeTruthy();
        if (l !== 'en') expect(dictionnaire(l)[k], `${l} ${k}`).not.toBe(en[k]);
      }
    }
  });

  it('chaque code de `refus_reseau` (#9565) a son libellé ; `renderer_rates_unknown` est un alias', () => {
    for (const code of [
      'renderer_rate_unknown', 'renderer_rate_not_higher', 'dsd_not_supported_on_network', 'pure',
      'source_not_supported_on_network', 'progressive_stream_not_supported', 'renderer_without_rate_probe',
      'track_too_heavy_for_upsampling', 'upsampling_too_slow_for_file', 'strict_bitperfect', 'not_evaluated_yet',
    ]) {
      const cle = cleMotifSurechReseau(code);
      expect(cle, code).not.toBeNull();
      expect(fr[cle!], code).toBeTruthy();
    }
    expect(cleMotifSurechReseau('renderer_rates_unknown')).toBe(cleMotifSurechReseau('renderer_rate_unknown'));
    expect(cleMotifSurechReseau('code_inconnu')).toBeNull();
    expect(cleMotifSurechReseau(null)).toBeNull();
  });
});

describe('rc14 — contrat #9565 : lecture', () => {
  it('serveur qui ne publie rien : null ; PCM proposé sur DLNA et OpenHome seulement', () => {
    const r = upnp({}, {}, { mode: 'off' });
    expect(surechReseauDe(r)).toBeNull();
    expect(ciblesPcmDe(r)).toBeNull();
    expect(surSortieReseau(r)).toBe(true);
    expect(pcmProposable(r)).toBe(true);
    expect(pcmProposable(upnp({}, { transport: 'openhome' }, { mode: 'off' }))).toBe(true);
    for (const t of ['bluos', 'squeezebox', 'chromecast', 'airplay']) {
      expect(pcmProposable(upnp({}, { transport: t }, { mode: 'off' })), t).toBe(false);
    }
    expect(pcmProposable(reponse())).toBe(true);
  });

  it('serveur antérieur à #9565 (PCM demandé, étape `not_applied_on_transport`) : pas de PCM', () => {
    const r = upnp({ effective: false, reason: 'not_applied_on_transport' });
    expect(pcmProposable(r)).toBe(false);
    expect(motifReseauSansPcm(r)).toBeNull();
  });

  it('`delivery.upsampling` appliqué : cadences, et cadences annoncées triées', () => {
    const s = surechReseauDe(upnp({}, { delivery: { route: 'file_transcode', upsampling: APPLIQUE } }));
    expect(s).toEqual({ active: true, reason: null, from_hz: 44100, to_hz: 176400, offered_rates_hz: [44100, 48000, 88200, 96000, 176400, 192000] });
    expect(ciblesPcmDe(upnp({}, { delivery: { upsampling: APPLIQUE } }))).toEqual([44100, 48000, 88200, 96000, 176400, 192000]);
  });

  it('`delivery.upsampling` refusé : le code ; alias pluriel compris', () => {
    expect(surechReseauDe(upnp({}, { delivery: { upsampling: refuse('upsampling_too_slow_for_file', [96000]) } }))!.reason)
      .toBe('upsampling_too_slow_for_file');
    expect(surechReseauDe(upnp({}, { delivery: { upsampling: refuse('renderer_rates_unknown') } }))!.reason).toBe('renderer_rates_unknown');
  });

  it('sans `delivery` : les `params` de l’étape (appliquée, puis refusée)', () => {
    const app = surechReseauDe(upnp({ params: { source_rate_hz: 48000, target_rate_hz: 192000, headroom_db: -3, offered_rates_hz: [192000, 96000] } }));
    expect(app).toEqual({ active: true, reason: null, from_hz: 48000, to_hz: 192000, offered_rates_hz: [96000, 192000] });
    const ref = surechReseauDe(upnp(etapeRefusee('renderer_rate_not_higher')));
    expect(ref!.active).toBe(false);
    expect(ref!.reason).toBe('renderer_rate_not_higher');
  });

  it('lecteur sans sonde : `renderer_without_rate_probe`, même sans rien de publié', () => {
    expect(motifReseauSansPcm(upnp({}, { transport: 'bluos' }, { mode: 'off' }))).toBe('renderer_without_rate_probe');
    expect(motifReseauSansPcm(upnp({}, { transport: 'airplay' }, { mode: 'off' }))).toBeNull();
  });

  it('jamais de DSD sur le réseau', () => {
    expect(dsdProposable(upnp({}, { dsd_capabilities: { output_local: false, targets: [] } }))).toBe(false);
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

  it('refus de la lecture (#9565) : la phrase du serveur, sinon le code traduit', () => {
    monterCarte(upnp(etapeRefusee('upsampling_too_slow_for_file', 'Phrase du serveur')));
    expect(carte()).toBe('Phrase du serveur');
    unmount(monte!);
    monte = null;
    monterCarte(upnp(etapeRefusee('upsampling_too_slow_for_file')));
    expect(carte()).toBe(fr['tess.reason.upsampling_too_slow_for_file']);
    unmount(monte!);
    monte = null;
    monterCarte(upnp(etapeRefusee('renderer_rates_unknown')));
    expect(carte()).toBe(fr['tess.reason.renderer_rate_unknown']);
  });

  it('`dsd_unavailable_on_network` : traduit aussi', () => {
    monterCarte(upnp({ effective: false, reason: 'dsd_unavailable_on_network' }, {}, { mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' }));
    expect(carte()).toBe(fr['tess.reason.dsd_unavailable_on_network']);
  });

  it('cible PCM en cadence, effective : la carte la dit', () => {
    monterCarte(upnp({}, { delivery: { upsampling: APPLIQUE } }, { mode: 'pcm', filter: 'polyvalent', max_ratio: null, max_rate_hz: 176400 }));
    expect(carte()).toBe('PCM · 176.4 kHz · polyvalent');
  });
});

describe('rc14 — zone UPnP : le panneau', () => {
  it('🔴 serveur antérieur : « ne s’applique pas sur une sortie réseau », rien de proposé', () => {
    monterPanneau(upnp({ effective: false, reason: 'not_applied_on_transport' }));
    expect(un('[data-tess-surech-reseau]')!.textContent).toBe(fr['tess.dsd.network']);
    expect(un('[data-tess-surech-mode]')).toBeNull();
  });

  it('lecteur sans sonde (BluOS) : le panneau dit ce motif', () => {
    monterPanneau(upnp({}, { transport: 'bluos' }));
    expect(un('[data-tess-surech-reseau]')!.textContent).toBe(fr['tess.reason.renderer_without_rate_probe']);
    expect(un('[data-tess-surech-mode]')).toBeNull();
  });

  it('DLNA sans rien de publié : PCM proposé, avec les rapports', () => {
    monterPanneau(upnp({}, {}, { mode: 'off' }));
    expect(un('[data-tess-surech-reseau]')).toBeNull();
    expect(un('[data-tess-surech-mode="pcm"]')).not.toBeNull();
    expect(un('[data-tess-surech-mode="dsd"]')).toBeNull();
  });

  it('🔴 cadences annoncées : proposées en cible maximale ; choisir envoie `max_rate_hz`', () => {
    const onChange = monterPanneau(upnp({}, { delivery: { upsampling: APPLIQUE } }));
    expect(un('[data-tess-surech-reseau]')).toBeNull();
    const options = tous('[data-tess-surech-cible-pcm]') as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual(['hz:44100', 'hz:48000', 'hz:88200', 'hz:96000', 'hz:176400', 'hz:192000']);
    expect(options[4].textContent).toBe('176.4 kHz');
    // Le réglage en place (×4), non annoncé en cadence : affiché tel quel.
    expect(tous('[data-tess-surech-rapport] option').map((o) => (o as HTMLOptionElement).value))
      .toEqual(['', 'hz:44100', 'hz:48000', 'hz:88200', 'hz:96000', 'hz:176400', 'hz:192000', '4']);
    const select = un('[data-tess-surech-rapport]') as HTMLSelectElement;
    expect(select.value).toBe('4');
    select.value = 'hz:96000';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(onChange).toHaveBeenCalledWith({ mode: 'pcm', filter: 'polyvalent', max_ratio: null, max_rate_hz: 96000 });
  });

  it('la décision de la lecture : « 44.1 kHz → 176.4 kHz »', () => {
    monterPanneau(upnp({}, { delivery: { upsampling: APPLIQUE } }));
    const etat = un('[data-tess-surech-etat-reseau]')!;
    expect(etat.getAttribute('data-tess-surech-etat-reseau')).toBe('actif');
    expect(etat.textContent).toBe('44.1 kHz → 176.4 kHz');
  });

  it('🔴 refus de la lecture : la phrase du serveur, sinon le code traduit (alias compris)', () => {
    monterPanneau(upnp(etapeRefusee('upsampling_too_slow_for_file', 'Phrase du serveur'), { delivery: { upsampling: refuse('upsampling_too_slow_for_file') } }));
    expect(un('[data-tess-surech-etat-reseau="refuse"]')!.textContent).toBe('Phrase du serveur');
    unmount(monte!);
    monte = null;
    monterPanneau(upnp({}, { delivery: { upsampling: refuse('upsampling_too_slow_for_file') } }));
    expect(un('[data-tess-surech-etat-reseau="refuse"]')!.textContent).toBe(fr['tess.reason.upsampling_too_slow_for_file']);
    unmount(monte!);
    monte = null;
    monterPanneau(upnp({}, { delivery: { upsampling: refuse('renderer_rates_unknown') } }));
    expect(un('[data-tess-surech-etat-reseau="refuse"]')!.textContent).toBe(fr['tess.reason.renderer_rate_unknown']);
    // Aucune cadence annoncée : les rapports restent proposés.
    expect(un('[data-tess-surech-cible-pcm]')).toBeNull();
    expect(tous('[data-tess-surech-rapport] option').map((o) => (o as HTMLOptionElement).value)).toEqual(['', '2', '4', '8', '16']);
  });

  it('DSD réglé sur une zone DLNA : « DSD non disponible », aucune cible DSD', () => {
    monterPanneau(upnp({ effective: false, reason: 'not_applied_on_transport' }, {}, { mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' }));
    expect(un('[data-tess-surech-dsd-reseau]')!.textContent).toBe(fr['tess.reason.dsd_unavailable_on_network']);
    expect(un('[data-tess-dsd-cible]')).toBeNull();
    expect(un('[data-tess-surech-reseau]')).toBeNull();
  });
});

describe('rc14 — zone locale : inchangée', () => {
  it('panneau : rapports ×2 à ×16, aucune note réseau ; carte « PCM · ×4 · polyvalent »', () => {
    // Même avec un `delivery` publié, la sortie locale garde ses rapports.
    monterPanneau(reponse({ delivery: { upsampling: APPLIQUE } }));
    expect(un('[data-tess-surech-reseau]')).toBeNull();
    expect(un('[data-tess-surech-cible-pcm]')).toBeNull();
    expect(un('[data-tess-surech-etat-reseau]')).toBeNull();
    expect(tous('[data-tess-surech-rapport] option').map((o) => (o as HTMLOptionElement).value)).toEqual(['', '2', '4', '8', '16']);
    unmount(monte!);
    monte = null;
    monterCarte(reponse());
    expect(carte()).toBe('PCM · ×4 · polyvalent');
  });
});
