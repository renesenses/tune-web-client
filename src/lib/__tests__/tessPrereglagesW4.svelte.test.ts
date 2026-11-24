// @vitest-environment jsdom
//
// Lot TESS W4 (préréglages, maquette A2) sur les routes T17 du serveur.
//
// Ce que ces témoins prouvent, sur l'écran TESS réellement monté et un
// serveur SIMULÉ qui suit les routes de T17 (`lib/tessSimulation`) :
//   1. le bouton « Preset » de l'en-tête ouvre le panneau ; « ACTIVE » est le
//      préréglage de la zone, les autres se chargent ; Pure est traduit ;
//   2. CHARGER passe par la route du serveur (`…/presets/{id}/apply`), pas
//      par un `PUT` de la chaîne copiée côté client : le serveur vérifie les
//      droits et marque l'actif ; l'écran se redessine depuis la réponse ;
//   3. un préréglage Premium sur un compte gratuit : refus affiché, chaîne
//      inchangée ; ce qui ne s'applique pas sur la sortie est dit avec son motif ;
//   4. enregistrer la chaîne courante, renommer, supprimer (confirmation dans
//      le panneau, jamais de boîte native) ;
//   5. « APPLY CHANGES » règle le mode du serveur et l'aide suit ;
//   6. un serveur qui ne sert pas les préréglages : pas de bouton.
//
// Ce qu'ils ne prouvent pas : jsdom ne fait pas de mise en page, et le son
// (pause puis reprise) relève des tests du serveur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import { preferences } from '../stores/preferences';
import { activeView } from '../stores/navigation';
import { zones, currentZoneId } from '../stores/zones';
import { licenseState } from '../stores/license';
import { capaciteTess } from '../stores/tess';
import { locale } from '../i18n';
import { ServeurTessSimule, chaineA1 } from '../tessSimulation';
import type { ChaineTess, PreReglagesTess } from '../tess';
import TessV2 from '../../components/v2/tess/TessV2.svelte';

vi.setConfig({ testTimeout: 60_000 });

const ZONE = 7;

