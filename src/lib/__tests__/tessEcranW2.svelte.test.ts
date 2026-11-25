// @vitest-environment jsdom
//
// Lot TESS W2 — l'écran TESS devient UTILISABLE (rc14) :
//   1. VISIBLE face à un serveur qui a TESS, même sans zone courante : la
//      sonde lit `GET /tess/catalog` (T08), qui ne dépend d'aucune zone.
//      Contre-épreuve : serveur sans TESS ⇒ toujours caché.
//   2. PANNEAUX des moteurs existants dans la colonne de droite : égaliseur
//      graphique, crossfeed, réaffectation des canaux. Chaque geste part par
//      `PUT /zones/{id}/tess` avec des réglages COMPLETS (le serveur refuse un
//      profil d'égaliseur incomplet) et sans toucher aux autres greffons.
//   3. FLÈCHES haut / bas : même geste que le glisser-déposer, grisées quand
//      le serveur refuserait (bout de liste, réaffectation en dernier).
//   4. DROITS : un greffon Premium sans licence est verrouillé avec son motif,
//      ses réglages ne partent pas. Contre-épreuve : avec Premium, rien n'est
//      verrouillé.
//   5. ANCIENS ÉCRANS : accessibles depuis le panneau (même zone seulement).
//   6. Les clés neuves existent dans les 20 langues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

import { activeView } from '../stores/navigation';
import { popupConfiguration } from '../stores/tessOuverture';
import { zones, currentZoneId } from '../stores/zones';
import { licenseState } from '../stores/license';
import { capaciteTess, sonderTess } from '../stores/tess';
import { locale } from '../i18n';
import type { ChaineTess, LienGreffonTess } from '../tess';
import {
  avecReglages, reglagesEq, courbeGraphique, avecCourbeGraphique, avecGain, changerTaille,
  reglagesReaffectation, avecCase, avecDimensions, reglagesCrossfeedTess, genrePanneau,
} from '../tessPanneaux';
import { GRILLES_EQ, Q_GRILLE_EQ } from '../eqGrilles';
import { ServeurTessSimule, chaineA1 } from '../tessSimulation';
import TessV2 from '../../components/v2/tess/TessV2.svelte';
import { ECRANS_GREFFONS_NATIFS } from '../greffonsAudioNatifs';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const en = dictionnaire('en');
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
/** Le temps que la main « s'arrête » (350 ms), puis la réponse du `PUT`. */
async function apresLeGeste() {
  await new Promise((r) => setTimeout(r, 420));
  await laisserTourner();
}
async function monter(composant: any) {
  monte = mount(composant, { target: hote! });
  await laisserTourner();
}
const un = <T extends HTMLElement = HTMLElement>(sel: string) => hote!.querySelector<T>(sel);
const putsDeZone = () => serveur.puts.filter((p) => p.zoneId === ZONE);
const dernierPut = () => putsDeZone().at(-1)!.corps as ChaineTess;
const lienDu = (c: ChaineTess, id: string) => (c.plugins ?? []).find((l) => l.id === id) as LienGreffonTess;

