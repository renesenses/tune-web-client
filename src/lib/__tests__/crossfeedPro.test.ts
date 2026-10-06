// Crossfeed Pro — la logique pure de l'écran : réglages lus, bornés, complétés ;
// préréglages ; présence du greffon ; zone stéréo ; entrée de la barre.
import { describe, expect, it } from 'vitest';
import {
  BORNES_CLASSIQUE,
  BORNES_CROSSFEED_PRO,
  borneCrossfeedPro,
  DEFAUTS_CROSSFEED_PRO,
  PRESETS_CROSSFEED_PRO,
  appliquerPresetCrossfeedPro,
  coupureDePosition,
  positionCoupure,
  presenceDepuis,
  presetCrossfeedProActif,
  profilCrossfeedProActif,
  reglagesCrossfeedPro,
  zoneStereo,
} from '../crossfeedPro';
import { entreesAvecCrossfeedPro } from '../stores/crossfeedPro';

describe('Crossfeed Pro — réglages lus de l’hôte', () => {
  it('`settings: null` (zone jamais réglée) = les défauts, greffon ÉTEINT et mode ITD ÉTEINT', () => {
    const r = reglagesCrossfeedPro(null);
    expect(r).toEqual(DEFAUTS_CROSSFEED_PRO);
    expect(r.enabled).toBe(false);
    expect(r.experimental_itd).toBe(false);
    expect(r.head_shadow).toBe(false);
  });

  it('borne chaque curseur, et un champ illisible retombe sur son défaut', () => {
    const r = reglagesCrossfeedPro({ amount: 9, delay_ms: -1, itd_tau_max_us: 10, head_shadow_hz: 'x', phase_guard: 'oui' });
    expect(r.amount).toBe(BORNES_CROSSFEED_PRO.amount.max);
    expect(r.delay_ms).toBe(BORNES_CROSSFEED_PRO.delay_ms.min);
    expect(r.itd_tau_max_us).toBe(BORNES_CROSSFEED_PRO.itd_tau_max_us.min);
    expect(r.head_shadow_hz).toBe(DEFAUTS_CROSSFEED_PRO.head_shadow_hz);
    expect(r.phase_guard).toBe(DEFAUTS_CROSSFEED_PRO.phase_guard);
  });

  it('un réglage enregistré sans `mode` est en mode Tune ; le mode lu est gardé', () => {
    expect(reglagesCrossfeedPro({ enabled: true, amount: 0.5 }).mode).toBe('tune');
    expect(reglagesCrossfeedPro({ mode: 'classique' }).mode).toBe('classique');
    expect(reglagesCrossfeedPro({ mode: 'futur' }).mode).toBe('futur');
    expect(reglagesCrossfeedPro({ mode: 3 }).mode).toBe('tune');
  });

  it('en mode classique, dosage et coupure sont bornés à ceux de libbs2b ; en mode Tune, non', () => {
    const c = reglagesCrossfeedPro({ mode: 'classique', amount: 0.6, head_shadow_hz: 100 });
    expect(c.amount).toBe(BORNES_CLASSIQUE.amount.max);
    expect(c.head_shadow_hz).toBe(BORNES_CLASSIQUE.head_shadow_hz.min);
    expect(reglagesCrossfeedPro({ mode: 'classique', head_shadow_hz: 20000 }).head_shadow_hz).toBe(2000);
    const t = reglagesCrossfeedPro({ mode: 'tune', amount: 0.6, head_shadow_hz: 100 });
    expect(t).toMatchObject({ amount: 0.6, head_shadow_hz: 100 });
    expect(borneCrossfeedPro('delay_ms', 'classique')).toBe(BORNES_CROSSFEED_PRO.delay_ms);
  });

  it('un profil ancien (sans `mode`) se reconnaît en mode Tune', () => {
    const r = reglagesCrossfeedPro({ enabled: true, amount: 0.45 });
    expect(profilCrossfeedProActif(r, [{ id: 'vieux', settings: { amount: 0.45 } }])).toBe('vieux');
    expect(profilCrossfeedProActif({ ...r, mode: 'classique' }, [{ id: 'vieux', settings: { amount: 0.45 } }])).toBeNull();
  });

  it('garde un champ inconnu : un greffon plus récent ne perd rien à l’écriture', () => {
    const r = reglagesCrossfeedPro({ enabled: true, futur_reglage: 42 });
    expect(r.futur_reglage).toBe(42);
    expect(r.enabled).toBe(true);
  });
});

