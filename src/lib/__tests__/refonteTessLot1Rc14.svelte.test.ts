// @vitest-environment jsdom
//
// rc14 — refonte de l'ergonomie de TESS (retours de Rémi, go de Bertrand du
// 25/11/2026), LOT 1 « coquille ». Spécification :
// ~/DEV/coordination/spec-refonte-ux-tess-rc14.md, § 2.1, 2.2, 2.3, 2.9.
//
//   1. MENU (C1) : avec TESS, plus de Studio ; TESS dans le noyau après la
//      File d'attente ; les écrans de greffons sortent ; Convertisseur,
//      Dé-ploc, Métadonnées, Réveils sous « Avancé › Outils » ; État du
//      serveur dans le menu de l'avatar. Sans TESS : menu inchangé.
//   2. OUVERTURE (C3) : un clic sur une étape du chemin du signal ouvre TESS
//      entier, ce greffon (ou cet étage) demandé ; `#tess?plugin=<id>`.
//   3. ICÔNE (C2) : symbole seul, encadrée si un traitement agit, sans cadre
//      en bit-perfect, en PURE, ou avec la seule marge automatique.
//   4. POPUP (C16) : à droite du menu, croix, Échap, focus gardé, l'écran
//      d'en dessous reste `tess`, l'adresse ne change pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('../../components/v2/CrossfeedProV2.svelte', () => ({ default: () => {} }));
vi.mock('../../components/v2/CrosstalkV2.svelte', () => ({ default: () => {} }));

import Sidebar, { CORE, STUDIO, TOUTES_ENTREES, NIVEAU_ENTREE } from '../../components/v2/Sidebar.svelte';
import OrdreBarreLateraleV2 from '../../components/v2/OrdreBarreLateraleV2.svelte';
import { brancherHistoriqueCoquille } from '../historiqueCoquille';
import PastilleTess from '../../components/v2/tess/PastilleTess.svelte';
import CheminTessBarre from '../../components/v2/tess/CheminTessBarre.svelte';
import ReglerEtapeDuChemin from '../../components/partages/ReglerEtapeDuChemin.svelte';
import PopupConfiguration from '../../components/v2/PopupConfiguration.svelte';
import { activeView } from '../stores/navigation';
import { capaciteTess } from '../stores/tess';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import {
  greffonTessDemande, popupConfiguration, ouvrirPopupConfiguration, fermerPopupConfiguration,
} from '../stores/tessOuverture';
import {
  adresseTess, greffonDepuisAdresse, lireGreffonTessAuChargement, greffonTessDeLEtape, selectionDeLEtapeTess,
  ecrireAdresseTess,
} from '../ouvertureTess';
import { classerMenu, OUTILS_HORS_CHAINE, VUES_DANS_LE_MENU_AVATAR, placerTessApresLaFile, remplirLesPlaces } from '../placementMenuTess';
import { traitementActifDuChemin, traitementActifDeLaZone, traitementTessActif } from '../etatTraitementTess';
import { suivrePopupConfiguration, ouvrirEcranDeReglage } from '../popupConfiguration';
import { ouvrirReglageDeLEtape } from '../reglagesDuCheminDuSignal';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const vues = (l: { view: string }[]) => l.map((i) => i.view);

let hote: HTMLDivElement;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: false, status: 404, statusText: 'Not Found',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('home');
  greffonTessDemande.set(null);
  popupConfiguration.set(null);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote.remove();
  capaciteTess.set('inconnue');
  popupConfiguration.set(null);
  greffonTessDemande.set(null);
  activeView.set('home');
  vi.unstubAllGlobals();
});

