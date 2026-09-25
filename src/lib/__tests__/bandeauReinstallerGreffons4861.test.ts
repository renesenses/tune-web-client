// @vitest-environment jsdom
//
// tune-server-rust#4861 — le bandeau « Réinstaller » des greffons payants,
// MONTÉ pour de vrai. Le serveur rend `{ ids }` (vide pour un compte Free) ;
// « Réinstaller » passe par la route d'installation existante de chaque
// greffon, « Ignorer » par la route dismiss. Aucune lecture de fichier : sur
// `main`, le composant n'existe pas et la collecte échoue.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

vi.mock('../api', async (orig) => {
  const vrai = await orig<typeof import('../api')>();
  return {
    ...vrai,
    getSuggestionReinstallationGreffons: vi.fn(),
    ignorerSuggestionReinstallationGreffons: vi.fn(),
    installPlugin: vi.fn(),
  };
});

import * as api from '../api';
import BandeauReinstallerGreffons from '../../components/v2/BandeauReinstallerGreffons.svelte';
import { locale } from '../i18n';

const lire = vi.mocked(api.getSuggestionReinstallationGreffons);
const ignorer = vi.mocked(api.ignorerSuggestionReinstallationGreffons);
const installer = vi.mocked(api.installPlugin);

let hote: HTMLElement;
let composant: Record<string, any> | null = null;
const reinstalles: boolean[] = [];

async function laisserFiler(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await tick();
  }
  flushSync();
}

async function monter(): Promise<void> {
  composant = mount(BandeauReinstallerGreffons, {
    target: hote,
    props: { onReinstalle: (r: boolean) => reinstalles.push(r) },
  });
  flushSync();
  await laisserFiler();
}

const bandeau = () => hote.querySelector('.bri');
const alerte = () => hote.querySelector('.bri-err');

beforeEach(() => {
  locale.set('fr');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  reinstalles.length = 0;
  lire.mockReset();
  ignorer.mockReset();
  installer.mockReset();
});
afterEach(() => {
  if (composant) unmount(composant);
  composant = null;
  hote.remove();
});

describe('bandeau « Réinstaller » des greffons payants (#4861)', () => {
  it('affiché : un compte Premium sans ses greffons les voit proposés', async () => {
    lire.mockResolvedValue({ ids: ['crossfeed', 'converter', 'declick'] });
    await monter();
    expect(bandeau()).not.toBeNull();
    expect(bandeau()!.getAttribute('data-greffons')).toBe('crossfeed,converter,declick');
    expect(hote.querySelector('.bri-ok')).not.toBeNull();
    expect(hote.querySelector('.bri-non')).not.toBeNull();
    expect(alerte()).toBeNull();
  });

  it('masqué : liste vide (compte Free ou rien à proposer)', async () => {
    lire.mockResolvedValue({ ids: [] });
    await monter();
    expect(bandeau()).toBeNull();
    expect(alerte()).toBeNull();
  });

  it('masqué : un identifiant inconnu du bandeau n\'est jamais affiché', async () => {
    lire.mockResolvedValue({ ids: ['equalizer'] });
    await monter();
    expect(bandeau()).toBeNull();
  });

  it('masqué sans bandeau fantôme quand la lecture échoue (serveur plus ancien)', async () => {
    lire.mockRejectedValue(new Error('not found'));
    await monter();
    expect(bandeau()).toBeNull();
    expect(alerte()).toBeNull();
  });

  it('réinstaller : route d\'installation de CHAQUE greffon, puis relecture', async () => {
    lire.mockResolvedValueOnce({ ids: ['crossfeed', 'declick'] }).mockResolvedValue({ ids: [] });
    installer.mockResolvedValue({ success: true, message: '', restart_required: true });
    await monter();
    (hote.querySelector('.bri-ok') as HTMLButtonElement).click();
    await laisserFiler();
    expect(installer.mock.calls.map((c) => c[0])).toEqual(['crossfeed', 'declick']);
    expect(lire).toHaveBeenCalledTimes(2);
    expect(bandeau()).toBeNull();
    expect(alerte()).toBeNull();
    expect(reinstalles).toEqual([true]);
    expect(ignorer).not.toHaveBeenCalled();
  });

  it('ignorer : la route dismiss reçoit les greffons proposés, et le bandeau part', async () => {
    lire.mockResolvedValue({ ids: ['converter', 'declick'] });
    ignorer.mockResolvedValue({ ids: [] });
    await monter();
    (hote.querySelector('.bri-non') as HTMLButtonElement).click();
    await laisserFiler();
    expect(ignorer).toHaveBeenCalledWith(['converter', 'declick']);
    expect(installer).not.toHaveBeenCalled();
    expect(bandeau()).toBeNull();
    expect(alerte()).toBeNull();
  });

  it('erreur à la réinstallation : un message clair, et le bandeau suit la relecture', async () => {
    lire.mockResolvedValue({ ids: ['crossfeed'] });
    installer.mockRejectedValue(new Error('boom'));
    await monter();
    (hote.querySelector('.bri-ok') as HTMLButtonElement).click();
    await laisserFiler();
    expect(alerte()).not.toBeNull();
    expect(alerte()!.getAttribute('role')).toBe('alert');
    expect(alerte()!.textContent).not.toContain('boom');
    expect(alerte()!.textContent!.trim().length).toBeGreaterThan(1);
    // Le greffon n'est toujours pas installé : le serveur le propose encore.
    expect(bandeau()!.getAttribute('data-greffons')).toBe('crossfeed');
    expect(reinstalles).toEqual([]);
  });

  it('erreur à « Ignorer » puis relecture en échec : message, et PAS de bandeau fantôme', async () => {
    lire.mockResolvedValueOnce({ ids: ['crossfeed'] }).mockRejectedValue(new Error('down'));
    ignorer.mockRejectedValue(new Error('down'));
    await monter();
    (hote.querySelector('.bri-non') as HTMLButtonElement).click();
    await laisserFiler();
    expect(alerte()).not.toBeNull();
    expect(bandeau()).toBeNull();
  });
});