function reponseJson(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let serveur: ServeurTessSimule;
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserTourner(n = 30) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
async function monter() {
  monte = mount(TessV2, { target: hote! });
  await laisserTourner();
}
const tous = (sel: string) => Array.from(hote!.querySelectorAll<HTMLElement>(sel));
const un = (sel: string) => hote!.querySelector<HTMLElement>(sel);
const saisir = (el: HTMLElement, v: string) => {
  (el as HTMLInputElement).value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
};

const casque = (): ChaineTess => ({
  version: 1, bypass_all: false,
  plugins: [{ id: 'crossfeed', enabled: true, settings: { amount: 0.4 } }],
  fixed: { headroom: { mode: 'auto' }, upsampling: { mode: 'off' }, quantization: { dither: 'tpdf' } },
});
const studio = (): ChaineTess => ({
  version: 1, bypass_all: false,
  plugins: [{ id: 'equalizer-parametric', enabled: true, settings: null }],
  fixed: { headroom: { mode: 'auto' }, upsampling: { mode: 'off' }, quantization: { dither: 'tpdf' } },
});
function liste(): PreReglagesTess {
  return {
    apply_mode: 'immediately',
    presets: [
      { id: 'evening-listening', name: 'Evening listening', builtin: false, chain: chaineA1() },
      { id: 'headphones', name: 'Headphones', builtin: false, chain: casque() },
      { id: 'studio', name: 'Studio', builtin: false, chain: studio() },
      { id: 'pure', name: 'Pure — no processing', builtin: true, chain: { version: 1, bypass_all: true, plugins: [] } },
    ],
  };
}

beforeEach(() => {
  serveur = new ServeurTessSimule();
  serveur.zones.set(ZONE, { transport: 'oaat', chain: chaineA1(), volume_db: -18, active_preset: 'evening-listening' });
  serveur.presets = liste();
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    if (/\/tess(\/|\?|$)/.test(u)) return serveur.fetch(u, init);
    return reponseJson([]);
  }));
  vi.stubGlobal('confirm', vi.fn(() => { throw new Error('boîte native interdite'); }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('tess');
  capaciteTess.set('inconnue');
  zones.set([{ id: ZONE, name: 'atelier', output_type: 'oaat' } as any]);
  currentZoneId.set(ZONE);
  licenseState.update((s) => ({ ...s, tier: 'premium' }));
  locale.set('en');
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  licenseState.update((s) => ({ ...s, tier: 'free' }));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function ouvrirLePanneau() {
  await monter();
  const b = un('[data-tess-preset]');
  expect(b, 'bouton Preset de l’en-tête').not.toBeNull();
  b!.click();
  await laisserTourner(5);
  expect(un('[data-tess-prereglages]')).not.toBeNull();
}
const ligne = (id: string) => un(`[data-tess-prereglage="${id}"]`);
const appels = (re: RegExp) => serveur.appelsPreReglages.filter((a) => re.test(a.url));

describe('W4 — préréglages (maquette A2, routes T17)', () => {
  it('le bouton de l’en-tête nomme l’actif et ouvre le panneau : ACTIVE, Load, Pure traduit', async () => {
    await monter();
    expect(un('[data-tess-preset]')!.textContent).toContain('Evening listening');
    expect(un('[data-tess-prereglages]')).toBeNull();
    un('[data-tess-preset]')!.click();
    await laisserTourner(5);
    expect(ligne('evening-listening')!.querySelector('[data-tess-prereglage-actif]')!.textContent).toBe('ACTIVE');
    expect(ligne('evening-listening')!.querySelector('[data-tess-prereglage-charger]')).toBeNull();
    expect(ligne('headphones')!.querySelector('[data-tess-prereglage-charger]')!.textContent!.trim()).toBe('Load');
    expect(tous('[data-tess-prereglage]').map((l) => l.dataset.tessPrereglage))
      .toEqual(['evening-listening', 'headphones', 'studio', 'pure']);
    // Pure, nom du serveur, traduit dans la langue de l'interface.
    unmount(monte!); monte = null;
    locale.set('fr');
    await ouvrirLePanneau();
    expect(ligne('pure')!.textContent).toContain('Pure — aucun traitement');
    expect(un('[data-tess-prereglages] h2')!.textContent).toBe('Préréglages');
  });

  it('🔴 charger passe par la route du serveur (pas de PUT de la chaîne copiée) et redessine depuis la réponse', async () => {
    await ouvrirLePanneau();
    ligne('headphones')!.querySelector<HTMLElement>('[data-tess-prereglage-charger]')!.click();
    await laisserTourner();
    expect(appels(/\/zones\/7\/tess\/presets\/headphones\/apply(\?|$)/)).toHaveLength(1);
    expect(serveur.puts, 'aucun PUT de chaîne côté client').toHaveLength(0);
    expect(serveur.zones.get(ZONE)!.chain.plugins!.map((p) => p.id)).toEqual(['crossfeed']);
    expect(ligne('headphones')!.querySelector('[data-tess-prereglage-actif]')).not.toBeNull();
    expect(ligne('evening-listening')!.querySelector('[data-tess-prereglage-charger]')).not.toBeNull();
    expect(un('[data-tess-preset]')!.textContent).toContain('Headphones');
    // Le chemin du signal suit la réponse : seul le crossfeed reste.
    const greffons = tous('[data-tess-chemin] [data-tess-greffon]').map((e) => e.dataset.tessGreffon);
    if (greffons.length > 0) expect(greffons).toEqual(['crossfeed']);
    expect(un('[data-tess-avis]')).toBeNull();
  });

  it('🔴 préréglage Premium sur un compte gratuit : refus dit, chaîne inchangée ; contre-épreuve Premium', async () => {
    serveur.premium = false;
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    await ouvrirLePanneau();
    ligne('studio')!.querySelector<HTMLElement>('[data-tess-prereglage-charger]')!.click();
    await laisserTourner();
    expect(un('[data-tess-message]')!.textContent).toMatch(/Premium/);
    expect(serveur.zones.get(ZONE)!.chain.plugins!.map((p) => p.id)).toEqual(chaineA1().plugins!.map((p) => p.id));
    expect(serveur.zones.get(ZONE)!.active_preset).toBe('evening-listening');
    // Contre-épreuve.
    serveur.premium = true;
    ligne('studio')!.querySelector<HTMLElement>('[data-tess-prereglage-charger]')!.click();
    await laisserTourner();
    expect(un('[data-tess-message]')).toBeNull();
    expect(serveur.zones.get(ZONE)!.active_preset).toBe('studio');
  });

  it('ce qui ne s’applique pas sur cette sortie est dit avec son motif ; au prochain démarrage, l’écran le dit', async () => {
    serveur.nonAppliques = [{ plugin_id: 'crossfeed', reason: 'stereo_only' }];
    await ouvrirLePanneau();
    ligne('headphones')!.querySelector<HTMLElement>('[data-tess-prereglage-charger]')!.click();
    await laisserTourner();
    const avis = un('[data-tess-avis]')!.textContent!;
    expect(avis).toContain('Crossfeed');
    expect(avis).toContain('Not applied on this output');
    // Contre-épreuve : sans étage écarté, pas d'avis.
    serveur.nonAppliques = [];
    ligne('evening-listening')!.querySelector<HTMLElement>('[data-tess-prereglage-charger]')!.click();
    await laisserTourner();
    expect(un('[data-tess-avis]')).toBeNull();
    // Mode « At next playback » : le chargement le rappelle.
    un('[data-tess-mode="at_next_playback"]')!.click();
    await laisserTourner();
    ligne('headphones')!.querySelector<HTMLElement>('[data-tess-prereglage-charger]')!.click();
    await laisserTourner();
    expect(un('[data-tess-avis]')!.textContent).toContain('next time playback starts');
  });

  it('enregistrer la chaîne courante : nom exigé, POST avec la zone, nouvelle ligne ACTIVE', async () => {
    await ouvrirLePanneau();
    const bouton = un('[data-tess-prereglage-enregistrer]') as HTMLButtonElement;
    expect(bouton.disabled, 'nom vide : bouton inactif').toBe(true);
    saisir(un('[data-tess-prereglage-nouveau]')!, '   ');
    expect(bouton.disabled).toBe(true);
    bouton.click();
    await laisserTourner(5);
    expect(appels(/\/tess\/presets$/)).toHaveLength(0);
    saisir(un('[data-tess-prereglage-nouveau]')!, 'Late night');
    expect(bouton.disabled).toBe(false);
    bouton.click();
    await laisserTourner();
    const post = appels(/\/tess\/presets$/);
    expect(post).toHaveLength(1);
    expect(post[0].corps).toEqual({ name: 'Late night', zone_id: ZONE });
    expect(ligne('late-night')!.querySelector('[data-tess-prereglage-actif]')).not.toBeNull();
    expect((un('[data-tess-prereglage-nouveau]') as HTMLInputElement).value).toBe('');
  });

  it('renommer sur place, puis supprimer avec confirmation dans le panneau (jamais de boîte native)', async () => {
    await ouvrirLePanneau();
    ligne('headphones')!.querySelector<HTMLElement>('[data-tess-prereglage-renommer]')!.click();
    flushSync();
    saisir(ligne('headphones')!.querySelector<HTMLElement>('[data-tess-prereglage-nom]')!, 'Casque du soir');
    ligne('headphones')!.querySelector<HTMLElement>('[data-tess-prereglage-valider]')!.click();
    await laisserTourner();
    expect(appels(/\/tess\/presets\/headphones$/).map((a) => [a.methode, a.corps]))
      .toEqual([['PATCH', { name: 'Casque du soir' }]]);
    expect(ligne('headphones')!.textContent).toContain('Casque du soir');

    // Supprimer : un premier clic ne fait que demander la confirmation.
    ligne('evening-listening')!.querySelector<HTMLElement>('[data-tess-prereglage-supprimer]')!.click();
    await laisserTourner(5);
    expect(appels(/\/tess\/presets\/evening-listening$/)).toHaveLength(0);
    ligne('evening-listening')!.querySelector<HTMLElement>('[data-tess-prereglage-confirmer]')!.click();
    await laisserTourner();
    expect(appels(/\/tess\/presets\/evening-listening$/).map((a) => a.methode)).toEqual(['DELETE']);
    expect(ligne('evening-listening')).toBeNull();
    // L'actif supprimé : l'en-tête revient à « Current chain ».
    expect(un('[data-tess-preset]')!.textContent).toContain('Current chain');
    expect(globalThis.confirm).not.toHaveBeenCalled();
  });

  it('« APPLY CHANGES » règle le mode du serveur ; l’aide suit le mode choisi', async () => {
    await ouvrirLePanneau();
    expect(un('[data-tess-mode="immediately"]')!.getAttribute('aria-checked')).toBe('true');
    expect(un('[data-tess-mode-aide]')!.textContent).toContain('playback pauses');
    un('[data-tess-mode="at_next_playback"]')!.click();
    await laisserTourner();
    expect(appels(/\/tess\/apply-mode$/).map((a) => a.corps)).toEqual([{ apply_mode: 'at_next_playback' }]);
    expect(serveur.presets!.apply_mode).toBe('at_next_playback');
    expect(un('[data-tess-mode="at_next_playback"]')!.getAttribute('aria-checked')).toBe('true');
    expect(un('[data-tess-mode-aide]')!.textContent).toContain('nothing is interrupted');
    // Recliquer le mode déjà choisi n'envoie rien.
    un('[data-tess-mode="at_next_playback"]')!.click();
    await laisserTourner(5);
    expect(appels(/\/tess\/apply-mode$/)).toHaveLength(1);
  });

  it('serveur qui ne sert pas les préréglages : pas de bouton ; contre-épreuve, il apparaît', async () => {
    serveur.presets = null;
    await monter();
    expect(un('[data-tess-chemin]') ?? un('[data-ecran-tess]')).not.toBeNull();
    expect(un('[data-tess-preset]')).toBeNull();
    unmount(monte!); monte = null;
    serveur.presets = liste();
    await monter();
    expect(un('[data-tess-preset]')).not.toBeNull();
  });

  it('suite : « Supprimer ? » s’annule par le bouton Annuler ou par Échap, sans rien envoyer', async () => {
    await ouvrirLePanneau();
    const croix = () => ligne('headphones')!.querySelector<HTMLElement>('[data-tess-prereglage-supprimer]');
    croix()!.click();
    await laisserTourner(5);
    expect(croix()).toBeNull();
    ligne('headphones')!.querySelector<HTMLElement>('[data-tess-prereglage-annuler]')!.click();
    await laisserTourner(5);
    expect(croix(), 'Annuler rend la croix').not.toBeNull();
    // Échap sur la confirmation (qui a le focus).
    croix()!.click();
    await laisserTourner(5);
    const confirmer = ligne('headphones')!.querySelector<HTMLElement>('[data-tess-prereglage-confirmer]')!;
    expect(document.activeElement).toBe(confirmer);
    confirmer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await laisserTourner(5);
    expect(croix(), 'Échap rend la croix').not.toBeNull();
    expect(appels(/\/tess\/presets\/headphones$/)).toHaveLength(0);
    expect(ligne('headphones')).not.toBeNull();
  });

  it('suite : un motif sans greffon s’affiche seul, jamais « (motif) » sans nom', async () => {
    serveur.nonAppliques = [{ plugin_id: null, reason: 'stereo_only' }];
    await ouvrirLePanneau();
    ligne('headphones')!.querySelector<HTMLElement>('[data-tess-prereglage-charger]')!.click();
    await laisserTourner();
    const avis = un('[data-tess-avis]')!.textContent!;
    expect(avis).toContain('Stereo sources only');
    expect(avis).not.toContain('(Stereo sources only)');
    expect(avis).not.toMatch(/:\s*\(/);
  });
});