async function laisserTourner() {
  for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

// ── 1. Menu ───────────────────────────────────────────────────────────────

describe('1. menu sans Studio (C1)', () => {
  it('classement pur : TESS après la File d’attente, Studio vide, outils dans l’ordre décidé', () => {
    const m = classerMenu('oui', CORE, STUDIO);
    const noyau = vues(m.noyau);
    expect(noyau.indexOf('tess')).toBe(noyau.indexOf('queue') + 1);
    expect(m.studio).toEqual([]);
    expect(vues(m.outils)).toEqual(['converter', 'declick', 'metadata', 'alarms']);
    for (const v of ['equalizer', 'crossfeed', 'crossfeedpro', 'crosstalk', 'diagnostics']) {
      expect([...noyau, ...vues(m.outils)], v).not.toContain(v);
    }
    expect(VUES_DANS_LE_MENU_AVATAR).toEqual(['diagnostics']);
    expect(OUTILS_HORS_CHAINE).not.toContain('diagnostics');
  });

  it('contre-épreuve : sans TESS (non, inconnue), noyau et Studio inchangés', () => {
    for (const c of ['non', 'inconnue'] as const) {
      const m = classerMenu(c, CORE, STUDIO);
      expect(vues(m.noyau), c).toEqual(vues(CORE));
      expect(m.outils, c).toEqual([]);
      expect(vues(m.studio), c).toEqual(vues(STUDIO).filter((v) => v !== 'tess'));
    }
  });

  async function monterBarre(capacite: 'oui' | 'non') {
    capaciteTess.set(capacite);
    preferences.update((p) => ({ ...p, settingsLevel: 'expert', barreLaterale: null, barreGroupesReplies: [] }));
    monte = mount(Sidebar as any, { target: hote });
    await laisserTourner();
  }
  const entrees = (sel: string) => Array.from(hote.querySelectorAll<HTMLElement>(`${sel} button.nav[data-vue]`)).map((b) => b.dataset.vue);

  it('🔴 barre montée avec TESS : aucune section Studio, aucun écran de greffon, Outils sous Avancé', async () => {
    await monterBarre('oui');
    const studio = hote.querySelector('nav[data-groupe="studio"]');
    expect(studio === null || !studio.classList.contains('show')).toBe(true);
    expect(entrees('nav[data-groupe="studio"]')).toEqual([]);
    const toutes = entrees('');
    for (const v of ['equalizer', 'crossfeed', 'crossfeedpro', 'crosstalk', 'diagnostics']) expect(toutes, v).not.toContain(v);
    expect(toutes.filter((v) => v === 'tess')).toHaveLength(1);
    expect(toutes.indexOf('tess')).toBe(toutes.indexOf('queue') + 1);
    expect(entrees('nav[data-groupe="outils"]')).toEqual(['converter', 'declick', 'metadata', 'alarms']);
    expect(hote.querySelector('nav[data-groupe="outils"] .grp-label')?.textContent).toContain('Outils');
  });

  it('contre-épreuve : barre montée sans TESS, Studio complet comme avant', async () => {
    await monterBarre('non');
    const studio = entrees('nav[data-groupe="studio"]');
    expect(studio).toContain('equalizer');
    expect(studio).toContain('diagnostics');
    expect(studio).not.toContain('tess');
    expect(hote.querySelector('nav[data-groupe="outils"]')).toBeNull();
  });

  it('le menu de l’avatar porte « État du serveur » avec TESS (source)', async () => {
    const src = lire('../../components/v2/AvatarMenu.svelte');
    expect(src).toMatch(/\{#if \$capaciteTess === 'oui'\}\s*<button class="item" data-avatar-vue="diagnostics" onclick=\{\(\) => \{ activeView\.set\('diagnostics'\)/);
  });
});

// ── 2. Ouverture de TESS ──────────────────────────────────────────────────

const etape = (code: string, x: Record<string, unknown> = {}) => ({
  name: code, code, plugin_id: null, fixed: true, requested: true, effective: true,
  reason: null, detail: null, params: null, latency_frames: null, ...x,
});
const greffon = (id: string, x: Record<string, unknown> = {}) => etape('plugin', { plugin_id: id, fixed: false, params: {}, ...x });
const chemin = (badge: string, steps: unknown[], x: Record<string, unknown> = {}) => ({
  bit_perfect: badge === 'bit_perfect', steps: [], summary: '', ...x,
  tess: { badge, headroom_db: -3, volume: null, steps },
});

describe('2. ouvrir TESS avec le greffon choisi (C3)', () => {
  it('le paramètre de navigation : `#tess?plugin=<id>`, lu et écrit', () => {
    expect(adresseTess('crossfeed-pro')).toBe('#tess?plugin=crossfeed-pro');
    expect(adresseTess(null)).toBe('#tess');
    expect(greffonDepuisAdresse('#tess?plugin=crossfeed')).toBe('crossfeed');
    expect(greffonDepuisAdresse('#library?plugin=crossfeed')).toBeNull();
    expect(greffonDepuisAdresse('#tess?plugin=<script>')).toBeNull();
    expect(lireGreffonTessAuChargement('#tess?plugin=equalizer-parametric')).toBe('equalizer-parametric');
    expect(get(greffonTessDemande)).toBe('equalizer-parametric');
    const history = { state: { tune: 'v2', vue: 'tess' }, replaceState: vi.fn() } as any;
    ecrireAdresseTess('crossfeed', { history });
    expect(history.replaceState).toHaveBeenCalledWith(history.state, '', '#tess?plugin=crossfeed');
  });

  it('🔴 clic sur « Crossfeed » dans le chemin du signal : TESS ouvert, crossfeed demandé, panneau fermé', () => {
    capaciteTess.set('oui');
    const onouvrir = vi.fn();
    monte = mount(CheminTessBarre, {
      target: hote,
      props: { signalPath: chemin('processed_by_tess', [etape('headroom', { params: { mode: 'auto', db: -3 } }), greffon('crossfeed'), etape('volume')]), onouvrir },
    });
    flushSync();
    const b = hote.querySelector<HTMLButtonElement>('[data-tess-etape="crossfeed"] button')!;
    expect(b).not.toBeNull();
    expect(b.type).toBe('button');
    b.click();
    flushSync();
    expect(onouvrir).toHaveBeenCalledOnce();
    expect(get(activeView)).toBe('tess');
    expect(get(greffonTessDemande)).toBe('crossfeed');
  });

  it('un étage fixe (marge) demande l’étage ; les extrémités ne mènent nulle part', () => {
    expect(selectionDeLEtapeTess(etape('headroom'))).toBe('headroom');
    expect(selectionDeLEtapeTess(greffon('room-correction'))).toBe('room-correction');
    expect(selectionDeLEtapeTess(etape('source'))).toBeNull();
    expect(selectionDeLEtapeTess(etape('output'))).toBeNull();
  });

  it('étape historique (« DSP », crossfeed d’un greffon tiers…) → greffon TESS', () => {
    const sp = chemin('processed_by_tess', [greffon('equalizer-parametric')]);
    expect(greffonTessDeLEtape({ name: 'DSP' }, sp)).toBe('equalizer-parametric');
    expect(greffonTessDeLEtape({ name: 'DSP' }, null)).toBe('equalizer-graphic');
    expect(greffonTessDeLEtape({ name: 'Crossfeed Pro', code: 'crossfeed', plugin: 'crossfeed-pro' })).toBe('crossfeed-pro');
    expect(greffonTessDeLEtape({ name: 'X', code: 'room_correction', kind: 'ir' })).toBe('convolution');
    expect(greffonTessDeLEtape({ name: 'Decoder' })).toBeNull();
    expect(greffonTessDeLEtape({ name: 'Upsampler', code: 'upsampling' })).toBeNull();
  });

  it('🔴 « Régler » d’une étape historique avec TESS : TESS entier, greffon demandé', () => {
    capaciteTess.set('oui');
    activeView.set('library');
    const onouvrir = vi.fn();
    monte = mount(ReglerEtapeDuChemin, {
      target: hote,
      props: { etape: { name: 'Crossfeed', description: '', code: 'crossfeed' } as any, zoneId: 5, nom: 'Crossfeed', origine: 'barre', onouvrir },
    });
    flushSync();
    const b = hote.querySelector<HTMLButtonElement>('button[data-ouvre-tess="crossfeed"]')!;
    expect(b).not.toBeNull();
    b.click();
    expect(onouvrir).toHaveBeenCalledOnce();
    expect(get(activeView)).toBe('tess');
    expect(get(greffonTessDemande)).toBe('crossfeed');
  });

  it('contre-épreuve : sans TESS, « Régler » ouvre l’écran historique comme avant', () => {
    capaciteTess.set('non');
    activeView.set('library');
    monte = mount(ReglerEtapeDuChemin, {
      target: hote,
      props: { etape: { name: 'Crossfeed', description: '', code: 'crossfeed' } as any, zoneId: 5, nom: 'Crossfeed', origine: 'barre' },
    });
    flushSync();
    expect(hote.querySelector('[data-ouvre-tess]')).toBeNull();
    hote.querySelector<HTMLButtonElement>('button')!.click();
    expect(get(activeView)).toBe('crossfeed');
    expect(get(greffonTessDemande)).toBeNull();
  });
});

// ── 3. Icône ──────────────────────────────────────────────────────────────

describe('3. icône TESS de la barre de lecture (C2)', () => {
  const auto = etape('headroom', { params: { mode: 'auto', db: -3 } });

  it('règle : greffon effectif ⇒ cadre ; marge auto seule, bit-perfect, PURE, hors TESS ⇒ pas de cadre', () => {
    expect(traitementActifDuChemin(chemin('processed_by_tess', [auto, greffon('crossfeed')]))).toBe(true);
    expect(traitementActifDuChemin(chemin('processed_by_tess', [auto, greffon('crossfeed', { effective: false, reason: 'not_stereo' })]))).toBe(false);
    expect(traitementActifDuChemin(chemin('processed_by_tess', [auto]))).toBe(false);
    expect(traitementActifDuChemin(chemin('processed_by_tess', [etape('headroom', { params: { mode: 'manual', db: -6 } })]))).toBe(true);
    expect(traitementActifDuChemin(chemin('processed_by_tess', [etape('upsampling')]))).toBe(true);
    expect(traitementActifDuChemin(chemin('bit_perfect', []))).toBe(false);
    expect(traitementActifDuChemin(chemin('outside_tess', [auto]))).toBe(false);
    expect(traitementActifDuChemin(chemin('processed_by_tess', [greffon('crossfeed')], { pure: true }))).toBe(false);
    expect(traitementActifDuChemin({ bit_perfect: true, steps: [] })).toBeNull();
    expect(traitementTessActif(chemin('processed_by_tess', [greffon('crossfeed')]), null, true)).toBe(false);
  });

  it('🔴 l’icône dit vrai : `outside_tess` (HQPlayer, Diretta) avec égaliseur et correction de pièce effectifs ⇒ ENCADRÉE', () => {
    const hqp = chemin('outside_tess', [auto, greffon('equalizer-graphic'), greffon('room-correction')]);
    expect(traitementActifDuChemin(hqp)).toBe(true);
    expect(traitementActifDeLaZone({
      badge: 'outside_tess', applicability: { status: 'outside_tess' }, signal_path: [greffon('equalizer-graphic')],
    })).toBe(true);
    // Quel que soit le badge : c'est l'étape effective qui décide.
    expect(traitementActifDuChemin(chemin('bit_perfect', [greffon('crossfeed')]))).toBe(true);
    // … et rien d'effectif hors TESS ⇒ pas de cadre.
    expect(traitementActifDuChemin(chemin('outside_tess', [greffon('crossfeed', { effective: false, reason: 'x' })]))).toBe(false);
  });

  it('icône montée sur une zone hors TESS qui garde l’égaliseur : encadrée', () => {
    capaciteTess.set('oui');
    monte = mount(PastilleTess, { target: hote, props: { signalPath: chemin('outside_tess', [greffon('equalizer-graphic')]), zoneId: 1 } });
    flushSync();
    expect(hote.querySelector('[data-pastille-tess]')!.classList.contains('encadree')).toBe(true);
  });

  it('zone à l’arrêt : l’état vient de `GET /zones/{id}/tess`', () => {
    expect(traitementActifDeLaZone({ badge: 'processed_by_tess', signal_path: [greffon('equalizer-graphic')] })).toBe(true);
    expect(traitementActifDeLaZone({ badge: 'processed_by_tess', signal_path: [auto] })).toBe(false);
    expect(traitementActifDeLaZone(null)).toBeNull();
    expect(traitementTessActif(null, { badge: 'processed_by_tess', signal_path: [greffon('crossfeed')] })).toBe(true);
  });

  function monterIcone(signalPath: unknown, pure = false) {
    capaciteTess.set('oui');
    monte = mount(PastilleTess, { target: hote, props: { signalPath, zoneId: 1, pure } });
    flushSync();
    return hote.querySelector<HTMLButtonElement>('[data-pastille-tess]')!;
  }

  it('🔴 symbole seul, libellé accessible et infobulle ; ENCADRÉE quand un greffon agit', () => {
    const b = monterIcone(chemin('processed_by_tess', [auto, greffon('crossfeed')]));
    expect(b.textContent?.trim()).toBe('');
    expect(b.querySelector('svg')).not.toBeNull();
    expect(b.getAttribute('aria-label')).toBe('Ouvrir TESS');
    expect(b.title).toBe('Ouvrir TESS — un traitement est actif');
    expect(b.classList.contains('encadree')).toBe(true);
    expect(b.dataset.traitementActif).toBe('oui');
    b.click();
    expect(get(activeView)).toBe('tess');
    expect(get(greffonTessDemande)).toBeNull();
  });

  it('PAS de cadre : bit-perfect, marge automatique seule, PURE', () => {
    for (const [sp, pure] of [
      [chemin('bit_perfect', []), false],
      [chemin('processed_by_tess', [auto]), false],
      [chemin('processed_by_tess', [greffon('crossfeed')]), true],
    ] as const) {
      const b = monterIcone(sp, pure);
      expect(b.classList.contains('encadree')).toBe(false);
      expect(b.title).toBe('Ouvrir TESS — aucun traitement actif');
      unmount(monte!); monte = null;
    }
  });

  it('absente sans TESS annoncé', () => {
    capaciteTess.set('non');
    monte = mount(PastilleTess, { target: hote, props: { signalPath: null, zoneId: 1 } });
    flushSync();
    expect(hote.querySelector('[data-pastille-tess]')).toBeNull();
  });

  it('dans la barre de lecture, l’icône est rangée juste avant le chemin du signal et PURE (source)', async () => {
    const src = lire('../../components/partages/TransportBar.svelte');
    const i = src.indexOf('<PastilleTess ');
    expect(i).toBeGreaterThan(-1);
    expect(src.indexOf('<PastilleTess ')).toBe(src.lastIndexOf('<PastilleTess '));
    const led = src.indexOf('class="signal-led"', i);
    const pure = src.indexOf('signal-shield-btn', i);
    expect(led).toBeGreaterThan(i);
    expect(pure).toBeGreaterThan(led);
    expect(src.slice(i, pure)).not.toMatch(/sleep-timer-wrapper/);
  });
});

// ── 4. Popup de configuration ─────────────────────────────────────────────

describe('4. popup de configuration (C16)', () => {
  function monterPopup() {
    monte = mount(PopupConfiguration, { target: hote });
    flushSync();
  }

  it('🔴 Crossfeed Pro dans la popup : croix, Échap, l’écran reste `tess`, l’adresse ne change pas', async () => {
    activeView.set('tess');
    const arret = suivrePopupConfiguration();
    const ouvreur = document.createElement('button');
    document.body.appendChild(ouvreur);
    ouvreur.focus();
    const adresse = location.href;
    monterPopup();
    // Le geste du lot 2 (§ 3.4) : la popup PUIS la vue.
    ouvrirPopupConfiguration('crossfeedpro', 3);
    activeView.set('crossfeedpro');
    flushSync();
    await tick(); flushSync();
    expect(get(activeView)).toBe('tess');
    const p = hote.querySelector<HTMLElement>('[data-popup-configuration="crossfeedpro"]')!;
    expect(p).not.toBeNull();
    const boite = p.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(boite.getAttribute('aria-modal')).toBe('true');
    expect(boite.getAttribute('aria-label')).toBe('Crossfeed Pro');
    // La croix est nommée dans la langue (clé `v2.common.close`, 20 langues).
    const croix = p.querySelector<HTMLButtonElement>('[data-popup-fermer]')!;
    expect(croix.getAttribute('aria-label')).toBe('Fermer');
    expect(croix.title).toBe('Fermer');
    expect(document.activeElement).toBe(boite);
    expect(location.href).toBe(adresse);

    // Échap ferme, le focus revient à l'ouvreur.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(get(popupConfiguration)).toBeNull();
    expect(hote.querySelector('[data-popup-configuration]')).toBeNull();
    expect(document.activeElement).toBe(ouvreur);

    // La croix ferme aussi.
    ouvrirPopupConfiguration('crosstalk');
    flushSync();
    hote.querySelector<HTMLButtonElement>('[data-popup-fermer]')!.click();
    flushSync();
    expect(get(popupConfiguration)).toBeNull();
    expect(get(activeView)).toBe('tess');
    arret();
    ouvreur.remove();
  });

  it('le focus est gardé : Tab sur le dernier élément revient au premier', async () => {
    monterPopup();
    ouvrirPopupConfiguration('crossfeedpro');
    flushSync();
    await tick(); flushSync();
    const fermer = hote.querySelector<HTMLButtonElement>('[data-popup-fermer]')!;
    fermer.focus();
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(fermer);
    fermerPopupConfiguration();
  });

  it('changer d’écran (menu) referme la popup ; une vue inconnue ne s’ouvre pas', () => {
    activeView.set('tess');
    const arret = suivrePopupConfiguration();
    monterPopup();
    ouvrirPopupConfiguration('crossfeedpro');
    flushSync();
    activeView.set('library');
    flushSync();
    expect(get(popupConfiguration)).toBeNull();
    ouvrirPopupConfiguration('inconnue');
    flushSync();
    expect(hote.querySelector('[data-popup-configuration]')).toBeNull();
    fermerPopupConfiguration();
    arret();
  });

  it('Crossfeed Pro depuis le chemin du signal (sans TESS) : popup, pas de navigation', () => {
    activeView.set('library');
    ouvrirReglageDeLEtape({ vue: 'crossfeedpro' }, 'barre');
    expect(get(activeView)).toBe('library');
    expect(get(popupConfiguration)).toEqual({ vue: 'crossfeedpro', zoneId: null });
    ouvrirEcranDeReglage('equalizer');
    expect(get(activeView)).toBe('equalizer');
  });
});

// ── 4 bis. Popup sur la VRAIE coquille (historique du navigateur) ────────

describe('4 bis. popup et historique, coquille branchée', () => {
  let debrancher: (() => void) | null = null;
  let arretPopup: (() => void) | null = null;
  const retour = () => new Promise<void>((res) => window.addEventListener('popstate', () => res(), { once: true }));

  beforeEach(() => {
    history.replaceState(null, '', '/#tess');
    activeView.set('tess');
    debrancher = brancherHistoriqueCoquille();
    arretPopup = suivrePopupConfiguration(window);
  });
  afterEach(() => {
    arretPopup?.(); arretPopup = null;
    debrancher?.(); debrancher = null;
    history.replaceState(null, '', '/');
  });

  it('🔴 geste du lot 2 (popup PUIS vue) : TESS jamais quitté, aucune entrée en trop, Retour ferme SEULEMENT la popup', async () => {
    const vues: string[] = [];
    const arret = activeView.subscribe((v) => vues.push(v));
    vues.length = 0;
    // Le RANG de l'entrée (web#3275) compte les entrées empilées, sans dépendre
    // des entrées « Suivant » qu'un test précédent a pu laisser à jsdom.
    const rang = history.state.n ?? 0;
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'tess' });

    ouvrirPopupConfiguration('crossfeedpro', 1);
    activeView.set('crossfeedpro');
    // Rétabli dans le MÊME tour : la dernière valeur vue est `tess`, l'entrée
    // courante est le marqueur de la popup (copie de TESS), une seule entrée de plus.
    expect(get(activeView)).toBe('tess');
    expect(vues[vues.length - 1]).toBe('tess');
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'tess', popup: 'crossfeedpro' });
    expect(history.state.n).toBe(rang + 1);
    expect(location.hash).toBe('#tess');
    expect(get(popupConfiguration)).toEqual({ vue: 'crossfeedpro', zoneId: 1 });

    // Le Retour du navigateur : la popup se ferme, TESS reste.
    const attendu = retour();
    history.back();
    await attendu;
    flushSync();
    expect(get(popupConfiguration)).toBeNull();
    expect(get(activeView)).toBe('tess');
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'tess' });
    expect(history.state.popup).toBeUndefined();
    arret();
  });

  it('fermée par la croix (ou Échap) : le marqueur est retiré, on est sur l’entrée de TESS', async () => {
    ouvrirPopupConfiguration('crossfeedpro');
    expect(history.state.popup).toBe('crossfeedpro');
    const attendu = retour();
    fermerPopupConfiguration();
    await attendu;
    expect(get(activeView)).toBe('tess');
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'tess' });
    expect(history.state.popup).toBeUndefined();
  });

  it('partie par le menu : le marqueur est REMPLACÉ par l’écran suivant ; Précédent ramène à TESS', async () => {
    const rang = history.state.n ?? 0;
    ouvrirPopupConfiguration('crosstalk');
    activeView.set('library');
    expect(get(popupConfiguration)).toBeNull();
    // Une seule entrée au-dessus de TESS : celle de la Bibliothèque, au rang du marqueur.
    expect(history.state.n).toBe(rang + 1);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'library' });
    expect(history.state.popup).toBeUndefined();
    const attendu = retour();
    history.back();
    await attendu;
    expect(get(activeView)).toBe('tess');
  });
});

