// @vitest-environment jsdom
//
// tune-server-rust#9158 (Rob) — Réglages › Bibliothèque › Balises
// personnelles → tags Tune : correspondances éditables, validation alignée sur
// le serveur, aperçu des clés rencontrées, passe « Appliquer à la
// bibliothèque » avec son avancement, 16 langues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getBalisesPerso: vi.fn(),
  setBalisesPerso: vi.fn(),
  getClesBalisesPerso: vi.fn(),
  appliquerBalisesPerso: vi.fn(),
  getAvancementBalisesPerso: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));

import BalisesPersoV2 from '../../components/v2/BalisesPersoV2.svelte';
import { locale } from '../i18n';
import { corpsDe, normaliserCle, refusDe } from '../balisesPerso';
import { V2_SETTINGS } from '../v2Settings';
import { REGLAGES } from '../reglagesIndex';
import { dialogs } from '../stores/dialogs';

const LANGUES = ['de', 'el', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nb', 'pl', 'ro', 'sv', 'tr', 'vi', 'zh'];
const dictionnaires = import.meta.glob('../locales/*.ts', { eager: true }) as Record<string, { default: Record<string, string> }>;

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };

let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

const repos = { running: false, processed: 0, total: 0, added: 0, removed: 0, unreadable: 0, finished: false };
function etat(mappings: any[] = [], apply = repos) {
  return { personal_tags: { mappings }, max_mappings: 32, apply };
}

async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(BalisesPersoV2, { target: hote });
  await respirer();
}

const q = <T extends Element = HTMLElement>(sel: string) => hote.querySelector<T>(sel as any) as T;
const lignes = () => [...hote.querySelectorAll('[data-correspondance]')].map((l) => l.getAttribute('data-correspondance'));

