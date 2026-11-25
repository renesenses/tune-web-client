// @vitest-environment jsdom
//
// rc14 (Rémi, GO de Bertrand) — préréglages de TESS : « Enregistrer » écrase
// le préréglage d'origine dès qu'un réglage s'en écarte, « Recharger » y
// revient, un préréglage livré (« Pure ») propose « Enregistrer sous… ».
//
// Prouvé ici : le panneau monté seul (boutons, confirmation légère, refus
// d'écraser un préréglage livré), puis l'écran TESS monté sur le serveur
// simulé : l'indicateur « modifié » de l'en-tête et le `PUT
// /tess/presets/{id}` réellement envoyé. Le serveur, lui, est prouvé par
// `tess_prereglage_ecraser_rc14.rs` (tune-server-rust).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import { preferences } from '../stores/preferences';
import { activeView } from '../stores/navigation';
import { zones, currentZoneId } from '../stores/zones';
import { licenseState } from '../stores/license';
import { capaciteTess } from '../stores/tess';
import { locale } from '../i18n';
import { ServeurTessSimule, chaineA1 } from '../tessSimulation';
import { etatDuPreReglage, type ChaineTess, type PreReglagesTess } from '../tess';
import PreReglagesTess from '../../components/v2/tess/PreReglagesTess.svelte';
import TessV2 from '../../components/v2/tess/TessV2.svelte';
import loc_en from '../locales/en';

vi.setConfig({ testTimeout: 60_000 });

const ZONE = 7;
const casque = (): ChaineTess => ({
  version: 1, bypass_all: false,
  plugins: [{ id: 'crossfeed', enabled: true, settings: { amount: 0.4 } }],
  fixed: { headroom: { mode: 'auto' }, upsampling: { mode: 'off' }, quantization: { dither: 'tpdf' } },
});
function liste(): PreReglagesTess {
  return {
    apply_mode: 'immediately',
    presets: [
      { id: 'headphones', name: 'Headphones', builtin: false, chain: casque() },
      { id: 'evening-listening', name: 'Evening listening', builtin: false, chain: chaineA1() },
      { id: 'pure', name: 'Pure — no processing', builtin: true, chain: { version: 1, bypass_all: true, plugins: [] } },
    ],
  };
}

let hote: HTMLDivElement;
let monte: Record<string, any> | null = null;
const un = (sel: string) => hote.querySelector<HTMLElement>(sel);
const ligne = (id: string) => hote.querySelector<HTMLElement>(`[data-tess-prereglage="${id}"]`)!;
async function laisserTourner(n = 30) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  locale.set('en');
  vi.stubGlobal('confirm', vi.fn(() => { throw new Error('boîte native interdite'); }));
});
afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('etatDuPreReglage', () => {
  it('l’origine prime sur « ACTIVE » ; un serveur ancien n’est jamais « modifié »', () => {
    expect(etatDuPreReglage({ active_preset: null, base_preset: 'a', preset_modified: true })).toEqual({ id: 'a', modifie: true });
    expect(etatDuPreReglage({ active_preset: 'a', base_preset: 'a', preset_modified: false })).toEqual({ id: 'a', modifie: false });
    expect(etatDuPreReglage({ active_preset: 'a' })).toEqual({ id: 'a', modifie: false });
    expect(etatDuPreReglage({ active_preset: null })).toEqual({ id: null, modifie: false });
    expect(etatDuPreReglage(null)).toEqual({ id: null, modifie: false });
  });
});

