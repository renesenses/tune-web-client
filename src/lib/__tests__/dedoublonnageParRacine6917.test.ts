// @vitest-environment jsdom
//
// tune-server-rust#6917 — « Ne regrouper que les copies d'un même dossier de
// musique ». Le serveur lit la clé `library_dedup_same_root_only` (défaut
// `false`) dans le scan et dans « Nettoyage du serveur » ; le client web ne
// l'affichait nulle part. Ce banc tient le côté client :
//
// 1. la case est dans la carte « Nettoyage du serveur », avec son aide ;
// 2. elle lit la valeur publiée par `GET /system/config` ;
// 3. la basculer envoie `PATCH /system/config { library_dedup_same_root_only }` ;
// 4. l'état en vigueur est rappelé avant de lancer le nettoyage ;
// 5. un refus du serveur remet la case en place ;
// 6. les libellés existent dans toutes les langues du client.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { CLE_DEDOUBLONNAGE_PAR_RACINE, dedoublonnageParRacineDepuisConfig } from '../dedoublonnageParRacine';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let valeurServeur: unknown = undefined;
let refuserLePatch = false;
const patchs: Record<string, unknown>[] = [];

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  // La carte « Nettoyage du serveur » est au niveau intermédiaire.
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabLibrary'],
  );
  expect(onglet, 'onglet Bibliothèque introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  return hote;
}

function demonter() {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
}

const carte = (h: HTMLElement) => h.querySelector<HTMLElement>('[data-section="libraryCleanup"]');
const laCase = (h: HTMLElement) =>
  carte(h)?.querySelector<HTMLInputElement>(`input[type="checkbox"][data-cle="${CLE_DEDOUBLONNAGE_PAR_RACINE}"]`) ?? null;
const etat = (h: HTMLElement) => carte(h)?.querySelector<HTMLElement>('[data-etat-dedup-racine]') ?? null;

beforeEach(() => {
  valeurServeur = undefined;
  refuserLePatch = false;
  patchs.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH' && /\/system\/config(\?|$)/.test(u)) {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patchs.push(corps);
      if (refuserLePatch && CLE_DEDOUBLONNAGE_PAR_RACINE in corps) {
        return new Response('{"error":"boom"}', { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const corps = /\/system\/config(\?|$)/.test(u)
      ? { music_dirs: [], quality_split: true, ...(valeurServeur === undefined ? {} : { [CLE_DEDOUBLONNAGE_PAR_RACINE]: valeurServeur }) }
      : /\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(() => {
  demonter();
  vi.unstubAllGlobals();
});

describe('« Ne regrouper que les copies d’un même dossier de musique » (#6917)', () => {
  it('la clé est celle que lit le serveur', () => {
    expect(CLE_DEDOUBLONNAGE_PAR_RACINE).toBe('library_dedup_same_root_only');
  });

  it('lue comme le serveur la lit : absente ou illisible, ÉTEINTE', () => {
    for (const v of [undefined, null, '', false, 0, 'false', 'off', 'n’importe quoi']) {
      expect(dedoublonnageParRacineDepuisConfig(v), JSON.stringify(v)).toBe(false);
    }
    for (const v of [true, 1, 'true', '"true"', ' ON ', 'yes', '1']) {
      expect(dedoublonnageParRacineDepuisConfig(v), JSON.stringify(v)).toBe(true);
    }
  });

  it('les libellés existent dans toutes les langues du client', () => {
    const cles = [
      'settings.dedupSameRootOnly',
      'settings.dedupSameRootOnlyHint',
      'settings.dedupSameRootOnlyStateOn',
      'settings.dedupSameRootOnlyStateOff',
    ];
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const cle of cles) expect(d[cle], `${code} : ${cle}`).toBeTruthy();
    }
  });

  it('l’aide dit les deux cas et qu’aucun fichier n’est effacé', () => {
    const aide = fr['settings.dedupSameRootOnlyHint'];
    expect(aide).toContain('NAS');
    expect(aide).toMatch(/^Activé/);
    expect(aide).toContain('Désactivé');
    expect(aide).toContain('Aucun fichier n\'est jamais effacé');
  });

  it('la case est dans la carte du nettoyage, avec son aide, DÉCOCHÉE par défaut', { timeout: 60_000 }, async () => {
    const h = await poser();
    const c = laCase(h);
    expect(c, 'aucune case dans « Nettoyage du serveur »').not.toBeNull();
    expect(c!.checked).toBe(false);
    const ligne = c!.closest('.row')!;
    expect(ligne.textContent).toContain(fr['settings.dedupSameRootOnly']);
    expect(ligne.textContent).toContain(fr['settings.dedupSameRootOnlyHint']);
    expect(etat(h)!.textContent).toContain(fr['settings.dedupSameRootOnlyStateOff']);
  });

  it('l’état en vigueur est rappelé AVANT le bouton de nettoyage', { timeout: 60_000 }, async () => {
    valeurServeur = true;
    const h = await poser();
    const e = etat(h)!;
    expect(e.textContent).toContain(fr['settings.dedupSameRootOnlyStateOn']);
    const bouton = [...carte(h)!.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === fr['diagnostics.cleanupServer'],
    )!;
    expect(bouton, 'bouton de nettoyage introuvable').toBeDefined();
    expect(e.compareDocumentPosition(bouton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('la valeur du serveur est lue, et la case écrit PATCH { library_dedup_same_root_only }', { timeout: 60_000 }, async () => {
    valeurServeur = true;
    let h = await poser();
    expect(laCase(h)!.checked).toBe(true);
    demonter();

    valeurServeur = false;
    h = await poser();
    const c = laCase(h)!;
    expect(c.checked).toBe(false);
    c.click();
    await attendre();
    expect(patchs).toContainEqual({ [CLE_DEDOUBLONNAGE_PAR_RACINE]: true });
    expect(c.checked).toBe(true);
    expect(etat(h)!.textContent).toContain(fr['settings.dedupSameRootOnlyStateOn']);

    c.click();
    await attendre();
    expect(patchs).toContainEqual({ [CLE_DEDOUBLONNAGE_PAR_RACINE]: false });
    expect(etat(h)!.textContent).toContain(fr['settings.dedupSameRootOnlyStateOff']);
  });

  it('un refus du serveur remet la case en place et le dit', { timeout: 60_000 }, async () => {
    refuserLePatch = true;
    const h = await poser();
    const c = laCase(h)!;
    c.click();
    await attendre(8);
    expect(c.checked, 'la case revient à l’état du serveur').toBe(false);
    expect(carte(h)!.textContent).toContain(fr['settings.errSaveFailed']);
    expect(etat(h)!.textContent).toContain(fr['settings.dedupSameRootOnlyStateOff']);
  });
});