function saisir(texte: string) {
  const c = q<HTMLInputElement>('[data-saisie]');
  c.value = texte;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  q<HTMLButtonElement>('[data-ajouter]').click();
  flushSync();
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getBalisesPerso.mockResolvedValue(etat());
  mocks.setBalisesPerso.mockImplementation(async (corps: any) => etat(corps.mappings));
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('balisesPerso — validation alignée sur le serveur', () => {
  it('met en capitales et refuse ce que le serveur refuse', () => {
    expect(normaliserCle(' txxx:mood ', 0)).toEqual({ cle: 'TXXX:MOOD' });
    expect(normaliserCle('HUMEUR É', 0)).toEqual({ refus: 'chars' });
    expect(normaliserCle('  ', 0)).toEqual({ refus: 'empty' });
    expect(normaliserCle('TXXX:', 0)).toEqual({ refus: 'empty' });
    expect(normaliserCle('X'.repeat(65), 0)).toEqual({ refus: 'tooLong' });
    expect(normaliserCle('K', 32)).toEqual({ refus: 'tooMany' });
    expect(refusDe({ key: 'FAVORI', mode: 'fixed', tag: ' ' })).toBe('tagRequired');
    expect(refusDe({ key: 'MOOD', mode: 'values', prefix: 'x'.repeat(33) })).toBe('prefixTooLong');
    expect(corpsDe({ mappings: [
      { key: 'mood', mode: 'values', prefix: '  ', tag: 'ignoré' },
      { key: 'favori', mode: 'fixed', tag: ' Favori ', prefix: 'ignoré' },
    ] })).toEqual({ mappings: [{ key: 'MOOD', mode: 'values' }, { key: 'FAVORI', mode: 'fixed', tag: 'Favori' }] });
  });

  it('les libellés existent dans les 16 langues', () => {
    const fr = dictionnaires['../locales/fr.ts'].default;
    const cles = Object.keys(fr).filter((k) => k.startsWith('personalTags.'));
    expect(cles.length).toBeGreaterThan(30);
    for (const l of LANGUES) {
      const d = dictionnaires[`../locales/${l}.ts`]?.default;
      expect(d, l).toBeTruthy();
      for (const k of cles) expect(d[k], `${l} : ${k}`).toBeTruthy();
    }
  });
});

describe('Réglages › Bibliothèque › Balises personnelles', () => {
  it('la section est dans l’onglet Bibliothèque, au niveau Expert, et dans l’index des réglages', () => {
    const s = V2_SETTINGS.find((t) => t.id === 'library')!.sections.find((x) => x.id === 'personalTags');
    expect(s).toMatchObject({ titleKey: 'personalTags.title', min: 'expert' });
    expect(REGLAGES.find((r) => r.id === 'balises-perso')).toMatchObject({ section: 'personalTags', composant: 'BalisesPersoV2.svelte' });
  });

  it('affiche les correspondances sans rien écrire au chargement', async () => {
    mocks.getBalisesPerso.mockResolvedValue(etat([{ key: 'MOOD', mode: 'values' }]));
    await monter();
    expect(lignes()).toEqual(['MOOD']);
    expect(q<HTMLButtonElement>('[data-enregistrer]').disabled, 'rien de modifié').toBe(true);
    expect(mocks.setBalisesPerso).not.toHaveBeenCalled();
    expect(mocks.getClesBalisesPerso).not.toHaveBeenCalled();
    expect(mocks.appliquerBalisesPerso).not.toHaveBeenCalled();
  });

  it('🔴 ajoute TXXX:MOOD (valeurs) et un tag fixe, et les envoie au serveur', async () => {
    await monter();
    expect(q('[data-aucune]')).not.toBeNull();
    saisir('txxx:mood');
    saisir('favori');
    expect(lignes()).toEqual(['TXXX:MOOD', 'FAVORI']);
    const favori = q('[data-correspondance=FAVORI]');
    const mode = favori.querySelector<HTMLSelectElement>('[data-mode]')!;
    mode.value = 'fixed';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    // Tag fixe sans nom : refusé à la saisie, rien n'est envoyé.
    q<HTMLButtonElement>('[data-enregistrer]').click();
    await respirer();
    expect(mocks.setBalisesPerso).not.toHaveBeenCalled();
    expect(favori.querySelector('[role=alert]')?.textContent).toContain('tag fixe');
    const tag = favori.querySelector<HTMLInputElement>('[data-tag]')!;
    tag.value = 'Favori de Rob';
    tag.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    q<HTMLButtonElement>('[data-enregistrer]').click();
    await respirer();
    expect(mocks.setBalisesPerso).toHaveBeenCalledTimes(1);
    expect(mocks.setBalisesPerso.mock.calls[0][0]).toEqual({ mappings: [
      { key: 'TXXX:MOOD', mode: 'values' },
      { key: 'FAVORI', mode: 'fixed', tag: 'Favori de Rob' },
    ] });
    expect(q<HTMLButtonElement>('[data-enregistrer]').disabled, 'enregistré : plus rien de modifié').toBe(true);
  });

  it('refuse une clé hors A-Z et le dit', async () => {
    await monter();
    saisir('HUMEUR É');
    expect(lignes()).toEqual([]);
    expect(q('[data-refus]')?.textContent).toContain('A-Z');
  });

  it('retire une correspondance', async () => {
    mocks.getBalisesPerso.mockResolvedValue(etat([{ key: 'MOOD', mode: 'values' }, { key: 'OCCASION', mode: 'values' }]));
    await monter();
    q('[data-correspondance=MOOD]').querySelector<HTMLButtonElement>('[data-retirer]')!.click();
    flushSync();
    expect(lignes()).toEqual(['OCCASION']);
    expect(q<HTMLButtonElement>('[data-enregistrer]').disabled).toBe(false);
  });

  it('🔴 l’aperçu liste les clés libres, cache les standard, et ajoute une clé en un clic', async () => {
    mocks.getClesBalisesPerso.mockResolvedValue({
      sampled_files: 200, unreadable_files: 0, timed_out: false,
      keys: [
        { key: 'OCCASION', forms: ['TXXX:Occasion'], files: 42, examples: ['Dîner'], known: false, configured: false },
        { key: 'MOOD', forms: ['MOOD'], files: 10, examples: ['Calme'], known: true, configured: false },
      ],
    });
    await monter();
    q<HTMLButtonElement>('[data-analyser]').click();
    await respirer();
    expect(mocks.getClesBalisesPerso).toHaveBeenCalledWith(200);
    expect(q('[data-echantillon]')?.textContent).toContain('200');
    expect([...hote.querySelectorAll('[data-cle]')].map((e) => e.getAttribute('data-cle'))).toEqual(['OCCASION']);
    expect(q('[data-cle=OCCASION]').textContent).toContain('42');
    q<HTMLInputElement>('[data-voir-connues]').click();
    flushSync();
    expect([...hote.querySelectorAll('[data-cle]')].map((e) => e.getAttribute('data-cle'))).toEqual(['OCCASION', 'MOOD']);
    q('[data-cle=OCCASION]').querySelector<HTMLButtonElement>('[data-ajouter-cle]')!.click();
    flushSync();
    expect(lignes()).toEqual(['OCCASION']);
    expect(q('[data-cle=OCCASION] [data-deja]'), 'la clé reprise le dit').not.toBeNull();
  });

  it('🔴 « Appliquer à la bibliothèque » lance la passe et suit son avancement', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.getBalisesPerso.mockResolvedValue(etat([{ key: 'MOOD', mode: 'values' }]));
    mocks.appliquerBalisesPerso.mockResolvedValue({ apply: { ...repos, running: true, total: 1000 } });
    mocks.getAvancementBalisesPerso
      .mockResolvedValueOnce({ ...repos, running: true, processed: 400, total: 1000 })
      .mockResolvedValue({ ...repos, running: false, finished: true, processed: 1000, total: 1000, added: 12, removed: 3 });
    await monter();
    q<HTMLButtonElement>('[data-lancer]').click();
    await respirer();
    expect(mocks.appliquerBalisesPerso).toHaveBeenCalledTimes(1);
    expect(q('[data-avancement]')?.textContent).toContain('0 / 1000');
    expect(q<HTMLButtonElement>('[data-lancer]').disabled, 'pas deux passes').toBe(true);
    await vi.advanceTimersByTimeAsync(2100);
    await respirer();
    expect(q('[data-avancement]')?.textContent).toContain('400 / 1000');
    await vi.advanceTimersByTimeAsync(2100);
    await respirer();
    expect(q('[data-termine]')?.textContent).toContain('12');
    expect(q('[data-termine]')?.textContent).toContain('3');
  });

  it('« Appliquer » attend que les changements soient enregistrés', async () => {
    await monter();
    saisir('MOOD');
    expect(q<HTMLButtonElement>('[data-lancer]').disabled).toBe(true);
    expect(q('[data-non-enregistre]')).not.toBeNull();
  });

  it('un serveur d’avant le réglage (404) le dit', async () => {
    mocks.getBalisesPerso.mockRejectedValue(Object.assign(new Error('nf'), { status: 404 }));
    await monter();
    expect(hote.textContent).toContain('Mettez Tune à jour');
  });
});

