// @vitest-environment jsdom
//
// renesenses/tune-web-client#2735 — la fiche d'un appareil (Réglages ›
// Appareils), réorganisée sur décision de Bertrand du 09/11/2026 (« écran
// beaucoup trop chargé », capture de l'Eversolo DMP-A8) :
//   VOLUME / QUALITÉ / CANAUX en vue ; ▸ Avancé, ▸ Correction de pièce,
//   ▸ Appareil repliés, qui gardent leur état ; l'aide derrière ⓘ ; un réglage
//   sans effet pour ce type de sortie caché ; la recherche des Réglages ouvre
//   la section repliée qui porte le réglage visé.
//
// Remplace `casesZoneAlignees2089` : la rangée `.zr` dont il vérifiait
// l'alignement n'existe plus — chaque réglage a sa ligne, et la note DoP
// (#1876) passe sous le sélecteur (`flex-basis:100%`) sans déplacer personne.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extraireFeuilleDeStyle, releverDeclarations, valeurEffective, type Contexte } from '../cascadeCss';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { zones } from '../stores/zones';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
const CLE_REPLIS = 'tune-fiche-appareil-replis';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let zonesServeur: unknown[] = [];

function zone(over: Record<string, unknown> = {}) {
  return {
    id: 21, name: 'Eversolo DMP-A8', output_type: 'dlna', volume: 0.4, state: 'stopped',
    dsd_mode: 'native', strict_bitperfect: false, dlna_radio_title: 'off', upnp_renderer: false,
    volume_limit_safety: 0.9, volume_limit_comfort: 0.9,
    channel_layouts_offered: [{ id: 'stereo', canaux: 2 }],
    channel_layout_status: { requested: null, effective: null, unavailable: false, reason: null, detail: null },
    ...over,
  };
}

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(z: Record<string, unknown>, niveau = 'intermediate'): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: niveau as any }));
  zonesServeur = [z];
  zones.set([z] as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabDevices'],
  );
  (onglet as HTMLButtonElement).click();
  await attendre();
  hote.querySelector<HTMLButtonElement>('button.ligne')?.click();
  await attendre();
  expect(hote.querySelector('#zc-21'), 'carte de zone absente — témoin sans objet').not.toBeNull();
  return hote;
}

