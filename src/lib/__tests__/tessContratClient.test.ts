// TESS (W3/W5) — le client lit la réponse du serveur telle que le contrat la
// fixe (`docs/tess/contrat.md`, tune-core/src/tess/api.rs).
//
// Les fixtures `fixtures/tess/*.json` ne sont PAS écrites à la main : elles
// sont la sortie de `ReponseTessZone::depuis` (tune-core, batch/tess-20261118
// @ 0f5fff472d, `serde_json::to_string_pretty`) pour la chaîne de la maquette
// A1 et sept autres contextes (Pure, HQPlayer, DLNA à volume d'appareil, DSD128,
// upsampling PCM, compte sans Premium, Bypass all). Si le serveur change de
// forme, on les régénère et ces épreuves disent ce qui casse.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { locale, t } from '../i18n';
import { ecrireChaineTess, lireZoneTess, normaliserZoneTess, type ZoneTess } from '../tess/contrat';
import { formaterDb, motifEtape, nomEtape, resumeEtape } from '../tess/libelles';
import A1 from './fixtures/tess/a1-oaat.json';
import PURE from './fixtures/tess/pure-0db.json';
import HQ from './fixtures/tess/hqplayer.json';
import DSD from './fixtures/tess/dsd128.json';
import UP from './fixtures/tess/upsampling-pcm-noise.json';
import SANS_PREMIUM from './fixtures/tess/declick-sans-premium.json';
import BYPASS from './fixtures/tess/bypass-all.json';
import VIDE from './fixtures/tess/vide-device.json';

const lire = (v: unknown): ZoneTess => {
  const z = normaliserZoneTess(v);
  if (!z) throw new Error('réponse illisible');
  return z;
};
const tr = () => get(t);
const etape = (z: ZoneTess, code: string, id?: string) =>
  z.signal_path.find((e) => e.code === code && (id === undefined || e.plugin_id === id))!;

afterEach(() => vi.unstubAllGlobals());

describe('TESS — lecture de la réponse du serveur (contrat § 7)', () => {
  it("garde l'ordre réel de Q9 publié par le serveur (volume APRÈS l'upsampling)", () => {
    expect(lire(A1).signal_path.map((e) => e.code)).toEqual(
      ['source', 'headroom', 'plugin', 'plugin', 'plugin', 'upsampling', 'volume', 'quantization', 'output']);
    expect(lire(DSD).signal_path.map((e) => e.code)).toEqual(
      ['source', 'headroom', 'plugin', 'upsampling', 'volume', 'dsd_modulator', 'output']);
  });

  it('lit le badge du serveur sans le recalculer', () => {
    expect(lire(A1).badge).toBe('processed_by_tess');
    expect(lire(PURE).badge).toBe('bit_perfect');
    expect(lire(HQ).badge).toBe('outside_tess');
    expect(lire(VIDE).badge).toBe('bit_perfect');
    expect(lire(HQ).applicability).toEqual(expect.objectContaining({ status: 'outside_tess', reason: 'hqplayer_own_processing' }));
  });

  it('un serveur plus récent : champs inconnus ignorés, énumérations inconnues lues « unknown »', () => {
    const futur = structuredClone(A1) as any;
    futur.badge = 'processed_by_tess_and_room';
    futur.couleur = 'rouge';
    futur.signal_path.push({ code: 'limiter', plugin_id: null, fixed: true, requested: true, effective: true,
      reason: 'thermal', detail: 'Limiteur', params: { ceiling: -1 }, latency_frames: 64, color: 'red' });
    futur.volume.placement = 'quelque_part';
    const z = lire(futur);
    expect(z.badge).toBe('unknown');
    expect(z.volume.placement).toBe('unknown');
    expect(z.signal_path.at(-1)!.code).toBe('unknown');
    expect('couleur' in z).toBe(false);
    // Un motif inconnu se dit par son détail, jamais par son code.
    locale.set('en');
    expect(motifEtape({ ...z.signal_path.at(-1)!, effective: false }, z, tr())).toBe('Limiteur');
  });

  it("n'invente pas une réponse TESS (contre-épreuve)", () => {
    expect(normaliserZoneTess({ error: 'not found' })).toBeNull();
    expect(normaliserZoneTess({ ...A1, contract_version: undefined })).toBeNull();
    expect(normaliserZoneTess({ ...A1, signal_path: null })).toBeNull();
    expect(normaliserZoneTess(null)).toBeNull();
  });
});