describe('panneau Préréglages : Enregistrer et Recharger', () => {
  function monterPanneau(props: Record<string, any>) {
    const appels = { load: vi.fn(), save: vi.fn(), overwrite: vi.fn() };
    monte = mount(PreReglagesTess, {
      target: hote,
      props: {
        liste: liste(), onLoad: appels.load, onSave: appels.save, onOverwrite: appels.overwrite,
        onRename: () => {}, onDelete: () => {}, ...props,
      },
    });
    flushSync();
    return appels;
  }

  it('origine retouchée : « modifié », Enregistrer (après confirmation) et Recharger', () => {
    const a = monterPanneau({ actif: null, origine: 'headphones', modifie: true });
    const l = ligne('headphones');
    expect(l.querySelector('[data-tess-prereglage-modifie]')?.textContent).toContain(loc_en['tess.presets.modified']);
    expect(l.querySelector('[data-tess-prereglage-charger]'), '« Charger » devient « Recharger »').toBeNull();
    const recharger = l.querySelector<HTMLButtonElement>('[data-tess-prereglage-recharger]')!;
    expect(recharger.textContent?.trim()).toBe(loc_en['tess.presets.reload']);
    recharger.click();
    expect(a.load).toHaveBeenCalledWith('headphones');
    // Enregistrer : une confirmation légère dans la ligne, puis l'écrasement.
    l.querySelector<HTMLButtonElement>('[data-tess-prereglage-ecraser]')!.click();
    flushSync();
    expect(a.overwrite).not.toHaveBeenCalled();
    const confirmer = ligne('headphones').querySelector<HTMLButtonElement>('[data-tess-prereglage-confirmer-ecraser]')!;
    expect(confirmer.textContent?.trim()).toBe(loc_en['tess.presets.confirmOverwrite'].replace('{name}', 'Headphones'));
    expect(document.activeElement).toBe(confirmer);
    confirmer.click();
    flushSync();
    expect(a.overwrite).toHaveBeenCalledWith('headphones');
    expect(a.save, 'aucune nouvelle ligne').not.toHaveBeenCalled();
    // Les autres préréglages se chargent toujours.
    expect(ligne('evening-listening').querySelector('[data-tess-prereglage-charger]')).not.toBeNull();
    expect(ligne('evening-listening').querySelector('[data-tess-prereglage-modifie]')).toBeNull();
  });

  it('Annuler (ou Échap) n’écrase rien', () => {
    const a = monterPanneau({ actif: null, origine: 'headphones', modifie: true });
    ligne('headphones').querySelector<HTMLButtonElement>('[data-tess-prereglage-ecraser]')!.click();
    flushSync();
    ligne('headphones').querySelector<HTMLButtonElement>('[data-tess-prereglage-annuler-ecraser]')!.click();
    flushSync();
    expect(ligne('headphones').querySelector('[data-tess-prereglage-confirmer-ecraser]')).toBeNull();
    ligne('headphones').querySelector<HTMLButtonElement>('[data-tess-prereglage-ecraser]')!.click();
    flushSync();
    ligne('headphones').querySelector<HTMLElement>('[data-tess-prereglage-confirmer-ecraser]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(a.overwrite).not.toHaveBeenCalled();
  });

  it('un préréglage livré (« Pure ») ne s’écrase pas : « Enregistrer sous… » remplit le nom', () => {
    const a = monterPanneau({ actif: null, origine: 'pure', modifie: true });
    const l = ligne('pure');
    expect(l.querySelector('[data-tess-prereglage-ecraser]'), 'pas d’écrasement de Pure').toBeNull();
    const sous = l.querySelector<HTMLButtonElement>('[data-tess-prereglage-enregistrer-sous]')!;
    expect(sous.textContent?.trim()).toBe(loc_en['tess.presets.saveAs']);
    expect(sous.title).toBe(loc_en['tess.presets.builtinReadOnly']);
    sous.click();
    flushSync();
    const champ = un('[data-tess-prereglage-nouveau]') as HTMLInputElement;
    const attendu = loc_en['tess.presets.copyName'].replace('{name}', loc_en['tess.presets.pure']);
    expect(champ.value).toBe(attendu);
    expect(document.activeElement).toBe(champ);
    un('[data-tess-prereglage-enregistrer]')!.click();
    expect(a.save).toHaveBeenCalledWith(attendu);
    expect(a.overwrite).not.toHaveBeenCalled();
    // Recharger reste offert.
    expect(l.querySelector('[data-tess-prereglage-recharger]')).not.toBeNull();
  });

  it('non retouché : « ACTIVE », ni Enregistrer ni Recharger', () => {
    monterPanneau({ actif: 'headphones', origine: 'headphones', modifie: false });
    const l = ligne('headphones');
    expect(l.querySelector('[data-tess-prereglage-actif]')).not.toBeNull();
    expect(l.querySelector('[data-tess-prereglage-ecraser]')).toBeNull();
    expect(l.querySelector('[data-tess-prereglage-recharger]')).toBeNull();
    expect(l.querySelector('[data-tess-prereglage-modifie]')).toBeNull();
  });
});

describe('écran TESS : l’indicateur « modifié » et le PUT d’écrasement', () => {
  function reponseJson(corps: unknown, status = 200) {
    return {
      ok: status < 300, status, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }
  class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

  it('retouché : « modifié » dans l’en-tête ; Enregistrer envoie PUT /tess/presets/{id} avec la zone', async () => {
    const serveur = new ServeurTessSimule();
    serveur.zones.set(ZONE, { transport: 'oaat', chain: chaineA1(), volume_db: -18, active_preset: null });
    serveur.presets = liste();
    let modifie = true;
    // Le serveur simulé (T17) ne connaît pas encore l'origine : on l'ajoute à sa réponse.
    const reponseDeBase = serveur.reponse.bind(serveur);
    serveur.reponse = (id: number) => ({
      ...reponseDeBase(id), base_preset: 'headphones', preset_modified: modifie, active_preset: modifie ? null : 'headphones',
    });
    const puts: { url: string; corps: any }[] = [];
    vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
    if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
    vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
      const u = String(url);
      const methode = (init?.method ?? 'GET').toUpperCase();
      if (/\/tess\/presets\/headphones$/.test(u) && methode === 'PUT') {
        puts.push({ url: u, corps: JSON.parse(String(init?.body)) });
        modifie = false;
        return reponseJson({ ...liste().presets[0], chain: chaineA1() });
      }
      if (/\/tess(\/|\?|$)/.test(u)) return serveur.fetch(u, init);
      return reponseJson([]);
    }));
    activeView.set('tess');
    capaciteTess.set('inconnue');
    zones.set([{ id: ZONE, name: 'atelier', output_type: 'oaat' } as any]);
    currentZoneId.set(ZONE);
    licenseState.update((s) => ({ ...s, tier: 'premium' }));
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
    monte = mount(TessV2, { target: hote });
    await laisserTourner();
    const entete = un('[data-tess-preset]')!;
    expect(entete.textContent).toContain('Headphones');
    expect(un('[data-tess-preset-modifie]')?.textContent).toBe(loc_en['tess.presets.modified']);
    entete.click();
    await laisserTourner(5);
    ligne('headphones').querySelector<HTMLButtonElement>('[data-tess-prereglage-ecraser]')!.click();
    flushSync();
    ligne('headphones').querySelector<HTMLButtonElement>('[data-tess-prereglage-confirmer-ecraser]')!.click();
    await laisserTourner();
    expect(puts).toEqual([{ url: expect.stringContaining('/tess/presets/headphones'), corps: { zone_id: ZONE } }]);
    expect(un('[data-tess-preset-modifie]'), 'enregistré : plus « modifié »').toBeNull();
    licenseState.update((s) => ({ ...s, tier: 'free' }));
  });
});
