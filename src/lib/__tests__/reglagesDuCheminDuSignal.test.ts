// rc12 — « À partir du chemin du signal, accéder aux traitements tels que
// Crossfeed Pro, égaliseur ! » : chaque étape qui a un écran de réglage y
// mène, les autres restent du texte, et le retour rouvre le panneau.
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  cibleDeLEtape,
  decisionRetour,
  etapeInactive,
  ouvrirReglageDeLEtape,
  retourAuChemin,
  cheminARouvrir,
} from '../reglagesDuCheminDuSignal';
import { activeView, mobileNowPlayingOpen } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';

const etape = (e: Record<string, unknown>) => ({ description: '', ...e }) as any;

describe('étape → écran de réglage', () => {
  it.each([
    [{ name: 'DSP' }, 'equalizer'],
    [{ name: 'Crossfeed', code: 'crossfeed' }, 'crossfeed'],
    [{ name: 'Upsampler', code: 'upsampling' }, 'surechantillonnage'],
    [{ name: 'Correction de pièce', code: 'room_correction', kind: 'eq' }, 'roomcorrection'],
    [{ name: 'Compensation', code: 'level_compensation' }, 'equalizer'],
    [{ name: 'Réaffectation des canaux', code: 'channel_remap' }, 'reaffectation'],
    [{ name: 'Réaffectation des canaux', code: 'channel_remap_not_applied' }, 'reaffectation'],
  ])('%o → %s', (e, vue) => {
    expect(cibleDeLEtape(etape(e), 4)).toEqual({ vue });
  });

  it('le ReplayGain ouvre son réglage dans Réglages › Audio', () => {
    expect(cibleDeLEtape(etape({ name: 'ReplayGain' }), 4)).toEqual({
      vue: 'settings', reglages: { tab: 'audio', section: 'localAudio', reglage: 'replaygain' },
    });
  });

  it('conversion de fréquence, fréquence fixe et mono : la fiche de LA zone', () => {
    for (const e of [
      { name: 'Resampler', code: 'rate_conversion' },
      { name: 'Fréquence fixe', code: 'fixed_rate_limit' },
      { name: 'Mono' },
    ]) {
      expect(cibleDeLEtape(etape(e), 7)).toEqual({
        vue: 'settings', reglages: { tab: 'devices', section: 'perZone', zone: 7 },
      });
    }
  });

  it('la RI de la correction de pièce : le bloc FIR de la zone', () => {
    expect(cibleDeLEtape(etape({ name: 'Correction de pièce', code: 'room_correction', kind: 'ir' }), 3)).toEqual({
      vue: 'settings', reglages: { tab: 'devices', section: 'perZone', zone: 3, bloc: 'fir' },
    });
  });

  it('une étape portée par un greffon mène à l\'écran du greffon, par son identifiant', () => {
    expect(cibleDeLEtape(etape({ name: 'Crossfeed Pro', code: 'crossfeed', plugin: 'crossfeed-pro' }), 1)).toEqual({ vue: 'crossfeedpro' });
    expect(cibleDeLEtape(etape({ name: 'Crosstalk', code: 'crossfeed', plugin: 'crosstalk' }), 1)).toEqual({ vue: 'crosstalk' });
    // Greffon sans écran connu : sa carte dans les Extensions.
    expect(cibleDeLEtape(etape({ name: 'Autre', code: 'crossfeed', plugin: 'greffon-inconnu' }), 1)).toEqual({ vue: 'plugins' });
  });

  it('une étape sans réglage ou d\'un genre inconnu ne mène nulle part', () => {
    for (const e of [
      { name: 'Source' }, { name: 'Decoder' }, { name: 'Transcoder', code: 'dsd_natif' },
      { name: 'Volume' }, { name: 'Transport' }, { name: 'Renderer' }, { name: 'Canaux' },
      { name: 'Fondu enchaîné', code: 'crossfade' }, { name: 'Étage du futur', code: 'inconnu' }, { name: '' },
    ]) {
      expect(cibleDeLEtape(etape(e), 1)).toBeNull();
    }
    expect(cibleDeLEtape(null, 1)).toBeNull();
  });

  it('sans zone connue, la fiche par zone s\'ouvre sur la section', () => {
    expect(cibleDeLEtape(etape({ name: 'Mono' }), null)).toEqual({
      vue: 'settings', reglages: { tab: 'devices', section: 'perZone' },
    });
  });

  it('un réglage armé qui ne s\'applique pas est dit inactif', () => {
    expect(etapeInactive(etape({ code: 'room_correction', applied: false }))).toBe(true);
    expect(etapeInactive(etape({ code: 'room_correction', applied: true }))).toBe(false);
    expect(etapeInactive(etape({ name: 'DSP' }))).toBe(false);
  });
});

describe('retour au chemin du signal', () => {
  beforeEach(() => {
    retourAuChemin.set(null);
    cheminARouvrir.set(null);
    mobileNowPlayingOpen.set(false);
    activeView.set('library');
  });

  it('décision pure', () => {
    const r = { depuis: 'library' as const, cible: 'equalizer' as const, origine: 'barre' as const, calque: false };
    expect(decisionRetour(null, 'library')).toBe('rien');
    expect(decisionRetour(r, 'equalizer')).toBe('attendre');
    expect(decisionRetour(r, 'library')).toBe('rouvrir');
    expect(decisionRetour(r, 'queue')).toBe('oublier');
  });

  it('aller puis Précédent : le panneau de la barre se rouvre', () => {
    ouvrirReglageDeLEtape({ vue: 'equalizer' }, 'barre');
    expect(get(activeView)).toBe('equalizer');
    expect(get(cheminARouvrir)).toBeNull();
    activeView.set('library');
    expect(get(cheminARouvrir)).toBe('barre');
    expect(get(retourAuChemin)).toBeNull();
  });

  it('un détour ailleurs oublie le retour', () => {
    ouvrirReglageDeLEtape({ vue: 'crossfeedpro' }, 'barre');
    activeView.set('queue');
    activeView.set('library');
    expect(get(cheminARouvrir)).toBeNull();
  });

  it('les réglages reçoivent leur cible', () => {
    ouvrirReglageDeLEtape({ vue: 'settings', reglages: { tab: 'devices', section: 'perZone', zone: 2 } }, 'lecture');
    expect(get(activeView)).toBe('settings');
    expect(get(v2SettingsTarget)).toEqual({ tab: 'devices', section: 'perZone', zone: 2 });
    v2SettingsTarget.set(null);
  });

  it('« Lecture en cours » en calque : refermée à l\'aller, rouverte au retour', () => {
    mobileNowPlayingOpen.set(true);
    ouvrirReglageDeLEtape({ vue: 'equalizer' }, 'lecture');
    expect(get(mobileNowPlayingOpen)).toBe(false);
    activeView.set('library');
    expect(get(mobileNowPlayingOpen)).toBe(true);
    expect(get(cheminARouvrir)).toBe('lecture');
  });
});
