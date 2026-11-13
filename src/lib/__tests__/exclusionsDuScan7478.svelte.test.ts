// @vitest-environment jsdom
//
// tune-server-rust#7478 — exclusions du scan par emplacement : aperçu, puis
// enregistrement SEULEMENT après confirmation du nombre de pistes retirées.
// Les exclusions globales sont affichées en lecture.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getScanExclusions: vi.fn(),
  previewScanExclusions: vi.fn(),
  saveScanExclusions: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));

import ExclusionsDuScanV2 from '../../components/v2/ExclusionsDuScanV2.svelte';
import { locale } from '../i18n';

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };

const ETAT = { global: ['brouillons'], locations: [], roots: ['/mnt/nas', '/mnt/disque'] };

let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

beforeEach(async () => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getScanExclusions.mockResolvedValue(ETAT);
  locale.set('fr');
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(ExclusionsDuScanV2, { target: hote });
  await respirer();
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
});

function saisir(racine: string, texte: string) {
  const zone = hote.querySelector<HTMLTextAreaElement>(`[data-exclusions-racine="${racine}"] textarea`)!;
  zone.value = texte;
  zone.dispatchEvent(new Event('input'));
  flushSync();
}

describe('exclusions du scan (#7478)', () => {
  it('affiche un champ par emplacement et les exclusions globales en lecture', () => {
    expect(hote.querySelectorAll('[data-exclusions-racine]').length).toBe(2);
    expect(hote.querySelector('[data-exclusions-globales]')?.textContent).toContain('brouillons');
  });

  it("n'enregistre rien sans confirmer le nombre de pistes retirées", async () => {
    mocks.previewScanExclusions.mockResolvedValue({ tracks_to_remove: 2, examples: ['/mnt/nas/Incoming/a.flac'] });
    mocks.saveScanExclusions.mockResolvedValue({ ...ETAT, locations: [{ root: '/mnt/nas', patterns: ['**/Incoming/**'] }] });
    saisir('/mnt/nas', '**/Incoming/**\n\n');
    hote.querySelector<HTMLButtonElement>('[data-exclusions-verifier]')!.click();
    await respirer();
    expect(mocks.previewScanExclusions).toHaveBeenCalledWith([
      { root: '/mnt/nas', patterns: ['**/Incoming/**'], case_sensitive: false },
    ]);
    expect(mocks.saveScanExclusions).not.toHaveBeenCalled();
    const panneau = hote.querySelector('[data-exclusions-confirmer]')!;
    expect(panneau.textContent).toContain('2 pistes seront masquées');
    expect(panneau.textContent).toContain('Rien n’est effacé');
    expect(panneau.textContent).toContain('/mnt/nas/Incoming/a.flac');

    hote.querySelector<HTMLButtonElement>('[data-exclusions-ok]')!.click();
    await respirer();
    expect(mocks.saveScanExclusions).toHaveBeenCalledWith(
      [{ root: '/mnt/nas', patterns: ['**/Incoming/**'], case_sensitive: false }],
      2,
    );
    expect(hote.querySelector('[data-exclusions-confirmer]')).toBeNull();
  });

  it('enregistre directement quand aucune piste ne serait retirée', async () => {
    mocks.previewScanExclusions.mockResolvedValue({ tracks_to_remove: 0, examples: [] });
    mocks.saveScanExclusions.mockResolvedValue(ETAT);
    saisir('/mnt/disque', '*.bak');
    hote.querySelector<HTMLButtonElement>('[data-exclusions-verifier]')!.click();
    await respirer();
    expect(mocks.saveScanExclusions).toHaveBeenCalledWith(
      [{ root: '/mnt/disque', patterns: ['*.bak'], case_sensitive: false }],
      0,
    );
  });

  it('dit « 1 piste » au singulier, et rend un 409 lisible', async () => {
    mocks.previewScanExclusions.mockResolvedValue({ tracks_to_remove: 1, examples: [] });
    mocks.saveScanExclusions.mockRejectedValue(Object.assign(new Error('{"error":"confirmation_required"}'), { status: 409 }));
    saisir('/mnt/nas', '*.bak');
    hote.querySelector<HTMLButtonElement>('[data-exclusions-verifier]')!.click();
    await respirer();
    expect(hote.querySelector('[data-exclusions-confirmer]')!.textContent).toContain('1 piste sera masquée');
    hote.querySelector<HTMLButtonElement>('[data-exclusions-ok]')!.click();
    await respirer();
    expect(hote.textContent).toContain('a changé entre-temps');
    expect(hote.textContent).not.toContain('confirmation_required');
  });

  it('apparie une règle enregistrée à sa racine, barre finale ou non', async () => {
    unmount(instance as any);
    hote.innerHTML = '';
    mocks.getScanExclusions.mockResolvedValue({ global: [], roots: ['/mnt/nas/'], locations: [{ root: '/mnt/nas', patterns: ['*.bak'] }] });
    instance = mount(ExclusionsDuScanV2, { target: hote });
    await respirer();
    expect(hote.querySelector<HTMLTextAreaElement>('[data-exclusions-racine="/mnt/nas/"] textarea')!.value).toBe('*.bak');
  });

  it('se tait sur un serveur plus ancien (404)', async () => {
    unmount(instance as any);
    hote.innerHTML = '';
    mocks.getScanExclusions.mockRejectedValue(Object.assign(new Error('404'), { status: 404 }));
    instance = mount(ExclusionsDuScanV2, { target: hote });
    await respirer();
    expect(hote.querySelector('[data-reglage="exclusions-scan"]')).toBeNull();
  });
});
