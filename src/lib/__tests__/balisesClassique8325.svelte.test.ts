// @vitest-environment jsdom
//
// tune-server-rust#8325 / ESL63P — Réglages › Bibliothèque › Balises du
// classique : puces éditables par rôle, choix BAND, « Revenir aux valeurs
// par défaut », validation alignée sur le serveur, 15 langues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getBalisesClassique: vi.fn(),
  setBalisesClassique: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));

import BalisesClassiqueV2 from '../../components/v2/BalisesClassiqueV2.svelte';
import { locale } from '../i18n';
import { DEFAUTS_CLASSIQUE, copieBalises, memesBalises, nomDeCle, normaliserBalise } from '../balisesClassique';
import { V2_SETTINGS } from '../v2Settings';

const LANGUES = ['de', 'el', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nb', 'pl', 'ro', 'sv', 'vi', 'zh'];
const dictionnaires = import.meta.glob('../locales/*.ts', { eager: true }) as Record<string, { default: Record<string, string> }>;

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };

let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

function etat(reglage = DEFAUTS_CLASSIQUE, reread = false) {
  return { classical_tags: copieBalises(reglage), defaults: copieBalises(DEFAUTS_CLASSIQUE), reread_started: reread };
}

async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(BalisesClassiqueV2, { target: hote });
  await respirer();
}

const puces = (role: string) => [...hote.querySelectorAll(`[data-role=${role}] [data-balise]`)].map((p) => p.getAttribute('data-balise'));
const champ = (role: string) => hote.querySelector<HTMLInputElement>(`[data-role=${role}] input[type=text]`)!;
const boutonAjouter = (role: string) => hote.querySelector<HTMLButtonElement>(`[data-role=${role}] .ajout button`)!;
const enregistrer = () => hote.querySelector<HTMLButtonElement>('[data-enregistrer]')!;
const defauts = () => hote.querySelector<HTMLButtonElement>('[data-defauts]')!;

function saisir(role: string, texte: string) {
  const c = champ(role);
  c.value = texte;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  boutonAjouter(role).click();
  flushSync();
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getBalisesClassique.mockResolvedValue(etat());
  mocks.setBalisesClassique.mockImplementation(async (corps: any) =>
    etat(Object.keys(corps).length ? { ...DEFAUTS_CLASSIQUE, ...corps } : DEFAUTS_CLASSIQUE, Object.keys(corps).length > 0));
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  document.body.innerHTML = '';
});

describe('balisesClassique — validation alignée sur le serveur', () => {
  it('met en capitales, refuse les caractères hors A-Z, BAND, les doublons sans préfixe', () => {
    expect(normaliserBalise(' txxx:chorus ', [])).toEqual({ nom: 'TXXX:CHORUS' });
    expect(normaliserBalise('CHŒUR', [])).toEqual({ refus: 'chars' });
    expect(normaliserBalise('band', [])).toEqual({ refus: 'band' });
    expect(normaliserBalise('TXXX:BAND', [])).toEqual({ refus: 'band' });
    expect(normaliserBalise('CHORUS', ['TXXX:CHORUS'])).toEqual({ refus: 'duplicate' });
    expect(normaliserBalise('  ', [])).toEqual({ refus: 'empty' });
    expect(normaliserBalise('X'.repeat(65), [])).toEqual({ refus: 'tooLong' });
    expect(normaliserBalise('K17', Array.from({ length: 16 }, (_, i) => `K${i}`))).toEqual({ refus: 'tooMany' });
    expect(nomDeCle('----:com.apple.iTunes:Chorus')).toBe('CHORUS');
  });

  it('les défauts sont ceux du serveur (comportement d’avant le réglage)', () => {
    expect(DEFAUTS_CLASSIQUE).toEqual({
      conductor: ['CONDUCTOR'], ensemble: ['ENSEMBLE', 'ORCHESTRA', 'CHOIR'], work: ['WORK'], movement: ['MOVEMENTNAME'], band: 'classical',
    });
    expect(memesBalises(DEFAUTS_CLASSIQUE, copieBalises(DEFAUTS_CLASSIQUE))).toBe(true);
  });
});