function choisir(id: string) {
  un(`[data-tess-greffon="${id}"] .choisir`)!.click();
  flushSync();
}
function changer(el: HTMLInputElement, valeur: string) {
  el.value = valeur;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

beforeEach(() => {
  serveur = new ServeurTessSimule();
  serveur.avecCatalogue = true;
  serveur.zones.set(ZONE, { transport: 'local', chain: chaineA1(), volume_db: -18 });
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    if (/\/tess(\/|\?|$)/.test(u)) return serveur.fetch(u, init);
    return reponseJson([]);
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('tess');
  capaciteTess.set('inconnue');
  zones.set([{ id: ZONE, name: 'atelier', output_type: 'local' } as any, { id: 8, name: 'salon', output_type: 'local' } as any]);
  currentZoneId.set(ZONE);
  licenseState.update((s) => ({ ...s, tier: 'premium' }));
  locale.set('en');
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  licenseState.update((s) => ({ ...s, tier: 'free' }));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── 1. Visible ──────────────────────────────────────────────────────────────

describe('W2 — 1. visible face à un serveur TESS, même sans zone courante', () => {
  it('🔴 `GET /tess/catalog` annonce TESS : `oui` sans aucune zone', async () => {
    expect(await sonderTess(null)).toBe('oui');
    expect(get(capaciteTess)).toBe('oui');
    const urls = (fetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.some((u: string) => /\/tess\/catalog/.test(u))).toBe(true);
    expect(urls.some((u: string) => /\/zones\/\d+\/tess/.test(u))).toBe(false);
  });

  it('contre-épreuve : serveur sans TESS (tout en 404) ⇒ `non`, avec ou sans zone', async () => {
    serveur.avecTess = false;
    expect(await sonderTess(null)).toBe('non');
    capaciteTess.set('inconnue');
    expect(await sonderTess(ZONE)).toBe('non');
  });

  it('contre-épreuve : un catalogue d’une version de contrat inconnue garde l’écran caché', async () => {
    (fetch as any).mockImplementation(async (url: any) => {
      if (/\/tess\/catalog/.test(String(url))) return reponseJson({ contract_version: 2, catalog: { plugins: [] }, plugins: [] });
      return reponseJson([]);
    });
    expect(await sonderTess(ZONE)).toBe('non');
  });
});

// ── 2. Panneaux (fonctions pures) ──────────────────────────────────────────

describe('W2 — 2a. réglages complets, champs inconnus conservés', () => {
  it('🔴 profil d’égaliseur complété (champs requis de `EqProfile`), champ inconnu gardé', () => {
    const r = reglagesEq({ bands: [], futur: 42 });
    for (const k of ['listening', 'room_size', 'speaker_placement', 'bass_gain_db', 'mid_gain_db', 'treble_gain_db']) {
      expect(r).toHaveProperty(k);
    }
    expect(r.futur).toBe(42);
  });

  it('courbe graphique : aller-retour sur les trois grilles, liée sans champ `channel`', () => {
    for (const n of [10, 15, 31]) {
      const gauche = GRILLES_EQ[n].map((_, i) => (i % 3) - 1);
      const s = avecCourbeGraphique({}, { taille: n, gauche, droite: null });
      const bandes = (s as any).bands;
      expect(bandes).toHaveLength(n);
      expect(bandes.every((b: any) => b.channel === undefined && b.q === Q_GRILLE_EQ[n])).toBe(true);
      expect(courbeGraphique(s)).toEqual({ taille: n, gauche, droite: null });
    }
  });

  it('contre-épreuve : une courbe paramétrique n’est PAS prise pour une courbe graphique', () => {
    expect(courbeGraphique({ bands: [{ freq: 1234, gain: 3, q: 0.7, type: 'peak' }] })).toBeNull();
  });

  it('changer de résolution ne remet pas la courbe à plat ; le gain est borné à ±12 dB', () => {
    const c = avecGain({ taille: 10, gauche: Array(10).fill(0), droite: null }, 0, 40);
    expect(c.gauche[0]).toBe(12);
    const c31 = changerTaille(c, 31);
    expect(c31.gauche).toHaveLength(31);
    expect(c31.gauche[GRILLES_EQ[31].indexOf(31.5)]).toBe(12);
  });

  it('🔴 `avecReglages` ne change que le greffon visé ; le reste de la chaîne BRUTE est intact', () => {
    const base = { ...chaineA1(), champFutur: 'x' } as ChaineTess;
    const c = avecReglages(base, 'crossfeed', { amount: 0.2 });
    expect(lienDu(c, 'crossfeed').settings).toEqual({ amount: 0.2 });
    expect(lienDu(c, 'convolution')).toEqual(lienDu(base, 'convolution'));
    expect((c as any).champFutur).toBe('x');
    expect(c.fixed).toEqual(base.fixed);
  });

  it('réaffectation : matrice ramenée aux dimensions, une case change le préréglage en matrice libre', () => {
    const r = reglagesReaffectation({ inputs: 2, outputs: 2, gains_db: [[0, null], [null, 0]], normalize: true, preset: 'identity' });
    expect(r.gains_db).toEqual([[0, null], [null, 0]]);
    const c = avecCase(r, 0, 1, -6) as any;
    expect(c.gains_db[0][1]).toBe(-6);
    expect(c.preset).toBeNull();
    const d = avecDimensions(r, 2, 3) as any;
    expect(d.gains_db).toEqual([[0, null], [null, 0], [null, null]]);
  });

  it('crossfeed : valeurs par défaut du moteur, et bornes des anciens écrans', () => {
    const r = reglagesCrossfeedTess({ amount: 9, cutoff_hz: 5 });
    expect(r.amount).toBe(0.5);
    expect(r.cutoff_hz).toBe(200);
    expect(r.delay_ms).toBe(0.3);
    expect(r.slope_db_per_octave).toBe(6);
  });

  it('chaque moteur existant a son panneau', () => {
    expect(genrePanneau('equalizer-graphic')).toBe('eq-graphique');
    expect(genrePanneau('equalizer-parametric')).toBe('eq-parametrique');
    expect(genrePanneau('equalizer-headphone')).toBe('eq-casque');
    expect(genrePanneau('crossfeed')).toBe('crossfeed');
    expect(genrePanneau('channel-remap')).toBe('reaffectation');
    expect(genrePanneau('room-correction')).toBe('correction-piece');
  });
});

// ── 2. Panneaux (écran) ────────────────────────────────────────────────────

describe('W2 — 2b. les panneaux dans l’écran', () => {
  it('🔴 égaliseur graphique : un curseur ⇒ UN `PUT` avec un profil complet, accepté par le serveur', async () => {
    await monter(TessV2);
    choisir('equalizer-graphic');
    expect(un('[data-tess-panneau="equalizer-graphic"]')).not.toBeNull();
    expect(un('[data-tess-bandes="10"]')).not.toBeNull();
    const avant = putsDeZone().length;
    changer(un<HTMLInputElement>('[data-tess-gain="2"]')!, '4');
    changer(un<HTMLInputElement>('[data-tess-gain="3"]')!, '-2');
    await apresLeGeste();
    // Deux gestes rapprochés : un seul envoi.
    expect(putsDeZone().length).toBe(avant + 1);
    const eq = lienDu(dernierPut(), 'equalizer-graphic').settings as any;
    expect(eq.bands).toHaveLength(10);
    expect(eq.bands[2].gain).toBe(4);
    expect(eq.bands[3].gain).toBe(-2);
    expect(eq.listening).toBe('speakers');
    // Le serveur l'a acceptée : l'écran se redessine depuis SA réponse.
    expect(un('[data-tess-message]')).toBeNull();
    expect(lienDu(serveur.zones.get(ZONE)!.chain, 'equalizer-graphic').settings).toEqual(eq);
    // Les autres greffons partent tels quels.
    expect(lienDu(dernierPut(), 'convolution')).toEqual(lienDu(chaineA1(), 'convolution'));
  });

  it('égaliseur graphique : 31 bandes d’un geste', async () => {
    await monter(TessV2);
    choisir('equalizer-graphic');
    un('[data-tess-taille="31"]')!.click();
    flushSync();
    await apresLeGeste();
    expect((lienDu(dernierPut(), 'equalizer-graphic').settings as any).bands).toHaveLength(31);
    expect(un('[data-tess-bandes="31"]')).not.toBeNull();
  });

  it('🔴 crossfeed : le niveau part dans la chaîne, le reste de ses réglages complété', async () => {
    await monter(TessV2);
    choisir('crossfeed');
    changer(un<HTMLInputElement>('[data-tess-cf="amount"]')!, '0.2');
    await apresLeGeste();
    const cf = lienDu(dernierPut(), 'crossfeed');
    expect((cf.settings as any).amount).toBeCloseTo(0.2);
    expect(cf.settings).toHaveProperty('delay_ms');
    // Régler n'allume pas : la case reste celle de l'utilisateur.
    expect(cf.enabled).toBe(false);
  });

  it('réaffectation : une case de la matrice part dans la chaîne', async () => {
    const z = serveur.zones.get(ZONE)!;
    z.chain = { ...z.chain, plugins: [...(z.chain.plugins ?? []), { id: 'channel-remap', enabled: true, settings: null }] };
    await monter(TessV2);
    choisir('channel-remap');
    expect(un('[data-tess-matrice]')).not.toBeNull();
    changer(un<HTMLInputElement>('[data-tess-case-ra="1-0"]')!, '-3');
    await apresLeGeste();
    const ra = lienDu(dernierPut(), 'channel-remap').settings as any;
    expect(ra.gains_db).toEqual([[0, null], [-3, 0]]);
    expect(ra.inputs).toBe(2);
    expect(ra.preset).toBeNull();
  });
});

// ── 2c. Un geste en attente n'est jamais perdu (relecture de #3367) ───────

describe('W2 — 2c. réglage en attente (350 ms) : jamais perdu, jamais à la mauvaise zone', () => {
  it('🔴 démontage pendant l’attente (« Ouvrir l’écran Égaliseur ») : le réglage part quand même', async () => {
    await monter(TessV2);
    choisir('equalizer-graphic');
    const avant = putsDeZone().length;
    changer(un<HTMLInputElement>('[data-tess-gain="1"]')!, '5');
    unmount(monte!); monte = null;
    await apresLeGeste();
    expect(putsDeZone().length).toBe(avant + 1);
    expect((lienDu(dernierPut(), 'equalizer-graphic').settings as any).bands[1].gain).toBe(5);
  });

  it('🔴 changement de zone pendant l’attente : le réglage part à la zone où il a été fait', async () => {
    serveur.zones.set(8, { transport: 'local', chain: chaineA1() });
    await monter(TessV2);
    choisir('equalizer-graphic');
    changer(un<HTMLInputElement>('[data-tess-gain="1"]')!, '5');
    // Refonte rc14 : plus de sélecteur dans l'écran, c'est la zone courante qui change.
    currentZoneId.set(8);
    await apresLeGeste();
    expect((lienDu(dernierPut(), 'equalizer-graphic').settings as any)?.bands?.[1]?.gain).toBe(5);
    expect(serveur.puts.filter((p) => p.zoneId === 8)).toHaveLength(0);
  });

  it('🔴 deux greffons réglés dans la même fenêtre : les deux réglages arrivent, en un seul envoi', async () => {
    await monter(TessV2);
    const avant = putsDeZone().length;
    choisir('equalizer-graphic');
    changer(un<HTMLInputElement>('[data-tess-gain="2"]')!, '3');
    choisir('crossfeed');
    changer(un<HTMLInputElement>('[data-tess-cf="amount"]')!, '0.2');
    await apresLeGeste();
    expect(putsDeZone().length).toBe(avant + 1);
    const c = dernierPut();
    expect((lienDu(c, 'equalizer-graphic').settings as any).bands[2].gain).toBe(3);
    expect((lienDu(c, 'crossfeed').settings as any).amount).toBeCloseTo(0.2);
  });

  it('un préréglage chargé pendant l’attente l’emporte : le geste d’avant ne s’applique pas à la nouvelle chaîne', async () => {
    serveur.presets = { presets: [{ id: 'soir', name: 'Soir', chain: { version: 1, plugins: [{ id: 'equalizer-graphic', enabled: true, settings: null }] } }] };
    await monter(TessV2);
    choisir('equalizer-graphic');
    changer(un<HTMLInputElement>('[data-tess-gain="1"]')!, '5');
    const avant = putsDeZone().length;
    // Le chargement passe par la route du serveur (W4 / T17), pas par un PUT.
    un('[data-tess-preset]')!.click();
    await laisserTourner();
    un('[data-tess-prereglage="soir"] [data-tess-prereglage-charger]')!.click();
    await apresLeGeste();
    expect(serveur.appelsPreReglages.some((a) => a.methode === 'POST' && a.url.includes(`/zones/${ZONE}/tess/presets/soir/apply`))).toBe(true);
    expect(putsDeZone().length, 'le geste abandonné ne repart pas en PUT').toBe(avant);
    expect(serveur.zones.get(ZONE)!.chain.plugins).toEqual([{ id: 'equalizer-graphic', enabled: true, settings: null }]);
  });

  it('🔴 préréglage REFUSÉ pendant l’attente : le réglage n’est pas perdu, il part, et on le dit avec le motif', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    serveur.premium = false;
    // Convolution est Premium : le serveur refuse ce préréglage en 402.
    serveur.presets = { presets: [{ id: 'cinema', name: 'Cinéma', chain: { version: 1, plugins: [{ id: 'convolution', enabled: true, settings: null }] } }] };
    await monter(TessV2);
    choisir('equalizer-graphic');
    changer(un<HTMLInputElement>('[data-tess-gain="1"]')!, '5');
    un('[data-tess-preset]')!.click();
    await laisserTourner();
    un('[data-tess-prereglage="cinema"] [data-tess-prereglage-charger]')!.click();
    await apresLeGeste();
    expect(serveur.appelsPreReglages.some((a) => a.url.includes('/tess/presets/cinema/apply'))).toBe(true);
    expect((lienDu(dernierPut(), 'equalizer-graphic').settings as any)?.bands?.[1]?.gain, 'le réglage en attente est parti').toBe(5);
    expect(un('[data-tess-avis]')?.textContent).toContain(en['tess.presets.pendingKept']);
    expect(un('[data-tess-message]')?.textContent, 'le motif du refus reste affiché').toContain('Tune Premium');
  });
});

// ── 3. Flèches ─────────────────────────────────────────────────────────────

describe('W2 — 3. flèches haut et bas', () => {
  it('🔴 ↓ sur le premier greffon le fait descendre (PUT), ↑ du premier est grisé', async () => {
    await monter(TessV2);
    expect(un<HTMLButtonElement>('[data-tess-monter="convolution"]')!.disabled).toBe(true);
    un('[data-tess-descendre="convolution"]')!.click();
    await laisserTourner();
    expect((dernierPut().plugins ?? []).map((p) => p.id)).toEqual(['equalizer-graphic', 'convolution', 'crossfeed']);
  });

  it('contre-épreuve : rien ne passe sous la réaffectation, qui reste dernière', async () => {
    const z = serveur.zones.get(ZONE)!;
    z.chain = { ...z.chain, plugins: [...(z.chain.plugins ?? []), { id: 'channel-remap', enabled: true, settings: null }] };
    await monter(TessV2);
    expect(un<HTMLButtonElement>('[data-tess-descendre="crossfeed"]')!.disabled).toBe(true);
    expect(un<HTMLButtonElement>('[data-tess-monter="channel-remap"]')!.disabled).toBe(true);
    expect(un<HTMLButtonElement>('[data-tess-descendre="channel-remap"]')!.disabled).toBe(true);
  });
});

// ── 4. Droits ──────────────────────────────────────────────────────────────

describe('W2 — 4. Premium sans licence : verrouillé, avec son motif', () => {
  it('🔴 compte gratuit : Convolution (Premium) verrouillée dans le chemin et dans le panneau', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    serveur.premium = false;
    await monter(TessV2);
    expect(un('[data-tess-verrou-chemin="convolution"]')).not.toBeNull();
    expect(un('[data-tess-verrou-chemin="equalizer-graphic"]')).toBeNull();
    choisir('convolution');
    expect(un('[data-tess-verrou="convolution"]')?.textContent).toContain('Tune Premium');
    expect(un<HTMLFieldSetElement>('[data-tess-panneau="convolution"] fieldset')!.disabled).toBe(true);
  });

  it('🔴 compte gratuit : un égaliseur paramétrique (Premium) ne part pas, même en forçant le champ', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    serveur.premium = false;
    const z = serveur.zones.get(ZONE)!;
    z.chain = { ...z.chain, plugins: [{ id: 'equalizer-parametric', enabled: false, settings: reglagesEq({ bands: [{ freq: 1000, gain: 2, q: 1, type: 'peak' }] }) }, ...(z.chain.plugins ?? [])] };
    await monter(TessV2);
    choisir('equalizer-parametric');
    expect(un('[data-tess-verrou="equalizer-parametric"]')).not.toBeNull();
    const avant = putsDeZone().length;
    // Les champs sont désactivés ; un événement forcé ne doit rien envoyer.
    const champ = hote!.querySelector<HTMLInputElement>('[data-tess-panneau="equalizer-parametric"] input');
    expect(champ).not.toBeNull();
    changer(champ!, '5');
    await apresLeGeste();
    expect(putsDeZone().length).toBe(avant);
  });

  it('contre-épreuve : avec Premium, rien n’est verrouillé', async () => {
    await monter(TessV2);
    expect(un('[data-tess-verrou-chemin]')).toBeNull();
    choisir('convolution');
    expect(un('[data-tess-verrou]')).toBeNull();
    expect(un<HTMLFieldSetElement>('[data-tess-panneau="convolution"] fieldset')!.disabled).toBe(false);
  });
});