beforeEach(() => {
  localStorage.removeItem(CLE_REPLIS);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    const corps = /\/zones(\?|$)/.test(u) ? zonesServeur
      : /\/(profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  localStorage.removeItem(CLE_REPLIS);
  vi.unstubAllGlobals();
});

describe('#2735 — la fiche d’un appareil', () => {
  it('Volume, Qualité et Canaux en vue ; Avancé, Correction de pièce et Appareil repliés', { timeout: 60_000 }, async () => {
    const h = await poser(zone());
    const carte = h.querySelector('#zc-21')!;
    const groupes = [...carte.querySelectorAll('[data-groupe-fiche]')].map((g) => g.getAttribute('data-groupe-fiche'));
    expect(groupes).toEqual(['volume', 'qualite', 'canaux']);
    expect(carte.querySelector('[data-groupe-fiche="volume"] [data-reglage="zone-limites-volume"]')).not.toBeNull();
    expect(carte.querySelector('[data-groupe-fiche="volume"] [data-reglage="zone-volume-fixe"]')).not.toBeNull();
    for (const id of ['zone-dsd', 'zone-debit-max', 'zone-bitperfect-strict']) {
      expect(carte.querySelector(`[data-groupe-fiche="qualite"] [data-reglage="${id}"]`), id).not.toBeNull();
    }
    const replis = [...carte.querySelectorAll<HTMLDetailsElement>('details[data-repli]')];
    expect(replis.map((d) => d.getAttribute('data-repli'))).toEqual(['avance', 'fir', 'appareil']);
    expect(replis.every((d) => !d.open), 'repliées par défaut').toBe(true);
    const avance = carte.querySelector('details[data-repli="avance"]')!;
    for (const id of ['zone-gain', 'zone-decalage-paroles', 'zone-titre-radio-dlna', 'zone-publier-upnp']) {
      expect(avance.querySelector(`[data-reglage="${id}"]`), id).not.toBeNull();
    }
    const appareil = carte.querySelector('details[data-repli="appareil"]')!;
    for (const id of ['zone-appareil', 'zone-photo', 'zone-tune-tested']) {
      expect(appareil.querySelector(`[data-reglage="${id}"]`), id).not.toBeNull();
    }
  });

  it('l’aide passe derrière ⓘ : un bouton nommé, relié à sa bulle par aria-describedby', { timeout: 60_000 }, async () => {
    const h = await poser(zone());
    const ligne = h.querySelector('#zc-21 [data-reglage="zone-bitperfect-strict"]')!;
    const bouton = ligne.querySelector<HTMLButtonElement>('.aide-btn')!;
    expect(bouton.getAttribute('aria-label')).toBe(fr['reglages.aideDe'].replace('{libelle}', fr['bitperfect.strictLabel']));
    const bulle = document.getElementById(bouton.getAttribute('aria-describedby')!)!;
    expect(bulle.getAttribute('role')).toBe('tooltip');
    expect(bulle.textContent).toBe(fr['bitperfect.strictHelp']);
    expect(bulle.classList.contains('ouvert')).toBe(false);
    bouton.click();
    flushSync();
    expect(bulle.classList.contains('ouvert'), 'le clic ouvre la bulle').toBe(true);
    bouton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(bulle.classList.contains('ouvert'), 'Échap la referme').toBe(false);
    // Plus aucun paragraphe d'aide en clair pour ces réglages.
    expect(h.querySelector('#zc-21 .strict-bloc .monote')).toBeNull();
    expect(h.querySelector('#zc-21 .publi-bloc .monote')).toBeNull();
  });

  it('sans effet pour ce type de sortie ⇒ caché : la sortie mono hors sortie locale', { timeout: 60_000 }, async () => {
    const h = await poser(zone());
    expect(h.querySelector('#zc-21 [data-reglage="zone-mono"]')).toBeNull();
    expect(h.querySelector('#zc-21')!.textContent).not.toContain(fr['zoneConfig.monoLocalOnly']);
  });

  it('contre-témoin : sur une sortie locale, la sortie mono est là', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ output_type: 'local' }));
    expect(h.querySelector('#zc-21 [data-groupe-fiche="canaux"] [data-reglage="zone-mono"]')).not.toBeNull();
  });

  it('les sections repliées gardent leur état', { timeout: 60_000 }, async () => {
    const h = await poser(zone());
    const avance = h.querySelector<HTMLDetailsElement>('#zc-21 details[data-repli="avance"]')!;
    avance.open = true;
    avance.dispatchEvent(new Event('toggle'));
    await attendre();
    expect(JSON.parse(localStorage.getItem(CLE_REPLIS) ?? '{}').avance).toBe(true);
    unmount(monte!);
    monte = null;
    hote!.remove();
    const h2 = await poser(zone());
    expect(h2.querySelector<HTMLDetailsElement>('#zc-21 details[data-repli="avance"]')!.open).toBe(true);
    expect(h2.querySelector<HTMLDetailsElement>('#zc-21 details[data-repli="fir"]')!.open).toBe(false);
  });

  it('la recherche ouvre la section repliée qui porte le réglage visé', { timeout: 60_000 }, async () => {
    const h = await poser(zone());
    const champ = h.querySelector<HTMLInputElement>('input[data-recherche-reglages]')!;
    champ.focus();
    champ.value = fr['radioDidl.label'];
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    h.querySelector<HTMLElement>('[data-resultat="zone-titre-radio-dlna"]')!.click();
    await attendre();
    const avance = h.querySelector<HTMLDetailsElement>('#zc-21 details[data-repli="avance"]')!;
    expect(avance.open, 'la section Avancé reste repliée').toBe(true);
    expect(h.querySelector('[data-reglage="zone-titre-radio-dlna"]')!.classList.contains('reglage-eclaire')).toBe(true);
  });
});

describe('#2735 — mise en page des lignes de la fiche', () => {
  const FEUILLE = extraireFeuilleDeStyle(readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8'));
  const REGLES = releverDeclarations(FEUILLE, ['flex-direction', 'flex-basis', 'text-transform', 'justify-content']);
  const CTX: Contexte = { ecran: { largeur: 1440, hauteur: 900 }, survol: false };

  it('une ligne par réglage : libellé à gauche, contrôle à droite', () => {
    expect(valeurEffective(REGLES, ['.zf'], 'flex-direction', CTX)).toBe('row');
    expect(valeurEffective(REGLES, ['.zf'], 'justify-content', CTX)).toBe('space-between');
  });

  it('la note DoP passe SOUS le sélecteur, sans pousser les cases voisines', () => {
    expect(valeurEffective(REGLES, ['.zf .dsd-dop'], 'flex-basis', CTX)).toBe('100%');
  });

  it('plus d’intitulés en capitales collés aux champs (limites de volume)', () => {
    expect(valeurEffective(REGLES, ['.zf > span'], 'text-transform', CTX)).toBeNull();
    expect(valeurEffective(REGLES, ['.trim .tl', '.limites-volume .tl'], 'text-transform', CTX)).toBe('none');
  });
});