describe('Crossfeed Pro — préréglages', () => {
  it('un préréglage allume le greffon, passe en mode classique, ÉTEINT la garde et le retard adaptatif, et laisse le coupe-bas', () => {
    const base = reglagesCrossfeedPro({ low_cut: true, phase_guard: true, experimental_itd: true, delay_ms: 0.7 });
    for (const p of PRESETS_CROSSFEED_PRO) {
      const r = appliquerPresetCrossfeedPro(base, p);
      expect(r).toMatchObject({ enabled: true, mode: 'classique', amount: p.amount, head_shadow_hz: p.head_shadow_hz });
      expect(r).toMatchObject({ phase_guard: false, experimental_itd: false, low_cut: true });
      expect(presetCrossfeedProActif(r)).toBe(p.key);
      // Le même dosage en mode Tune n'est pas le préréglage.
      expect(presetCrossfeedProActif({ ...r, mode: 'tune' })).toBeNull();
    }
  });

  it('les libellés disent libbs2b', () => {
    expect(PRESETS_CROSSFEED_PRO.map((p) => p.mode)).toEqual(['classique', 'classique', 'classique']);
  });

  it('chaque préréglage reste dans les bornes du greffon', () => {
    for (const p of PRESETS_CROSSFEED_PRO) {
      expect(p.amount).toBeGreaterThanOrEqual(BORNES_CROSSFEED_PRO.amount.min);
      expect(p.amount).toBeLessThanOrEqual(BORNES_CROSSFEED_PRO.amount.max);
      expect(reglagesCrossfeedPro(appliquerPresetCrossfeedPro(DEFAUTS_CROSSFEED_PRO, p))).toMatchObject({ amount: p.amount });
    }
  });

  it('aucun préréglage allumé sur les défauts', () => {
    expect(presetCrossfeedProActif(DEFAUTS_CROSSFEED_PRO)).toBeNull();
  });

  it('le profil actif se reconnaît champ par champ, activation mise à part', () => {
    const r = reglagesCrossfeedPro({ enabled: true, amount: 0.45 });
    const profils = [
      { id: 'a', settings: { amount: 0.44 } },
      { id: 'b', settings: { enabled: false, amount: 0.45 } },
    ];
    expect(profilCrossfeedProActif(r, profils)).toBe('b');
  });
});

describe('Crossfeed Pro — curseur logarithmique de la coupure', () => {
  it('aller-retour aux deux bouts et au défaut', () => {
    const b = BORNES_CROSSFEED_PRO.head_shadow_hz;
    expect(coupureDePosition(positionCoupure(b.min))).toBe(b.min);
    expect(coupureDePosition(positionCoupure(b.max))).toBe(b.max);
    expect(coupureDePosition(positionCoupure(700))).toBe(700);
  });
});

describe('Crossfeed Pro — présence du greffon', () => {
  it('404 `plugin_inconnu` = absent ; 409 = inactif ; `active` décide sinon', () => {
    expect(presenceDepuis(null, { status: 404, code: 'plugin_inconnu' })).toBe('absent');
    expect(presenceDepuis(null, { status: 409, code: 'plugin_unavailable' })).toBe('inactif');
    expect(presenceDepuis(null, new Error('réseau'))).toBe('inconnue');
    expect(presenceDepuis({ active: true })).toBe('actif');
    expect(presenceDepuis({ active: false })).toBe('inactif');
    expect(presenceDepuis({})).toBe('inactif');
  });

  it('l’entrée de la barre n’apparaît que greffon ACTIF, et ne retire rien d’autre', () => {
    const items = [{ view: 'crossfeed' }, { view: 'crossfeedpro' }, { view: 'alarms' }];
    const vues = (p: Parameters<typeof entreesAvecCrossfeedPro>[1]) => entreesAvecCrossfeedPro(items, p).map((i) => i.view);
    expect(vues('actif')).toEqual(['crossfeed', 'crossfeedpro', 'alarms']);
    for (const p of ['absent', 'inactif', 'inconnue'] as const) {
      expect(vues(p)).toEqual(['crossfeed', 'alarms']);
    }
  });
});

describe('Crossfeed Pro — zone stéréo', () => {
  it('lit la disposition EFFECTIVE, puis celle déclarée ; rien de déclaré = on n’affirme rien', () => {
    expect(zoneStereo({ channel_layout: null, channel_layout_status: { effective: 'surround51' } as any })).toBe(false);
    expect(zoneStereo({ channel_layout: 'stereo' })).toBe(true);
    expect(zoneStereo({ channel_layout: 'mono' })).toBe(false);
    expect(zoneStereo({ channel_layout: null })).toBeNull();
    expect(zoneStereo(null)).toBeNull();
  });
});
