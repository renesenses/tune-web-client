// @vitest-environment jsdom
//
// rc14 — TESS : choisir la cible du suréchantillonnage, DSD compris
// (contrat de tune-server-rust#9518 : `fixed.upsampling` en `off`/`pcm`/`dsd`,
// `dsd_capabilities`, refus 409 `dsd_not_supported_by_output`).
//
// Ce que ces témoins prouvent, sur le panneau réellement monté et sur l'écran
// TESS entier (API simulée) :
//   1. une cible que la sortie ne prend pas est GRISÉE, avec son motif traduit ;
//   2. une cible acceptée dit son TRANSPORT (natif, DoP, DoP faute de natif) ;
//   3. `dsd_mode` non activé : on le dit, et le lien mène au réglage « DSD »
//      de la zone ;
//   4. en DSD, l'avertissement volume à 100 % et niveau −6 dB ;
//   5. un 409 s'affiche avec son motif, et rien n'est réécrit ;
//   6. Free : lecture seule avec le motif, aucun envoi ; 402 nommé ;
//   7. serveur ancien (sans `dsd_capabilities`) : pas de DSD proposé ;
//   8. sortie réseau : rien de tout cela, l'étape ne s'y applique pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  getTessZone: vi.fn(), putTessZone: vi.fn(), getTessCatalogue: vi.fn(), getTessPresets: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...mocks }));

import PanneauSurechantillonnageTess from '../../components/v2/tess/PanneauSurechantillonnageTess.svelte';
import TessV2 from '../../components/v2/tess/TessV2.svelte';
import CheminTess from '../../components/v2/tess/CheminTess.svelte';
import {
  lireCapacitesDsd, etatsDesCibles, avecUpsampling, versDsd, versPcm, cibleParDefaut, cleMotifDsd, dsdProposable,
  surSortieReseau, MOTIFS_DSD,
} from '../tessDsd';
import type { ReponseTessZone } from '../tess';
import { locale } from '../i18n';
import { licenseState } from '../stores/license';
import { zones, currentZoneId } from '../stores/zones';
import { capaciteTess } from '../stores/tess';
import { activeView } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const en = dictionnaire('en');
const ZONE = 7;