describe('TESS — libellés des étapes (maquettes A1 et A4, ordre Q9)', () => {
  it('A1 : headroom, volume, upsampling, dither', () => {
    locale.set('en');
    const z = lire(A1);
    expect(resumeEtape(etape(z, 'headroom'), z, tr())).toBe('−3 dB · on automatically');
    expect(resumeEtape(etape(z, 'headroom'), z, tr(), true)).toBe('−3 dB (auto)');
    expect(resumeEtape(etape(z, 'volume'), z, tr())).toBe('Software · −18 dB');
    expect(resumeEtape(etape(z, 'upsampling'), z, tr())).toBe('Off');
    expect(resumeEtape(etape(z, 'quantization'), z, tr())).toBe('TPDF dither');
    expect(resumeEtape(etape(z, 'plugin', 'crossfeed'), z, tr())).toBe('Off');
    expect(resumeEtape(etape(z, 'plugin', 'convolution'), z, tr())).toBe('living-room.zip');
    expect(nomEtape(etape(z, 'plugin', 'equalizer-graphic'), z, tr())).toBe('Graphic EQ');
  });

  it('upsampling PCM, headroom manuel, mise en forme du bruit, modulateur DSD', () => {
    locale.set('en');
    const z = lire(UP);
    expect(resumeEtape(etape(z, 'upsampling'), z, tr())).toBe('PCM ×4 · polyvalent');
    expect(resumeEtape(etape(z, 'headroom'), z, tr())).toBe('−6 dB');
    expect(resumeEtape(etape(z, 'quantization'), z, tr())).toBe('Noise shaping');
    const d = lire(DSD);
    expect(resumeEtape(etape(d, 'upsampling'), d, tr())).toBe('DSD128 · polyvalent');
    expect(resumeEtape(etape(d, 'dsd_modulator'), d, tr())).toBe('DSD128');
  });

  it('une étape éteinte dit son motif, jamais « actif »', () => {
    locale.set('en');
    const p = lire(PURE);
    expect(resumeEtape(etape(p, 'plugin', 'convolution'), p, tr())).toBe('Pure mode');
    expect(resumeEtape(etape(p, 'quantization'), p, tr())).toBe('Not needed · bit-perfect');
    const s = lire(SANS_PREMIUM);
    expect(resumeEtape(etape(s, 'plugin', 'declick-live'), s, tr())).toBe('Requires Tune Premium');
    expect(resumeEtape(etape(s, 'plugin', 'crossfeed-pro'), s, tr())).toBe('Plugin not installed or disabled');
    const b = lire(BYPASS);
    expect(resumeEtape(etape(b, 'plugin', 'convolution'), b, tr())).toBe('Bypass all');
    const v = lire(VIDE);
    expect(resumeEtape(etape(v, 'volume'), v, tr())).toBe('Set by the device');
  });

  it('traduit (français)', () => {
    locale.set('fr');
    const z = lire(A1);
    expect(nomEtape(etape(z, 'volume'), z, tr())).toBe('Contrôle du volume');
    expect(resumeEtape(etape(z, 'volume'), z, tr())).toBe('Logiciel · −18 dB');
  });

  it('formaterDb', () => {
    expect(formaterDb(-3)).toBe('−3 dB');
    expect(formaterDb(0)).toBe('0 dB');
    expect(formaterDb(2.5)).toBe('+2.5 dB');
  });
});

describe('TESS — routes', () => {
  const repondre = (status: number, corps?: unknown) =>
    new Response(corps === undefined ? '' : JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

  it('serveur sans TESS (404) : null, sans bandeau ni exception', async () => {
    const f = vi.fn(async () => repondre(404, { error: 'Not Found' }));
    vi.stubGlobal('fetch', f);
    expect(await lireZoneTess(3)).toBeNull();
    expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/\/zones\/3\/tess/);
  });

  it('serveur avec TESS : la zone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => repondre(200, A1)));
    expect((await lireZoneTess(12))?.badge).toBe('processed_by_tess');
  });

  it('PUT refusé (402, 409) : le refus est RENDU, pas levé', async () => {
    const refus = { status: 402, code: 'premium_required', detail: 'Premium', plugin_id: 'declick-live' };
    const f = vi.fn(async () => repondre(402, refus));
    vi.stubGlobal('fetch', f);
    const r = await ecrireChaineTess(12, { version: 1 });
    expect(r).toEqual({ ok: false, refus });
    const init = (f.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ version: 1 });
    vi.stubGlobal('fetch', vi.fn(async () => repondre(409, { status: 409, code: 'must_be_last_plugin', detail: 'x', plugin_id: 'channel-remap' })));
    expect(await ecrireChaineTess(12, { version: 1 })).toEqual(expect.objectContaining({ ok: false }));
  });

  it('PUT accepté : la zone relue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => repondre(200, A1)));
    const r = await ecrireChaineTess(12, { version: 1 });
    expect(r.ok && r.zone.zone_id).toBe(12);
  });
});
