// @vitest-environment jsdom
//
// Bertrand, 05/10/2026 : « Écrire les tags dans les fichiers : inactif par
// défaut ! »
//
// Le serveur (`tune_core::metadata::ecriture_fichiers`, clé
// `library_write_files_enabled`) n'écrit plus dans les fichiers audio tant que
// la case n'est pas cochée ; une clé ABSENTE vaut « désactivé ». Ce banc tient
// le côté client :
//
// 1. la case existe dans Réglages › Bibliothèque › Métadonnées, au niveau
//    débutant, DÉCOCHÉE quand le serveur ne publie rien ;
// 2. la cocher envoie `PATCH { library_write_files_enabled: true }` ;
// 3. le refus 409 `file_writes_disabled` s'affiche dans la langue de
//    l'interface, en nommant le chemin réellement affiché ;
// 4. « enregistré dans Tune, fichiers inchangés » existe dans les onze
//    langues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import {
  CLE_ECRITURE_FICHIERS,
  CODE_REFUS_ECRITURE,
  ecritureFichiersDepuisConfig,
  estRefusEcriture,
  fichiersInchanges,
} from '../ecritureFichiers';
import { writeTrackTags } from '../api/metadata';
import { apiPost } from '../api';
import { SETTING_LEVELS } from '../settingLevels';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let valeurServeur: unknown = undefined;
const patchs: Record<string, unknown>[] = [];

const REFUS = {
  error: 'file_writes_disabled',
  code: 'file_writes_disabled',
  setting: 'library_write_files_enabled',
  message: "Écriture dans les fichiers audio désactivée (Réglages › Bibliothèque) : rien n'a été écrit.",
  file_writes_enabled: false,
};

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
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
  expect(hote.textContent).toContain(fr['settings.musicDirs']);
  return hote;
}

const caseEcriture = (h: HTMLElement) =>
  h.querySelector<HTMLInputElement>(`input[type="checkbox"][data-cle="${CLE_ECRITURE_FICHIERS}"]`);

beforeEach(() => {
  valeurServeur = undefined;
  patchs.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH' && /\/system\/config(\?|$)/.test(u)) {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patchs.push(corps);
      return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (/\/library\/write-tags(\?|$)/.test(u) || /\/dr\/gravure(\?|$)/.test(u)) {
      return new Response(JSON.stringify(REFUS), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }
    const corps = /\/system\/config(\?|$)/.test(u)
      ? { music_dirs: [], quality_split: true, ...(valeurServeur === undefined ? {} : { [CLE_ECRITURE_FICHIERS]: valeurServeur }) }
      : /\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('« Écrire les modifications dans les fichiers audio » — inactif par défaut', () => {
  it('🔴 clé absente, illisible ou fausse : DÉSACTIVÉ ; seul un oui explicite active', () => {
    expect(ecritureFichiersDepuisConfig(undefined)).toBe(false);
    expect(ecritureFichiersDepuisConfig(null)).toBe(false);
    expect(ecritureFichiersDepuisConfig('')).toBe(false);
    expect(ecritureFichiersDepuisConfig('false')).toBe(false);
    expect(ecritureFichiersDepuisConfig(false)).toBe(false);
    expect(ecritureFichiersDepuisConfig(true)).toBe(true);
    expect(ecritureFichiersDepuisConfig('true')).toBe(true);
  });

  it('la clé est celle que lit le serveur', () => {
    expect(CLE_ECRITURE_FICHIERS).toBe('library_write_files_enabled');
    expect(CODE_REFUS_ECRITURE).toBe('file_writes_disabled');
  });

  it('les libellés existent dans les onze langues', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const cle of ['settings.fileWrites', 'settings.fileWritesHint', 'fileWrites.savedInTuneOnly', 'fileWrites.disabledError', 'fileWrites.offHint']) {
        expect(d[cle], `${code} : ${cle}`).toBeTruthy();
      }
    }
  });

  it.each(ONZE_LANGUES)('%s : le refus nomme le chemin réellement affiché (écran › onglet › carte)', (code) => {
    const d = dictionnaire(code);
    const chemin = [d['settings.titleV2'], d['settings.tabLibrary'], d['metadata.title']];
    for (const morceau of chemin) expect(morceau, `${code} : libellé manquant`).toBeTruthy();
    expect(d['fileWrites.disabledError']).toContain(chemin.join(' › '));
    expect(d['fileWrites.offHint']).toContain(chemin.join(' › '));
  });

  it('visible au niveau débutant', () => {
    expect(SETTING_LEVELS['library.fileWrites']).toEqual({ tab: 'library', level: 'beginner' });
  });

  it('la case est rendue dans la carte Métadonnées, DÉCOCHÉE quand le serveur ne publie rien', { timeout: 60_000 }, async () => {
    const h = await poser();
    const c = caseEcriture(h);
    expect(c, 'aucune case « Écrire dans les fichiers audio »').not.toBeNull();
    expect(c!.checked).toBe(false);
    const carte = c!.closest('section.card')!;
    expect(carte.querySelector('h3')?.textContent?.trim()).toBe(fr['metadata.title']);
    expect(carte.textContent).toContain(fr['settings.fileWrites']);
    expect(carte.textContent).toContain(fr['settings.fileWritesHint']);
  });

  it('la valeur du serveur est lue, et cocher envoie PATCH { library_write_files_enabled: false→true }', { timeout: 60_000 }, async () => {
    valeurServeur = 'true';
    let h = await poser();
    expect(caseEcriture(h)!.checked).toBe(true);
    unmount(monte!); monte = null; hote?.remove(); hote = null;

    valeurServeur = undefined;
    h = await poser();
    const c = caseEcriture(h)!;
    c.click();
    await attendre();
    expect(patchs).toContainEqual({ [CLE_ECRITURE_FICHIERS]: true });
    expect(c.checked).toBe(true);
  });

  it('le refus 409 est reconnu et traduit, par les deux clients HTTP', async () => {
    expect(estRefusEcriture(REFUS)).toBe(true);
    expect(estRefusEcriture({ error: 'not found' })).toBe(false);

    const e1 = await writeTrackTags(1).then(() => null, (e) => e as Error);
    expect(e1?.message).toBe(fr['fileWrites.disabledError']);

    const e2 = await apiPost('/library/dr/gravure', {}).then(() => null, (e) => e as Error & { code?: string; status?: number });
    expect(e2?.message).toContain(fr['fileWrites.disabledError']);
    expect(e2?.code).toBe(CODE_REFUS_ECRITURE);
    expect(e2?.status).toBe(409);
  });

  it('« fichiers inchangés » ne se dit que sur un false explicite', () => {
    expect(fichiersInchanges({ status: 'ok', file_writes_enabled: false })).toBe(true);
    expect(fichiersInchanges({ status: 'ok', file_writes_enabled: true })).toBe(false);
    // Serveur antérieur : le champ manque, on n'affirme rien.
    expect(fichiersInchanges({ status: 'ok' })).toBe(false);
    expect(fichiersInchanges(null)).toBe(false);
  });
});