describe('Retour de Rob (19/11) — séparateur et suggestions', () => {
  it('le séparateur se règle par correspondance et part au serveur', async () => {
    const { choixDuSeparateur, separateurDuChoix } = await import('../balisesPerso');
    expect(choixDuSeparateur(undefined)).toBe('semicolon');
    expect(choixDuSeparateur('')).toBe('none');
    expect(choixDuSeparateur('|')).toBe('pipe');
    expect(choixDuSeparateur('//')).toBe('custom');
    expect(separateurDuChoix('slash')).toBe('/');
    expect(separateurDuChoix('semicolon')).toBeUndefined();
    expect(refusDe({ key: 'GROUPING', mode: 'values', separator: '123456789' })).toBe('separatorTooLong');
    expect(corpsDe({ mappings: [{ key: 'grouping', mode: 'values', separator: ';' }] }))
      .toEqual({ mappings: [{ key: 'GROUPING', mode: 'values' }] });
  });

  it('🔴 GROUPING ajouté par suggestion, séparateur « | », puis « aucun », envoyés tels quels', async () => {
    mocks.getBalisesPerso.mockResolvedValue({ ...etat(), suggestions: ['GROUPING', 'MOOD', 'STYLE', 'ROONTRACKTAG', 'ROONALBUMTAG'] });
    await monter();
    expect([...hote.querySelectorAll('[data-suggestion]')].map((b) => b.getAttribute('data-suggestion')))
      .toEqual(['GROUPING', 'MOOD', 'STYLE', 'ROONTRACKTAG', 'ROONALBUMTAG']);
    q<HTMLButtonElement>('[data-suggestion=GROUPING]').click();
    flushSync();
    q<HTMLButtonElement>('[data-suggestion=STYLE]').click();
    flushSync();
    expect(lignes()).toEqual(['GROUPING', 'STYLE']);
    expect(q('[data-suggestion=GROUPING]'), 'une suggestion reprise disparaît').toBeNull();
    const sel = (cle: string) => q(`[data-correspondance=${cle}]`).querySelector<HTMLSelectElement>('[data-separateur]')!;
    sel('GROUPING').value = 'pipe';
    sel('GROUPING').dispatchEvent(new Event('change', { bubbles: true }));
    sel('STYLE').value = 'none';
    sel('STYLE').dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    q<HTMLButtonElement>('[data-enregistrer]').click();
    await respirer();
    expect(mocks.setBalisesPerso.mock.calls[0][0]).toEqual({ mappings: [
      { key: 'GROUPING', mode: 'values', separator: '|' },
      { key: 'STYLE', mode: 'values', separator: '' },
    ] });
  });

  it('un séparateur personnalisé se saisit', async () => {
    await monter();
    saisir('GROUPING');
    const ligne = q('[data-correspondance=GROUPING]');
    const sel = ligne.querySelector<HTMLSelectElement>('[data-separateur]')!;
    sel.value = 'custom';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    const champ = ligne.querySelector<HTMLInputElement>('[data-separateur-perso]')!;
    champ.value = ' // ';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    q<HTMLButtonElement>('[data-enregistrer]').click();
    await respirer();
    expect(mocks.setBalisesPerso.mock.calls[0][0]).toEqual({ mappings: [{ key: 'GROUPING', mode: 'values', separator: ' // ' }] });
  });
});

