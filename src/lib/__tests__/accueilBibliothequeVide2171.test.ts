// @vitest-environment jsdom
//
/**
 * Fil forum 2171 et Bertrand (10/10/2026) — « l'assistant d'ajout de dossiers
 * MANQUE ».
 *
 * Mesuré : l'assistant de première installation existe, mais ne se montre que
 * sur un serveur à ZÉRO piste, une seule fois par appareil. Une installation
 * neuve déclare `~/Music` d'office ; dès qu'une piste y est indexée, ou que
 * l'assistant a été passé, plus rien ne propose d'ajouter un dossier. Et la
 * Bibliothèque vide n'offrait son bouton que lorsqu'AUCUN dossier n'était
 * déclaré — jamais, donc, sur une installation neuve.
 *
 * Ce banc garde les trois portes :
 * 1. l'accueil d'une bibliothèque vide propose l'ajout, et lui seul ;
 * 2. le bouton va jusqu'au bout : sélecteur → comptage → confirmation → ajout ;
 * 3. les trois écrans (Accueil, Bibliothèque, Réglages) montent le bouton.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getLibraryStats: vi.fn(),
  browseServerDirs: vi.fn(),
  estimateMusicDir: vi.fn(),
  addMusicDir: vi.fn(),
}));
const confirmer = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});
vi.mock('../stores/dialogs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../stores/dialogs')>();
  return { ...actual, dialogs: { ...actual.dialogs, confirm: confirmer } };
});

import AccueilBibliothequeVide from '../../components/partages/AccueilBibliothequeVide.svelte';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 8; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AccueilBibliothequeVide, { target: hote });
  flushSync();
  await laisserCharger();
  return hote;
}

function bouton(el: ParentNode, texte: string): HTMLButtonElement | undefined {
  return Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
    .find((b) => (b.textContent ?? '').trim() === texte);
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  confirmer.mockReset();
  mocks.browseServerDirs.mockResolvedValue({
    current: null, parent: null, drives: true,
    dirs: [{ name: 'C:', path: 'C:\\', has_children: true }, { name: 'D:', path: 'D:\\', has_children: true }],
  });
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
});

describe("l'accueil d'une bibliothèque vide", () => {
  it('propose « Ajouter un dossier… » quand le serveur affirme zéro piste', async () => {
    mocks.getLibraryStats.mockResolvedValue({ tracks: 0, albums: 0 });
    const el = await poser();
    expect(el.textContent).toContain(fr['v2.accueilVide.title']);
    expect(bouton(el, fr['settings.addFolderButton'])).toBeTruthy();
  });

  it('ne dit rien sur une bibliothèque pleine', async () => {
    mocks.getLibraryStats.mockResolvedValue({ tracks: 136, albums: 49 });
    const el = await poser();
    expect(el.querySelector('.accueil-vide')).toBeNull();
  });

  it('ne dit rien si le serveur ne répond pas', async () => {
    mocks.getLibraryStats.mockRejectedValue(new Error('réseau'));
    const el = await poser();
    expect(el.querySelector('.accueil-vide')).toBeNull();
  });
});

describe('le bouton va du sélecteur à l’ajout', () => {
  it('lecteurs Windows → comptage → confirmation chiffrée → ajout', async () => {
    mocks.getLibraryStats.mockResolvedValue({ tracks: 0 });
    mocks.estimateMusicDir.mockResolvedValue({ path: 'D:\\', audio_files: 1834, folders: 140, complete: true, drive_root: true });
    mocks.addMusicDir.mockResolvedValue({ music_dirs: ['D:\\'] });
    confirmer.mockResolvedValue(true);
    const el = await poser();

    bouton(el, fr['settings.addFolderButton'])!.click();
    flushSync();
    await laisserCharger();
    // Le sélecteur s'ouvre sur la liste des lecteurs.
    expect(mocks.browseServerDirs).toHaveBeenCalled();
    expect(document.body.textContent).toContain(fr['folderBrowser.drives']);
    const lecteurs = Array.from(document.querySelectorAll<HTMLButtonElement>('.dir-item'));
    expect(lecteurs.map((b) => b.querySelector('.name')?.textContent)).toEqual(['C:', 'D:']);
    lecteurs[1].click();
    flushSync();
    bouton(document, fr['folderBrowser.select'])!.click();
    flushSync();
    await laisserCharger();

    expect(mocks.estimateMusicDir).toHaveBeenCalledWith('D:\\');
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(String(confirmer.mock.calls[0][0])).toMatch(/1[\s\u202f\u00a0]?834 fichiers audio/);
    expect(mocks.addMusicDir).toHaveBeenCalledWith('D:\\');
    expect(el.textContent).toContain(fr['v2.accueilVide.added']);
  });

  it('renoncer à la confirmation n’ajoute rien', async () => {
    mocks.getLibraryStats.mockResolvedValue({ tracks: 0 });
    mocks.browseServerDirs.mockResolvedValue({
      current: '/home/moi', parent: '/home', drives: false,
      dirs: [{ name: 'Musique', path: '/home/moi/Musique', has_children: false }],
    });
    mocks.estimateMusicDir.mockResolvedValue({ audio_files: 12, folders: 1, complete: true, drive_root: false });
    confirmer.mockResolvedValue(false);
    const el = await poser();

    bouton(el, fr['settings.addFolderButton'])!.click();
    flushSync();
    await laisserCharger();
    document.querySelector<HTMLButtonElement>('.dir-item:not(.parent)')!.click();
    flushSync();
    bouton(document, fr['folderBrowser.select'])!.click();
    flushSync();
    await laisserCharger();

    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(mocks.addMusicDir).not.toHaveBeenCalled();
  });
});

describe('les trois écrans montent le bouton', () => {
  const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');
  it.each([
    '../../components/v2/PageWidgets.svelte',
    '../../components/v2/LibraryV2.svelte',
    '../../components/v2/SettingsV2.svelte',
  ])('%s', (p) => {
    const src = lire(p);
    expect(src).toMatch(/<(BoutonAjouterDossier|AccueilBibliothequeVide)[\s/>]/);
  });

  it("seul l'accueil (l'instance qui salue) porte l'invitation", () => {
    expect(lire('../../components/v2/PageWidgets.svelte')).toContain('{#if salut}<AccueilBibliothequeVide />{/if}');
    expect(lire('../../components/v2/HomeV2.svelte')).toMatch(/<PageWidgets salut[\s/]/);
  });

  it('la Bibliothèque vide le propose même quand un dossier est déclaré', () => {
    const src = lire('../../components/v2/LibraryV2.svelte');
    const etat = src.slice(src.indexOf("v2.lib.emptyLibrary"), src.indexOf("v2.lib.emptyLibrary") + 1500);
    // Le bouton ne doit pas dépendre de `causeVide` (null dès qu'un dossier est déclaré).
    const avantBouton = etat.slice(0, etat.indexOf('<BoutonAjouterDossier'));
    expect(avantBouton).toContain('{#if !depot}');
    expect(avantBouton.lastIndexOf('{#if !depot}')).toBeGreaterThan(avantBouton.lastIndexOf('causeVide}'));
  });
});