describe('Réglages › Bibliothèque › Balises du classique', () => {
  it('la section est dans l’onglet Bibliothèque, au niveau Expert', () => {
    const s = V2_SETTINGS.find((t) => t.id === 'library')!.sections.find((x) => x.id === 'classicalTags');
    expect(s).toMatchObject({ titleKey: 'classicalTags.title', min: 'expert' });
  });

  it('affiche les balises par rôle sans rien écrire au chargement', async () => {
    await monter();
    expect(puces('ensemble')).toEqual(['ENSEMBLE', 'ORCHESTRA', 'CHOIR']);
    expect(puces('conductor')).toEqual(['CONDUCTOR']);
    expect(hote.querySelector<HTMLInputElement>('input[type=radio][value=classical]')!.checked).toBe(true);
    expect(enregistrer().disabled, 'rien de modifié').toBe(true);
    expect(defauts().disabled, 'déjà aux défauts').toBe(true);
    expect(mocks.setBalisesClassique).not.toHaveBeenCalled();
  });

  it('🔴 ajoute TXXX:CHORUS à l’ensemble et l’envoie', async () => {
    await monter();
    saisir('ensemble', 'txxx:chorus');
    expect(puces('ensemble')).toEqual(['ENSEMBLE', 'ORCHESTRA', 'CHOIR', 'TXXX:CHORUS']);
    enregistrer().click();
    await respirer();
    expect(mocks.setBalisesClassique).toHaveBeenCalledTimes(1);
    expect(mocks.setBalisesClassique.mock.calls[0][0]).toMatchObject({
      ensemble: ['ENSEMBLE', 'ORCHESTRA', 'CHOIR', 'TXXX:CHORUS'], band: 'classical',
    });
  });

  it('refuse BAND dans une liste et le dit', async () => {
    await monter();
    saisir('ensemble', 'BAND');
    expect(puces('ensemble')).toEqual(['ENSEMBLE', 'ORCHESTRA', 'CHOIR']);
    expect(hote.querySelector('[data-role=ensemble] [role=alert]')?.textContent).toContain('BAND');
  });

  it('🔴 un refus s’efface quand le champ change et ne bloque pas l’enregistrement', async () => {
    await monter();
    saisir('ensemble', 'BAND');
    const alerte = () => hote.querySelector('[data-role=ensemble] [role=alert]');
    expect(alerte()).not.toBeNull();
    const c = champ('ensemble');
    c.value = '';
    c.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(alerte(), 'le refus doit tomber quand la saisie change').toBeNull();
    // Le champ vidé, le refus d'avant ne bloque pas l'enregistrement.
    hote.querySelector<HTMLInputElement>('input[type=radio][value=ignored]')!.click();
    flushSync();
    enregistrer().click();
    await respirer();
    expect(mocks.setBalisesClassique).toHaveBeenCalledTimes(1);
    expect(mocks.setBalisesClassique.mock.calls[0][0]).toMatchObject({ band: 'ignored', ensemble: ['ENSEMBLE', 'ORCHESTRA', 'CHOIR'] });
  });

  it('🔴 BAND ignoré, retrait d’une puce, puis retour aux défauts par `{}`', async () => {
    await monter();
    hote.querySelector<HTMLInputElement>('input[type=radio][value=ignored]')!.click();
    hote.querySelector<HTMLButtonElement>('[data-role=ensemble] [data-balise=CHOIR] .retirer')!.click();
    flushSync();
    enregistrer().click();
    await respirer();
    expect(mocks.setBalisesClassique.mock.calls[0][0]).toMatchObject({ band: 'ignored', ensemble: ['ENSEMBLE', 'ORCHESTRA'] });
    expect(defauts().disabled).toBe(false);
    defauts().click();
    await respirer();
    expect(mocks.setBalisesClassique.mock.calls[1][0]).toEqual({});
    expect(puces('ensemble')).toEqual(['ENSEMBLE', 'ORCHESTRA', 'CHOIR']);
  });

  it('un serveur d’avant le réglage (404) le dit au lieu d’un formulaire', async () => {
    mocks.getBalisesClassique.mockRejectedValue(Object.assign(new Error('404'), { status: 404 }));
    await monter();
    expect(hote.querySelector('[data-role]')).toBeNull();
    expect(hote.textContent).toContain('pas encore');
  });

  it('les 15 langues portent toutes les clés de la section', () => {
    const fr = dictionnaires['../locales/fr.ts'].default;
    const cles = Object.keys(fr).filter((k) => k.startsWith('classicalTags.'));
    expect(cles.length).toBeGreaterThanOrEqual(24);
    for (const l of LANGUES) {
      const d = dictionnaires[`../locales/${l}.ts`]?.default;
      expect(d, l).toBeTruthy();
      for (const k of cles) expect(d[k], `${l} : ${k}`).toBeTruthy();
    }
  });
});