describe('W2 — 4 bis. le verrou suit les droits publiés par le serveur', () => {
  it('🔴 licence locale Premium, mais le serveur dit `entitled: false` : verrouillé', async () => {
    serveur.droitsPublies = { convolution: { entitled: false, reason: 'premium_required' } };
    await monter(TessV2);
    expect(un('[data-tess-verrou-chemin="convolution"]')?.getAttribute('data-tess-motif')).toBe('premium_required');
    choisir('convolution');
    expect(un('[data-tess-verrou="convolution"]')?.textContent).toContain('Tune Premium');
    expect(un<HTMLFieldSetElement>('[data-tess-panneau="convolution"] fieldset')!.disabled).toBe(true);
  });

  it('🔴 cas inverse : licence locale gratuite, mais le serveur dit `entitled: true` : rien n’est verrouillé', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    serveur.premium = true;
    await monter(TessV2);
    expect(un('[data-tess-verrou-chemin]')).toBeNull();
    choisir('convolution');
    expect(un('[data-tess-verrou]')).toBeNull();
    expect(un<HTMLFieldSetElement>('[data-tess-panneau="convolution"] fieldset')!.disabled).toBe(false);
  });

  it('🔴 `plugin_unavailable` : un motif à part (« indisponible »), pas « Premium »', async () => {
    serveur.droitsPublies = { convolution: { entitled: true, available: false, reason: 'plugin_unavailable' } };
    await monter(TessV2);
    const pastille = un('[data-tess-verrou-chemin="convolution"]')!;
    expect(pastille.getAttribute('data-tess-motif')).toBe('plugin_unavailable');
    expect(pastille.textContent!.trim()).toBe(en['tess.unavailableBadge']);
    choisir('convolution');
    const v = un('[data-tess-verrou="convolution"]')!.textContent!;
    expect(v).toContain(en['tess.pluginUnavailable'].replace('{name}', 'Convolution'));
    expect(v).not.toContain('Tune Premium');
  });

  it('🔴 greffon absent de `plugins[]` (liste publiée) : repli sur la licence locale, pas déverrouillé', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    serveur.premium = false;
    serveur.absentsDesDroits = ['convolution'];
    await monter(TessV2);
    expect(un('[data-tess-verrou-chemin="convolution"]')?.getAttribute('data-tess-motif')).toBe('premium_required');
    expect(un('[data-tess-verrou-chemin="equalizer-graphic"]')).toBeNull();
  });

  it('🔴 `reason: premium_required` avec `entitled` nul : verrouillé, même avec une licence locale Premium', async () => {
    serveur.droitsPublies = { convolution: { entitled: null, reason: 'premium_required' } };
    await monter(TessV2);
    expect(un('[data-tess-verrou-chemin="convolution"]')?.getAttribute('data-tess-motif')).toBe('premium_required');
    choisir('convolution');
    expect(un('[data-tess-verrou="convolution"]')?.textContent).toContain('Tune Premium');
  });

  it('serveur ancien, sans `plugins[]` : repli sur la licence locale', async () => {
    serveur.avecDroitsPublies = false;
    serveur.premium = false;
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    await monter(TessV2);
    expect(un('[data-tess-verrou-chemin="convolution"]')?.getAttribute('data-tess-motif')).toBe('premium_required');
    expect(un('[data-tess-verrou-chemin="equalizer-graphic"]')).toBeNull();
  });
});