describe('Relecture du 19/11 — garde-fous', () => {
  it('le texte des niveaux dit ce que devient un tag retiré ou repris à la main', async () => {
    await monter();
    expect(hote.textContent).toContain(
      'un tag du scan retiré à la main revient au prochain scan ; un tag repris à la main ne sera plus retiré',
    );
  });

  it('🔴 « Appliquer » avec un réglage vide demande confirmation, et rien ne part sur un refus', async () => {
    const confirmer = vi.spyOn(dialogs, 'confirm').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mocks.appliquerBalisesPerso.mockResolvedValue({ apply: { ...repos, running: false, finished: true } });
    await monter();
    q<HTMLButtonElement>('[data-lancer]').click();
    await respirer();
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(String(confirmer.mock.calls[0][0])).toContain('retirer tous les tags posés par le scan');
    expect(mocks.appliquerBalisesPerso).not.toHaveBeenCalled();
    q<HTMLButtonElement>('[data-lancer]').click();
    await respirer();
    expect(mocks.appliquerBalisesPerso).toHaveBeenCalledTimes(1);
    confirmer.mockRestore();
  });

  it('« Appliquer » avec des correspondances ne demande rien', async () => {
    const confirmer = vi.spyOn(dialogs, 'confirm');
    mocks.getBalisesPerso.mockResolvedValue(etat([{ key: 'MOOD', mode: 'values' }]));
    mocks.appliquerBalisesPerso.mockResolvedValue({ apply: { ...repos, finished: true } });
    await monter();
    q<HTMLButtonElement>('[data-lancer]').click();
    await respirer();
    expect(confirmer).not.toHaveBeenCalled();
    expect(mocks.appliquerBalisesPerso).toHaveBeenCalledTimes(1);
    confirmer.mockRestore();
  });

  it('🔴 un séparateur personnalisé vide est refusé, rien ne part', async () => {
    expect(refusDe({ key: 'GROUPING', mode: 'values', separator: '' }, true)).toBe('separatorEmpty');
    expect(refusDe({ key: 'GROUPING', mode: 'values', separator: '' }, false), '« Aucun » reste permis').toBeNull();
    await monter();
    saisir('GROUPING');
    const ligne = q('[data-correspondance=GROUPING]');
    const sel = ligne.querySelector<HTMLSelectElement>('[data-separateur]')!;
    sel.value = 'custom';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    q<HTMLButtonElement>('[data-enregistrer]').click();
    await respirer();
    expect(mocks.setBalisesPerso).not.toHaveBeenCalled();
    expect(ligne.querySelector('[role=alert]')?.textContent).toContain('séparateur personnalisé');
  });

  it('l’aperçu dit les fichiers illisibles et l’arrêt au délai', async () => {
    mocks.getClesBalisesPerso.mockResolvedValue({ sampled_files: 50, unreadable_files: 7, timed_out: true, keys: [] });
    await monter();
    q<HTMLButtonElement>('[data-analyser]').click();
    await respirer();
    expect(q('[data-illisibles]')?.textContent).toContain('7');
    expect(q('[data-delai]')).not.toBeNull();
  });

  it('rien d’affiché quand tout a été lu dans le délai', async () => {
    mocks.getClesBalisesPerso.mockResolvedValue({ sampled_files: 50, unreadable_files: 0, timed_out: false, keys: [] });
    await monter();
    q<HTMLButtonElement>('[data-analyser]').click();
    await respirer();
    expect(q('[data-illisibles]')).toBeNull();
    expect(q('[data-delai]')).toBeNull();
  });
});
