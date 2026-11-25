// @vitest-environment jsdom
/**
 * rc14 (rc13.91) — retours de Rémi, go de Bertrand du 25/11/2026 :
 *
 *   1. flèches Précédent / Suivant EN HAUT À GAUCHE, 40 px, loin de la loupe ;
 *   2. pochette agrandie à la TAILLE MAXIMALE de la fenêtre, ratio conservé ;
 *   3. « Lecture en cours » : l'icône TESS remplace les boutons EQ / Crossfeed ;
 *   4. menu d'une zone : plus de « Correction de pièce » quand TESS existe ;
 *   5. fenêtre de la zone : lecture groupée à part, DSD / mono / correction
 *      dans TESS, « titres similaires » dans la file d'attente.
 *
 * Un serveur SANS TESS ne perd rien : chaque retrait est gardé par
 * `dspRegroupeDansTess`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Zone } from '../types';
import { flechesDansLaBarre, flechesDansLeCoin, CIBLE_FLECHE_PX } from '../placementFlechesNavigation';
import { ratioPochette, taillePleinCadre } from '../pochettePleinCadre';
import { dspRegroupeDansTess } from '../dspDansTess';
import { entreesMenuZone, type GestesZone } from '../menuZone';
import { capaciteTess } from '../stores/tess';
import { activeView } from '../stores/navigation';
import { greffonTessDemande } from '../stores/tessOuverture';
import { locale } from '../i18n';
import FlechesNavigation from '../../components/v2/FlechesNavigation.svelte';
import ZoneConfigModal from '../../components/partages/ZoneConfigModal.svelte';
import loc_de from '../locales/de';
import loc_el from '../locales/el';
import loc_en from '../locales/en';
import loc_es from '../locales/es';
import loc_fr from '../locales/fr';
import loc_hu from '../locales/hu';
import loc_it from '../locales/it';
import loc_ja from '../locales/ja';
import loc_ko from '../locales/ko';
import loc_nb from '../locales/nb';
import loc_nl from '../locales/nl';
import loc_pl from '../locales/pl';
import loc_ro from '../locales/ro';
import loc_ru from '../locales/ru';
import loc_sv from '../locales/sv';
import loc_tr from '../locales/tr';
import loc_uk from '../locales/uk';
import loc_vi from '../locales/vi';
import loc_zh from '../locales/zh';
import loc_zhHant from '../locales/zh-Hant';

const DELAI_MONTAGE = 60_000;
const src = (chemin: string) => readFileSync(resolve(__dirname, '../..', chemin), 'utf-8');

const LANGUES: Record<string, Record<string, string>> = {
  de: loc_de, el: loc_el, en: loc_en, es: loc_es, fr: loc_fr, hu: loc_hu, it: loc_it, ja: loc_ja, ko: loc_ko,
  nb: loc_nb, nl: loc_nl, pl: loc_pl, ro: loc_ro, ru: loc_ru, sv: loc_sv, tr: loc_tr, uk: loc_uk, vi: loc_vi,
  zh: loc_zh, 'zh-Hant': loc_zhHant,
} as any;

let hote: HTMLElement;
let monte: Record<string, any> | null = null;
beforeEach(() => {
  locale.set('fr');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote.remove();
  capaciteTess.set('inconnue');
  vi.unstubAllGlobals();
});

describe('1 — flèches de navigation en haut à gauche', () => {
  it('dans la barre latérale aux paliers large et étroit, dans le coin au palier tiroir', () => {
    expect(flechesDansLaBarre('large')).toBe(true);
    expect(flechesDansLaBarre('etroit')).toBe(true);
    expect(flechesDansLaBarre('tiroir')).toBe(false);
    const o = { vueMini: false, focus: false, vue: 'library' };
    expect(flechesDansLeCoin('tiroir', o)).toBe(true);
    expect(flechesDansLeCoin('large', o)).toBe(false);
    expect(flechesDansLeCoin('etroit', o)).toBe(false);
    // « Lecture en cours » a son propre retour à cet endroit.
    expect(flechesDansLeCoin('tiroir', { ...o, vue: 'nowplaying' })).toBe(false);
    expect(flechesDansLeCoin('tiroir', { ...o, vueMini: true })).toBe(false);
    expect(flechesDansLeCoin('tiroir', { ...o, focus: true })).toBe(false);
  });

  it('plus dans la grappe de la loupe ; en tête de la barre, avant la marque', () => {
    const shell = src('components/v2/ShellV2.svelte');
    const grappe = shell.slice(shell.indexOf('<div class="av-tr"'), shell.indexOf('<AvatarMenu />'));
    expect(grappe).toContain('<GlobalSearchBar />');
    expect(grappe, 'les flèches ne voisinent plus la loupe').not.toContain('<FlechesNavigation');
    expect(shell).toMatch(/<div class="av-tl"[^>]*><FlechesNavigation \/><\/div>/);
    expect(shell).toContain('brancherRaccourcisNavigation()');
    const barre = src('components/v2/Sidebar.svelte');
    const fleches = barre.indexOf('<FlechesNavigation');
    expect(fleches).toBeGreaterThan(barre.indexOf('<aside class="v2-sidebar'));
    expect(fleches, 'avant la marque : la première rangée').toBeLessThan(barre.indexOf('<div class="brand">'));
    expect(barre).toContain("disposition={enIcones ? 'colonne' : 'ligne'}");
  });

  it(`une cible d'au moins ${CIBLE_FLECHE_PX} px`, () => {
    const css = src('components/v2/FlechesNavigation.svelte');
    const m = css.match(/\.fleche\{width:(\d+)px; height:(\d+)px/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(CIBLE_FLECHE_PX);
    expect(Number(m![2])).toBeGreaterThanOrEqual(CIBLE_FLECHE_PX);
    // Au palier tiroir, l'en-tête laisse la place au coin.
    expect(src('styles/tune-v2.css')).toMatch(/\.v2-shell\.fleches-gauche \.tune-v2 \.v2-top\{padding-left:64px\}/);
  });

  it('empilées dans la barre en icônes', () => {
    monte = mount(FlechesNavigation, { target: hote, props: { disposition: 'colonne' } });
    flushSync();
    const groupe = hote.querySelector('.fleches-nav')!;
    expect(groupe.classList.contains('colonne')).toBe(true);
    expect(groupe.getAttribute('data-disposition')).toBe('colonne');
    expect(hote.querySelectorAll('[data-fleche-nav]').length).toBe(2);
  });
});

describe('2 — pochette plein cadre', () => {
  it('le ratio se lit sur l’image, carré par défaut', () => {
    expect(ratioPochette(600, 300)).toBe(2);
    expect(ratioPochette(0, 300)).toBe(1);
    expect(ratioPochette(undefined, undefined)).toBe(1);
  });

  it('une petite pochette de radio est AGRANDIE à la fenêtre, ratio conservé', () => {
    // 300 × 300 dans une fenêtre 1920 × 1080 : bornée par la hauteur.
    const t = taillePleinCadre(1, 1920, 1080);
    expect(t.largeur).toBe(1080 - 170);
    expect(t.hauteur).toBe(t.largeur);
    // Paysage sur un téléphone en portrait : bornée par la largeur.
    const p = taillePleinCadre(16 / 9, 390, 844);
    expect(p.largeur).toBe(390 - 32);
    expect(p.largeur / p.hauteur).toBeCloseTo(16 / 9, 6);
  });

  it('la visionneuse DIMENSIONNE l’image (plus de plafond à 800 px)', () => {
    const np = src('components/partages/NowPlaying.svelte');
    const regle = np.slice(np.indexOf('  .lightbox-img {'), np.indexOf('}', np.indexOf('  .lightbox-img {')));
    expect(regle).not.toContain('800px');
    expect(regle).toContain('var(--ratio-pochette, 1)');
    expect(regle).toContain('100dvh - 170px');
    expect(regle).toContain('100vw - 32px');
    expect(np).toContain('style:--ratio-pochette={ratioLightbox}');
    expect(np).toContain('ratioPochette(i.naturalWidth, i.naturalHeight)');
  });
});

describe('3 — « Lecture en cours » : l’icône TESS à la place des boutons DSP', () => {
  it('la règle : seulement quand le serveur annonce TESS', () => {
    expect(dspRegroupeDansTess('oui')).toBe(true);
    expect(dspRegroupeDansTess('non')).toBe(false);
    expect(dspRegroupeDansTess('inconnue')).toBe(false);
  });

  it('EQ et Crossfeed gardés par `!dspDansTess`, `PastilleTess` du lot 1 réutilisée', () => {
    const np = src('components/partages/NowPlaying.svelte');
    const rangee = np.slice(np.indexOf('<div class="np-extra-btns" data-np-actions>'), np.indexOf('LE PANNEAU DES CRÉDITS VIT HORS DE LA RANGÉE'));
    expect(rangee).toMatch(/\{#if dspDansTess\}\s*<span class="np-tess" data-np-action="tess">\s*<PastilleTess signalPath=\{zone\?\.signal_path\} zoneId=\{zone\?\.id \?\? null\} pure=\{\$audiophileEnabled\} \/>/);
    expect(rangee).toMatch(/\{#if !dspDansTess\}\s*\{#if \$egaliseurReglable\}\s*<button class="np-credits-btn" data-np-action="eq"/);
    expect(rangee).toMatch(/\{#if !dspDansTess\}\s*<button\s+class="np-credits-btn"\s+data-np-action="crossfeed"/);
    expect(np).toContain("import PastilleTess from '../v2/tess/PastilleTess.svelte'");
    // Pas de réécriture : l'icône ne connaît ni l'état ni l'ouverture.
    expect(rangee).not.toContain('ouvrirTess(');
    expect(np).not.toContain("from '../../lib/etatTraitementTess'");
  });
});

function gestes(): GestesZone {
  return {
    renommer: vi.fn(), image: vi.fn(), reglages: vi.fn(), correction: vi.fn(), latence: vi.fn(),
    appairer: vi.fn(), fusionner: vi.fn(), supprimer: vi.fn(),
  };
}

describe('4 — menu d’une zone', () => {
  const c = { expert: false, appairable: false, jumelle: null };
  it('avec TESS : plus d’entrée « Correction de pièce »', () => {
    expect(entreesMenuZone({ ...c, tess: true }, gestes()).map((e) => e.cle)).not.toContain('v2.zone.roomCorrection');
  });
  it('serveur sans TESS : l’entrée reste (#1427)', () => {
    expect(entreesMenuZone({ ...c, tess: false }, gestes()).map((e) => e.cle)).toContain('v2.zone.roomCorrection');
    expect(entreesMenuZone(c, gestes()).map((e) => e.cle)).toContain('v2.zone.roomCorrection');
  });
  it('l’écran Zones passe la capacité TESS', () => {
    expect(src('components/v2/ZonesV2.svelte')).toContain('tess: dspRegroupeDansTess($capaciteTess)');
  });
});

function zone(over: Partial<Zone> = {}): Zone {
  return {
    id: 7, name: 'Salon', output_type: 'local', output_device_id: 'local:dac', volume: 1, state: 'stopped',
    dsd_mode: 'auto', mono_downmix: false, autoplay_enabled: true, ...over,
  } as Zone;
}

function ouvrir(props: Record<string, any> = {}) {
  const z = zone();
  const onClose = vi.fn();
  monte = mount(ZoneConfigModal, {
    target: hote,
    props: {
      zone: z, allZones: [z, zone({ id: 8, name: 'Cuisine' })], groups: [],
      onClose, onDelete: () => {}, onGroupChanged: () => {}, onRenamed: () => {}, ...props,
    },
  });
  flushSync();
  return { onClose };
}

describe('5 — fenêtre de la zone : la configuration de l’appareil seule', () => {
  it('serveur avec TESS : DSD, mono et correction cèdent la place à « Régler dans TESS »', { timeout: DELAI_MONTAGE }, () => {
    capaciteTess.set('oui');
    activeView.set('home');
    const { onClose } = ouvrir();
    expect(hote.querySelector('[data-reglage-dsd]')).toBeNull();
    expect(hote.querySelector('[data-section="mono"]')).toBeNull();
    expect(hote.textContent).not.toContain(loc_fr['zoneConfig.firTitle']);
    const lien = hote.querySelector<HTMLButtonElement>('[data-regler-dans-tess]')!;
    expect(lien.textContent?.trim()).toBe('Régler dans TESS');
    lien.click();
    expect(onClose).toHaveBeenCalled();
    expect(get(activeView)).toBe('tess');
    expect(get(greffonTessDemande)).toBeNull();
  });

  it('serveur sans TESS : rien ne disparaît', { timeout: DELAI_MONTAGE }, () => {
    capaciteTess.set('non');
    ouvrir();
    expect(hote.querySelector('[data-reglage-dsd] select')).not.toBeNull();
    expect(hote.querySelector('[data-section="mono"]')).not.toBeNull();
    expect(hote.querySelector('[data-regler-dans-tess]')).toBeNull();
  });

  it('la lecture groupée a sa fenêtre ; la configuration n’en garde qu’un lien', { timeout: DELAI_MONTAGE }, () => {
    ouvrir();
    expect(hote.querySelector('[data-section="groupe"]')).toBeNull();
    expect(hote.querySelector('.zone-checklist')).toBeNull();
    hote.querySelector<HTMLButtonElement>('[data-ouvrir-groupe]')!.click();
    flushSync();
    expect(hote.querySelector('[data-section="groupe"]')).not.toBeNull();
    expect(hote.querySelector('[data-renvoi-groupe]'), 'la fenêtre de groupe ne montre que le groupe').toBeNull();
  });

  it('ouverte depuis le sélecteur de zone (« Lecture groupée… ») : le groupe seul', { timeout: DELAI_MONTAGE }, () => {
    ouvrir({ section: 'groupe' });
    expect(hote.querySelector('[data-section="groupe"]')).not.toBeNull();
    expect(hote.querySelector('.zone-check-item')).not.toBeNull();
    expect(hote.querySelector('[data-reglage-dsd]')).toBeNull();
  });

  it('« Continuer avec des titres similaires » n’est plus dans la fenêtre, mais dans la file', { timeout: DELAI_MONTAGE }, () => {
    ouvrir();
    expect(hote.querySelector('[data-radio-fin-de-file]')).toBeNull();
    const file = src('components/v2/QueueV2.svelte');
    expect(file).toContain('data-radio-fin-de-file');
    expect(file).toContain("aria-label={$tr('zoneConfig.radioFinDeFileLabel' as any)}");
    expect(file).toContain('await reglerRadioFinDeFile(z, suivant)');
    expect(src('components/v2/mini/FileMini.svelte')).toContain('await reglerRadioFinDeFile(z, suivant)');
  });
});

describe('les nouveaux libellés, traduits dans les vingt langues', () => {
  it.each(['zoneConfig.reglerDansTess', 'zoneConfig.tessNote'])('%s', (cle) => {
    expect(Object.keys(LANGUES)).toHaveLength(20);
    const vus = new Set<string>();
    for (const [l, d] of Object.entries(LANGUES)) {
      expect(d[cle], `${l} : ${cle}`).toBeTruthy();
      expect(d[cle]).toContain('TESS');
      vus.add(d[cle]);
    }
    // De vraies traductions, pas l'anglais recopié.
    expect(vus.size).toBeGreaterThanOrEqual(19);
  });
});