// ── 5. Anciens écrans ──────────────────────────────────────────────────────

describe('W2 — 5. refonte rc14 : l’égaliseur vit dans TESS, les greffons sans panneau se configurent en popup', () => {
  it('🔴 aucune façade de l’égaliseur ne renvoie à l’ancien écran Égaliseur', async () => {
    const z = serveur.zones.get(ZONE)!;
    z.chain = { ...z.chain, plugins: [
      { id: 'equalizer-parametric', enabled: false, settings: null },
      { id: 'equalizer-headphone', enabled: false, settings: null },
      ...(z.chain.plugins ?? []),
    ] };
    await monter(TessV2);
    for (const id of ['equalizer-graphic', 'equalizer-parametric', 'equalizer-headphone']) {
      choisir(id);
      expect(un('[data-tess-ecran-historique]'), id).toBeNull();
      expect(un('[data-tess-configurer]'), id).toBeNull();
    }
  });

  it('contre-épreuve : le crossfeed garde « Réglages avancés » (ses préréglages nommés)', async () => {
    await monter(TessV2);
    choisir('crossfeed');
    const b = un('[data-tess-ecran-historique]')!;
    expect(b.textContent).toContain(en['tess.advancedSettings']);
    b.click();
    expect(get(activeView)).toBe('crossfeed');
  });

  it('🔴 greffon natif tiers (Crossfeed Pro, Crosstalk…) : « Configurer… » demande la popup, sur la zone de l’écran', async () => {
    for (const id of Object.keys(ECRANS_GREFFONS_NATIFS)) {
      popupConfiguration.set(null);
      activeView.set('tess');
      const z = serveur.zones.get(ZONE)!;
      z.chain = { ...chaineA1(), plugins: [...(chaineA1().plugins ?? []), { id, enabled: false, settings: null }] };
      await monter(TessV2);
      choisir(id);
      expect(un('[data-tess-ecran-historique]'), id).toBeNull();
      const b = un(`[data-tess-configurer="${id}"]`)!;
      expect(b.textContent).toBe(en['tess.configure']);
      b.click();
      expect(get(popupConfiguration), id).toEqual({ vue: ECRANS_GREFFONS_NATIFS[id], zoneId: ZONE });
      // Sans la coquille du lot 1, l'écran historique s'ouvre (repli sans dépendance).
      expect(get(activeView)).toBe(ECRANS_GREFFONS_NATIFS[id]);
      unmount(monte!); monte = null;
    }
  });
});