function famille(accepted: boolean, transport: 'native' | 'dop' | null, reason: string | null, native_reason: string | null = null) {
  return { rate_hz: 2822400, accepted, transport, dop_rate_hz: transport === 'dop' ? 176400 : null, reason, native_reason };
}
function capacites(over: Record<string, unknown> = {}) {
  return {
    dsd_mode: 'dop', output_local: true, modulator_order: 7,
    reference_level: '0 dBFS = 50 % modulation (0 dB SACD)', volume_placement: 'before_dsd_modulator', machine_measured: true,
    targets: [
      { rate: 'dsd64', ...famille(true, 'dop', null), family_48k: famille(true, 'dop', null) },
      { rate: 'dsd128', ...famille(true, 'native', null), family_48k: famille(true, 'native', null) },
      { rate: 'dsd256', ...famille(false, null, 'rate_above_zone_max'), family_48k: famille(false, null, 'rate_above_zone_max') },
    ],
    ...over,
  };
}
const etape = (code: string, over: Record<string, unknown> = {}) => ({
  code, plugin_id: null, fixed: true, requested: true, effective: true, reason: null, detail: null, params: null,
  latency_frames: null, ...over,
});
function reponse(over: Partial<ReponseTessZone> & Record<string, unknown> = {}, up: Record<string, unknown> = { mode: 'pcm', filter: 'polyvalent', max_ratio: 4, max_rate_hz: null }): ReponseTessZone {
  return {
    contract_version: 1, zone_id: ZONE, transport: 'local', applicability: { status: 'applied' },
    chain: { version: 1, bypass_all: false, plugins: [], fixed: { headroom: { mode: 'auto' }, upsampling: up, quantization: { dither: 'tpdf' }, futur: 1 } },
    active_preset: null, headroom_db: -3, volume: { control: 'software', placement: 'after_upsampling', db: 0 },
    badge: 'processed_by_tess',
    signal_path: [etape('source'), etape('headroom'), etape('upsampling'), etape('volume'), etape('quantization'), etape('output')] as any,
    catalog: { plugins: [], groups: [] },
    dsd_capabilities: capacites(),
    ...over,
  } as ReponseTessZone;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserTourner(n = 20) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
function monterPanneau(props: Record<string, unknown>) {
  monte = mount(PanneauSurechantillonnageTess, { target: hote!, props: props as any });
  flushSync();
}
const un = (sel: string) => hote!.querySelector<HTMLElement>(sel);
const tous = (sel: string) => Array.from(hote!.querySelectorAll<HTMLElement>(sel));
const radio = (sel: string) => un(sel) as HTMLInputElement;
function cocher(el: HTMLInputElement) {
  el.checked = true;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

beforeEach(() => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  locale.set('en');
  for (const m of Object.values(mocks)) m.mockReset();
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  licenseState.update((s) => ({ ...s, tier: 'free' }));
  vi.restoreAllMocks();
});

describe('rc14 DSD — fonctions pures', () => {
  it('capacités absentes ou illisibles ⇒ null ; lues sinon', () => {
    expect(lireCapacitesDsd(undefined)).toBeNull();
    expect(lireCapacitesDsd({ dsd_mode: 'dop' })).toBeNull();
    const c = lireCapacitesDsd(capacites())!;
    expect(c.targets.map((t) => t.rate)).toEqual(['dsd64', 'dsd128', 'dsd256']);
    expect(c.targets[0].family_48k?.dop_rate_hz).toBe(176400);
  });

  it('une cible absente des capacités est grisée, motif inconnu', () => {
    const e = etatsDesCibles(lireCapacitesDsd(capacites({ targets: [] })));
    expect(e.every((x) => !x.accepted && x.reason === 'unknown')).toBe(true);
    expect(cleMotifDsd('inexistant')).toBe('tess.dsd.reason.unknown');
  });

  it('la chaîne envoyée garde tout le reste (champs inconnus compris)', () => {
    const r = reponse();
    const c = avecUpsampling(r.chain, versDsd(r.chain.fixed!.upsampling, 'dsd128'));
    expect(c.fixed!.upsampling).toEqual({ mode: 'dsd', rate: 'dsd128', filter: 'polyvalent' });
    expect(c.fixed!.futur).toBe(1);
    expect(c.fixed!.headroom).toEqual({ mode: 'auto' });
    // Retour au PCM depuis le DSD : filtre gardé, maximum de l'appareil.
    expect(versPcm({ mode: 'dsd', rate: 'dsd64', filter: 'precision' })).toEqual({ mode: 'pcm', filter: 'precision', max_ratio: null, max_rate_hz: null });
  });

  it('cible par défaut : la plus basse acceptée, ou aucune', () => {
    const e = etatsDesCibles(lireCapacitesDsd(capacites()));
    expect(cibleParDefaut({ mode: 'pcm' }, e)).toBe('dsd64');
    expect(cibleParDefaut({ mode: 'dsd', rate: 'dsd128' }, e)).toBe('dsd128');
    expect(cibleParDefaut({ mode: 'pcm' }, e.map((x) => ({ ...x, accepted: false })))).toBeNull();
  });

  it('serveur ancien ou sortie réseau : DSD non proposé', () => {
    expect(dsdProposable(reponse({ dsd_capabilities: undefined }))).toBe(false);
    const reseau = reponse({ transport: 'oaat', dsd_capabilities: capacites({ output_local: false }) });
    expect(surSortieReseau(reseau)).toBe(true);
    expect(dsdProposable(reseau)).toBe(false);
    expect(dsdProposable(reponse())).toBe(true);
  });

  it('chaque motif connu, et les nouvelles clés, existent dans les 20 langues', () => {
    expect(ONZE_LANGUES).toHaveLength(20);
    const cles = [
      ...MOTIFS_DSD.map((m) => `tess.dsd.reason.${m}`), 'tess.dsd.reason.unknown', 'tess.dsd.modeNotEnabled',
      'tess.dsd.openZoneSettings', 'tess.dsd.levelNote', 'tess.dsd.network', 'tess.dsd.family44', 'tess.dsd.family48',
      'tess.refusal.dsd_not_supported_by_output', 'tess.reason.dsd_not_supported_by_output', 'tess.dsd.unverified',
      'tess.dsd.volumeBeforeModulator',
    ];
    for (const l of ONZE_LANGUES) for (const k of cles) expect(dictionnaire(l)[k], `${l} ${k}`).toBeTruthy();
    expect(dictionnaire('fr')['tess.dsd.reason.rate_above_zone_max']).not.toBe(en['tess.dsd.reason.rate_above_zone_max']);
    // Contrat § 7 : le volume répond en 2 à 2,5 s (session + anneau de la sortie), plus « environ 1 s ».
    for (const l of ONZE_LANGUES) expect(dictionnaire(l)['tess.dsd.volumeBeforeModulator'], l).toMatch(/2[.,]5/);
  });

  it('🔴 sortie jamais lue (`status: unknown`, cibles vides) : choisissables, « à vérifier » ; absent = connu', () => {
    const inconnue = lireCapacitesDsd(capacites({ status: 'unknown', targets: [] }))!;
    expect(inconnue.status).toBe('unknown');
    const e = etatsDesCibles(inconnue);
    expect(e.map((x) => x.rate)).toEqual(['dsd64', 'dsd128', 'dsd256']);
    expect(e.every((x) => x.accepted && x.unverified && x.reason == null)).toBe(true);
    expect(cibleParDefaut({ mode: 'pcm' }, e)).toBe('dsd64');
    expect(lireCapacitesDsd(capacites())!.status).toBe('known');
  });
});

describe('rc14 DSD — panneau', () => {
  it('🔴 cibles grisées avec leur motif, transport affiché pour les acceptées', () => {
    const onChange = vi.fn();
    monterPanneau({ reponse: reponse({}, { mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' }), onChange });
    const c256 = un('[data-tess-dsd-cible="dsd256"]')!;
    expect(c256.dataset.tessDsdAcceptee).toBe('non');
    expect((c256.querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect(c256.querySelector('[data-tess-dsd-motif]')!.textContent).toBe(en['tess.dsd.reason.rate_above_zone_max']);
    expect(un('[data-tess-dsd-cible="dsd64"] [data-tess-dsd-transport]')!.textContent).toBe('DoP');
    expect(un('[data-tess-dsd-cible="dsd128"] [data-tess-dsd-transport]')!.textContent).toBe(en['v2.lbl.native']);
    // Choisir DSD128 envoie la cible, filtre gardé.
    cocher(radio('[data-tess-dsd-cible="dsd128"] input'));
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'dsd', rate: 'dsd128', filter: 'polyvalent' });
  });

  it('🔴 famille 48 kHz : une ligne à part, avec son transport ou son motif ; elle ne grise pas la cible', () => {
    const caps = capacites();
    (caps.targets[1] as any).family_48k = famille(false, null, 'rate_above_zone_max');
    (caps.targets[2] as any).family_48k = famille(true, 'dop', null);
    monterPanneau({ reponse: reponse({ dsd_capabilities: caps }, { mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' }), onChange: vi.fn() });
    const ligne = (cible: string, fam: string) => un(`[data-tess-dsd-cible="${cible}"] [data-tess-dsd-famille="${fam}"]`)!;
    expect(ligne('dsd64', '44k1').textContent).toContain(en['tess.dsd.family44']);
    expect(ligne('dsd64', '48k').textContent).toContain(en['tess.dsd.family48']);
    expect(ligne('dsd64', '48k').querySelector('[data-tess-dsd-transport]')!.textContent).toBe('DoP');
    expect(ligne('dsd128', '44k1').querySelector('[data-tess-dsd-transport]')!.textContent).toBe(en['v2.lbl.native']);
    expect(ligne('dsd128', '48k').querySelector('[data-tess-dsd-motif]')!.textContent).toBe(en['tess.dsd.reason.rate_above_zone_max']);
    // DSD128 reste choisissable (44,1 kHz acceptée) ; DSD256 reste grisé (44,1 kHz refusée) malgré son 48 kHz accepté.
    expect(radio('[data-tess-dsd-cible="dsd128"] input').disabled).toBe(false);
    expect(radio('[data-tess-dsd-cible="dsd256"] input').disabled).toBe(true);
    // Serveur qui ne publie pas `family_48k` : pas de seconde ligne.
    const sans = capacites();
    for (const t of sans.targets as any[]) delete t.family_48k;
    unmount(monte!);
    monterPanneau({ reponse: reponse({ dsd_capabilities: sans }, { mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' }), onChange: vi.fn() });
    expect(un('[data-tess-dsd-famille="48k"]')).toBeNull();
  });

  it('🔴 sortie jamais lue : PCM → DSD envoie DSD64, les cibles disent « à vérifier »', () => {
    const onChange = vi.fn();
    monterPanneau({ reponse: reponse({ dsd_capabilities: capacites({ status: 'unknown', targets: [] }) }), onChange });
    cocher(radio('[data-tess-surech-mode="dsd"]'));
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' });
    expect(tous('[data-tess-dsd-a-verifier]').map((x) => x.textContent)).toEqual(Array(3).fill(en['tess.dsd.unverified']));
    expect(tous('[data-tess-dsd-cible] input').every((x) => !(x as HTMLInputElement).disabled)).toBe(true);
  });

  it('zone « natif » servie en DoP : on le dit', () => {
    const caps = capacites();
    (caps.targets[0] as any).native_reason = 'cadence_non_declaree_par_le_pilote';
    monterPanneau({ reponse: reponse({ dsd_capabilities: { ...caps, dsd_mode: 'native' } }, { mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' }), onChange: vi.fn() });
    expect(un('[data-tess-dsd-cible="dsd64"] [data-tess-dsd-transport]')!.textContent).toBe(`DoP · ${en['tess.dsd.nativeUnavailable']}`);
  });

  it('PCM → DSD envoie la plus basse cible acceptée ; en DSD, le niveau (référence SACD), plus de « volume à 100 % »', () => {
    const onChange = vi.fn();
    monterPanneau({ reponse: reponse(), onChange });
    expect(un('[data-tess-dsd-avertissement]')).toBeNull();
    cocher(radio('[data-tess-surech-mode="dsd"]'));
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' });
    const avert = un('[data-tess-dsd-avertissement]')!.textContent!;
    expect(un('[data-tess-dsd-volume]')!.textContent).toBe(en['tess.dsd.volumeBeforeModulator']);
    expect(avert).toContain(en['tess.dsd.levelNote']);
    expect(avert).toContain('SACD');
    expect(avert).not.toContain('100');
    // Les anciennes phrases sur le volume ont disparu de toutes les langues.
    for (const l of ONZE_LANGUES) {
      expect(dictionnaire(l)['tess.dsd.volumeFixed'], l).toBeUndefined();
      expect(dictionnaire(l)['tess.dsd.volumeNotSoftware'], l).toBeUndefined();
      expect(dictionnaire(l)['tess.dsd.reason.software_volume_active'], l).toBeUndefined();
    }
  });

  it('`volume_placement` absent ou autre : pas de phrase sur le volume, la note de niveau reste', () => {
    monterPanneau({ reponse: reponse({ dsd_capabilities: capacites({ volume_placement: undefined }) }, { mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' }), onChange: vi.fn() });
    expect(un('[data-tess-dsd-volume]')).toBeNull();
    expect(un('[data-tess-dsd-avertissement]')!.textContent).toContain(en['tess.dsd.levelNote']);
  });

  it('🔴 `carrier_rate_not_supported` : sur la cible, et dans le chemin du signal', () => {
    const caps = capacites();
    Object.assign(caps.targets[2] as any, famille(false, null, 'carrier_rate_not_supported'));
    monterPanneau({ reponse: reponse({ dsd_capabilities: caps }, { mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' }), onChange: vi.fn() });
    expect(un('[data-tess-dsd-cible="dsd256"] [data-tess-dsd-motif]')!.textContent).toBe(en['tess.dsd.reason.carrier_rate_not_supported']);
    unmount(monte!);
    monte = null;
    const r = reponse({
      signal_path: [etape('source'), etape('upsampling', { effective: false, reason: 'dsd_not_supported_by_output', detail: 'carrier_rate_not_supported' }), etape('output')] as any,
    }, { mode: 'dsd', rate: 'dsd256', filter: 'polyvalent' });
    monte = mount(CheminTess, { target: hote!, props: { reponse: r, verrouDe: () => null, onSelect() {}, onToggle() {}, onRemove() {}, onMove() {}, onBypass() {}, onAdd() {} } as any });
    flushSync();
    expect(un('[data-tess-etape="upsampling"] .sous')!.textContent)
      .toBe(`${en['tess.reason.dsd_not_supported_by_output']} · ${en['tess.dsd.reason.carrier_rate_not_supported']}`);
  });

  it('🔴 `dsd_mode` non activé : dit, avec le lien vers le réglage de la zone ; aucune cible envoyée', () => {
    const onChange = vi.fn();
    const ouvrir = vi.fn();
    const caps = capacites({ dsd_mode: 'auto' });
    for (const t of caps.targets as any[]) {
      Object.assign(t, famille(false, null, 'dsd_mode_not_enabled'));
      t.family_48k = famille(false, null, 'dsd_mode_not_enabled');
    }
    monterPanneau({ reponse: reponse({ dsd_capabilities: caps }), onChange, onOuvrirReglagesZone: ouvrir });
    cocher(radio('[data-tess-surech-mode="dsd"]'));
    expect(onChange).not.toHaveBeenCalled();
    expect(un('[data-tess-dsd-mode-inactif]')!.textContent).toContain(en['tess.dsd.modeNotEnabled']);
    expect(tous('[data-tess-dsd-motif]').map((e) => e.textContent)).toEqual(Array(6).fill(en['tess.dsd.reason.dsd_mode_not_enabled']));
    un('[data-tess-dsd-reglages-zone]')!.click();
    expect(ouvrir).toHaveBeenCalledTimes(1);
  });

  it('🔴 Free : lecture seule avec le motif, rien ne part', () => {
    const onChange = vi.fn();
    monterPanneau({ reponse: reponse(), onChange, verrou: 'Upsampling is part of Tune Premium.' });
    expect(un('[data-tess-surech-verrou]')!.textContent).toBe('Upsampling is part of Tune Premium.');
    for (const r of tous('[data-tess-surech-mode]') as HTMLInputElement[]) expect(r.disabled, r.value).toBe(true);
    cocher(radio('[data-tess-surech-mode="dsd"]'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('🔴 serveur ancien (sans `dsd_capabilities`) : PCM seulement', () => {
    monterPanneau({ reponse: reponse({ dsd_capabilities: undefined }), onChange: vi.fn() });
    expect(un('[data-tess-surech-mode="pcm"]')).not.toBeNull();
    expect(un('[data-tess-surech-mode="dsd"]')).toBeNull();
    expect(un('[data-tess-dsd-cible]')).toBeNull();
  });

  it('🔴 sortie réseau : l’étape ne s’y applique pas, rien n’est proposé', () => {
    const r = reponse({
      transport: 'dlna',
      dsd_capabilities: capacites({ output_local: false }),
      signal_path: [etape('source'), etape('upsampling', { effective: false, reason: 'not_applied_on_transport' }), etape('output')] as any,
    });
    monterPanneau({ reponse: r, onChange: vi.fn() });
    expect(un('[data-tess-surech-reseau]')!.textContent).toBe(en['tess.dsd.network']);
    expect(un('[data-tess-surech-mode]')).toBeNull();
    expect(un('[data-tess-dsd-cible]')).toBeNull();
  });
});

describe('rc14 DSD — écran TESS', () => {
  beforeEach(() => {
    zones.set([{ id: ZONE, name: 'salon', output_type: 'local' } as any]);
    currentZoneId.set(ZONE);
    capaciteTess.set('inconnue');
    activeView.set('tess' as any);
    v2SettingsTarget.set(null);
    mocks.getTessCatalogue.mockResolvedValue({ version: 1, droits: {} });
    mocks.getTessPresets.mockResolvedValue(null);
  });

  async function monterEcran(r: ReponseTessZone) {
    mocks.getTessZone.mockResolvedValue({ ok: true, reponse: r });
    monte = mount(TessV2, { target: hote! });
    await laisserTourner();
    un('[data-tess-choisir-etape="upsampling"]')!.click();
    await laisserTourner(3);
  }

  it('🔴 409 : le motif précis s’affiche, les capacités sont reprises', async () => {
    licenseState.update((s) => ({ ...s, tier: 'premium', loaded: true }));
    const caps = capacites();
    (caps.targets[0] as any).accepted = false;
    (caps.targets[0] as any).transport = null;
    (caps.targets[0] as any).reason = 'dop_refused_by_output';
    mocks.putTessZone.mockResolvedValue({
      ok: false,
      refus: { status: 409, code: 'dsd_not_supported_by_output', detail: 'dsd64', plugin_id: null, reason: 'dop_refused_by_output', dsd_capabilities: caps },
    });
    await monterEcran(reponse());
    cocher(radio('[data-tess-surech-mode="dsd"]'));
    await laisserTourner();
    expect(mocks.putTessZone).toHaveBeenCalledTimes(1);
    expect(mocks.putTessZone.mock.calls[0][1].fixed.upsampling).toEqual({ mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' });
    const attendu = en['tess.refusal.dsd_not_supported_by_output'].replace('{reason}', en['tess.dsd.reason.dop_refused_by_output']);
    expect(un('[data-tess-message]')!.textContent).toBe(attendu);
    // Les capacités du refus sont reprises : DSD64 est maintenant grisé, avec son motif.
    expect(un('[data-tess-dsd-cible="dsd64"]')!.dataset.tessDsdAcceptee).toBe('non');
    expect(un('[data-tess-dsd-cible="dsd64"] [data-tess-dsd-motif]')!.textContent).toBe(en['tess.dsd.reason.dop_refused_by_output']);
  });

  it('🔴 Free : panneau verrouillé (motifDuVerrou), aucun PUT ; un 402 sans greffon nomme le suréchantillonnage', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free', loaded: true }));
    await monterEcran(reponse());
    expect(un('[data-tess-surech-verrou]')!.textContent).toBe(en['tess.premiumRequired'].replace('{name}', en['tess.step.upsampling']));
    cocher(radio('[data-tess-surech-mode="dsd"]'));
    await laisserTourner(3);
    expect(mocks.putTessZone).not.toHaveBeenCalled();
  });

  it('402 renvoyé par le serveur (droit retiré) : message nommé', async () => {
    licenseState.update((s) => ({ ...s, tier: 'premium', loaded: true }));
    mocks.putTessZone.mockResolvedValue({ ok: false, refus: { status: 402, code: 'premium_required', detail: '', plugin_id: null } });
    await monterEcran(reponse());
    cocher(radio('[data-tess-surech-mode="off"]'));
    await laisserTourner();
    expect(un('[data-tess-message]')!.textContent).toBe(en['tess.refusal.premium_required'].replace('{name}', en['tess.step.upsampling']));
  });

  it('le lien mène au réglage « DSD » de la zone', async () => {
    licenseState.update((s) => ({ ...s, tier: 'premium', loaded: true }));
    await monterEcran(reponse({ dsd_capabilities: capacites({ dsd_mode: 'pcm' }) }, { mode: 'dsd', rate: 'dsd64', filter: 'polyvalent' }));
    un('[data-tess-dsd-reglages-zone]')!.click();
    expect(get(v2SettingsTarget)).toEqual({ tab: 'devices', section: 'perZone', zone: ZONE, reglage: 'zone-dsd' });
    expect(get(activeView)).toBe('settings');
  });
});
