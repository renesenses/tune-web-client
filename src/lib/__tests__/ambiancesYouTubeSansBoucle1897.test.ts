// @vitest-environment jsdom
//
// tune-server-rust#1897 — balayage des lectures cartographiées.
//
// L'onglet « Ambiances » de YouTube Music rechargeait ses catégories tant que
// `categories.length` valait zéro. Chaque chargement RÉASSIGNE `categories` :
// sur une réponse vide — le talon serveur n'en rend aucune — ou sur l'ancien
// objet `{moods, message}`, l'effet se relançait sans fin et martelait
// `GET /streaming/youtube/moods`. Le témoin MONTE l'écran, ouvre l'onglet et
// compte les appels.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as api from '../api';
import YouTubeDecouverteV2 from '../../components/v2/YouTubeDecouverteV2.svelte';

const souffler = (ms = 80) => new Promise((r) => setTimeout(r, ms));
/** Une réponse réseau, pas une micro-tâche : une boucle de rechargement doit
 *  laisser la main aux minuteries pour être COMPTÉE, au lieu de figer le banc. */
const reponse = <T,>(valeur: T) => () => new Promise<T>((r) => setTimeout(() => r(valeur), 5));

describe('YouTube Music : l’onglet Ambiances', () => {
  let monte: ReturnType<typeof mount> | null = null;
  let cible: HTMLElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getYouTubeCharts').mockResolvedValue({ country: 'FR', sections: [] });
    cible = document.createElement('div');
    document.body.appendChild(cible);
  });
  afterEach(() => {
    if (monte) { unmount(monte); monte = null; }
    cible.remove();
    vi.restoreAllMocks();
  });

  async function ouvrirAmbiances() {
    monte = mount(YouTubeDecouverteV2, { target: cible, props: {} });
    flushSync();
    await souffler();
    const [, onglet] = cible.querySelectorAll('.onglets button');
    (onglet as HTMLButtonElement).click();
    flushSync();
    await souffler(200);
    flushSync();
  }

  it('🔴 une liste vide n’est demandée qu’une fois', async () => {
    const moods = vi.spyOn(api, 'getYouTubeMoods').mockImplementation(reponse([]));
    await ouvrirAmbiances();
    expect(moods).toHaveBeenCalledTimes(1);
    expect(cible.querySelector('.etat')?.textContent).toBe('—');
  });

  it('🔴 l’ancienne enveloppe `{moods, message}` ne relance rien et ne s’affiche pas', async () => {
    const moods = vi
      .spyOn(api, 'getYouTubeMoods')
      .mockImplementation(reponse({ moods: [], message: 'YouTube moods not yet implemented' } as any));
    await ouvrirAmbiances();
    expect(moods).toHaveBeenCalledTimes(1);
    expect(cible.querySelectorAll('.puces')).toHaveLength(0);
  });

  it('des catégories rendues s’affichent', async () => {
    vi.spyOn(api, 'getYouTubeMoods').mockResolvedValue([
      { title: 'Humeur', items: [{ title: 'Calme', params: 'p1' }] },
    ]);
    await ouvrirAmbiances();
    expect(cible.querySelector('.puces button')?.textContent).toBe('Calme');
  });
});