describe('W8 — 5 bis. ni lien ni « Configurer… » ne contournent le verrou Premium', () => {
  it('🔴 compte gratuit : greffon natif Premium (Crossfeed Pro, Crosstalk) verrouillé ⇒ ni lien ni « Configurer… »', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    serveur.premium = false;
    for (const id of Object.keys(ECRANS_GREFFONS_NATIFS)) {
      const z = serveur.zones.get(ZONE)!;
      z.chain = { ...chaineA1(), plugins: [...(chaineA1().plugins ?? []), { id, enabled: false, settings: null }] };
      await monter(TessV2);
      choisir(id);
      expect(un(`[data-tess-verrou="${id}"]`), id).not.toBeNull();
      expect(un('[data-tess-ecran-historique]'), id).toBeNull();
      expect(un('[data-tess-configurer]'), id).toBeNull();
      unmount(monte!); monte = null;
    }
  });
});

// ── 6. Langues ─────────────────────────────────────────────────────────────

describe('W2 — 6. vingt langues', () => {
  const CLES = [
    'tess.locked', 'tess.moveUpAria', 'tess.moveDownAria', 'tess.noSettings', 'tess.ownScreen',
    'tess.eq.resolution', 'tess.eq.channel', 'tess.eq.left', 'tess.eq.right', 'tess.eq.flat', 'tess.eq.bandAria',
    'tess.eq.tiltNote', 'tess.eq.notGraphic', 'tess.room.computed',
    'tess.cf.amount', 'tess.cf.delay', 'tess.cf.headShadow', 'tess.cf.cutoff', 'tess.cf.slope',
    'tess.remap.inputs', 'tess.remap.outputs', 'tess.remap.normalize', 'tess.remap.hint', 'tess.remap.in', 'tess.remap.out', 'tess.remap.cellAria',
    'tess.conv.filter', 'tess.conv.none',
    'tess.badge.bit_perfect', 'tess.badge.processed_by_tess', 'tess.badge.outside_tess', 'tess.badge.altered_outside_tess',
    'tess.screen.equalizer', 'tess.screen.roomcorrection', 'tess.screen.crossfeed', 'tess.screen.generic',
    'tess.screen.crosstalk', 'tess.screen.reaffectation', 'tess.advancedSettings',
    'tess.unavailableBadge', 'tess.pluginUnavailable', 'tess.presets.pendingKept',
  ];
  it('chaque clé existe, non vide, dans les 20 langues ; les {marques} sont gardées', () => {
    expect(ONZE_LANGUES).toHaveLength(20);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of CLES) {
        expect(d[k], `${l} ${k}`).toBeTruthy();
        for (const m of (en[k].match(/\{\w+\}/g) ?? [])) expect(d[k], `${l} ${k} ${m}`).toContain(m);
      }
    }
  });
});