// ── 4 ter. Liste libre et Réglages › Interface ───────────────────────────

describe('4 ter. TESS dans la liste libre et dans Réglages › Interface', () => {
  const ordreSansTess = () => {
    // Un ordre enregistré AVANT TESS : favoris remontés en tête, tess absente.
    const v = TOUTES_ENTREES.map((it) => it.view).filter((x) => x !== 'tess' && x !== 'favorites');
    return ['favorites', ...v];
  };

  it('pur : `tess` juste après `queue`, le reste de l’ordre intact ; places des cachées gardées', () => {
    const l = placerTessApresLaFile([{ view: 'a' }, { view: 'queue' }, { view: 'b' }, { view: 'tess' }]);
    expect(l.map((x) => x.view)).toEqual(['a', 'queue', 'tess', 'b']);
    const complete = ['a', 'x', 'b', 'c'];
    expect(remplirLesPlaces(complete, ['c', 'b', 'a'], (v) => v !== 'x')).toEqual(['c', 'x', 'b', 'a']);
  });

  it('🔴 barre réordonnée avant TESS : TESS suit « File d’attente », hors de Sélections, même Sélections repliée', async () => {
    capaciteTess.set('oui');
    preferences.update((p) => ({
      ...p, settingsLevel: 'expert', barreLaterale: { ordre: ordreSansTess(), masquees: [] } as any,
      barreGroupesReplies: ['selections'],
    }));
    monte = mount(Sidebar as any, { target: hote });
    await laisserTourner();
    const toutes = Array.from(hote.querySelectorAll<HTMLElement>('button.nav[data-vue]')).map((b) => b.dataset.vue);
    expect(toutes).toContain('tess');
    expect(toutes.indexOf('tess')).toBe(toutes.indexOf('queue') + 1);
    expect(hote.querySelector('nav[data-groupe="selections"] [data-vue="tess"]')).toBeNull();
    expect(toutes[0]).toBe('favorites');
    preferences.update((p) => ({ ...p, barreLaterale: null, barreGroupesReplies: [] }));
  });

  it('Réglages › Interface : TESS après la File, hors Expert ; État du serveur et écrans de greffons retirés', async () => {
    capaciteTess.set('oui');
    preferences.update((p) => ({ ...p, settingsLevel: 'expert', barreLaterale: { ordre: ordreSansTess(), masquees: [] } as any }));
    monte = mount(OrdreBarreLateraleV2 as any, { target: hote });
    await laisserTourner();
    const lignes = Array.from(hote.querySelectorAll<HTMLElement>('[data-ordre-barre] li[data-vue]')).map((li) => li.dataset.vue);
    expect(lignes.indexOf('tess')).toBe(lignes.indexOf('queue') + 1);
    for (const v of ['diagnostics', 'equalizer', 'crossfeed', 'crossfeedpro', 'crosstalk']) expect(lignes, v).not.toContain(v);
    expect(NIVEAU_ENTREE.tess).toBeUndefined();
    // Un déplacement garde la place des entrées cachées dans l'ordre enregistré.
    const avant = (get(preferences).barreLaterale as any).ordre as string[];
    const voisinDiag = avant[avant.indexOf('diagnostics') - 1];
    hote.querySelector<HTMLButtonElement>('[data-ordre-barre] li[data-vue="favorites"] [data-sens="bas"]')!.click();
    await laisserTourner();
    const apres = (get(preferences).barreLaterale as any).ordre as string[];
    expect(apres[apres.indexOf('diagnostics') - 1]).toBe(voisinDiag);
    expect(apres.slice(0, 2)).toEqual([lignes[1], 'favorites']);
    preferences.update((p) => ({ ...p, barreLaterale: null }));
  });
});

// ── 5. Traductions ────────────────────────────────────────────────────────

describe('5. nouvelles clés dans les vingt langues', () => {
  it('`tess.bar.active`, `tess.bar.idle`, `v2.nav.tools` : présentes et traduites', () => {
    for (const cle of ['tess.bar.active', 'tess.bar.idle', 'v2.nav.tools', 'v2.common.close']) {
      const en = dictionnaire('en')[cle];
      expect(en, cle).toBeTruthy();
      for (const l of ONZE_LANGUES) {
        const v = dictionnaire(l)[cle];
        expect(v, `${l} ${cle}`).toBeTruthy();
        if (l !== 'en') expect(v, `${l} ${cle} copié de l’anglais`).not.toBe(en);
      }
    }
  });
});
