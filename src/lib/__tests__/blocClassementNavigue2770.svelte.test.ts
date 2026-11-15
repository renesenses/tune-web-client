// @vitest-environment jsdom
//
// web#2770 (lot 4) — le classement du Tableau de bord : la ligne d'un album
// de la bibliothèque OUVRE l'album (« clic = navigation, jamais lecture »), et
// la lecture garde son bouton ▶ ; une ligne sans album à ouvrir joue, comme
// avant. Les « Titres favoris » de l'accueil et les classements de pistes
// reçoivent la même fiche (`elementPisteDuSeau`, `album_id` de la piste).
//
// Contre-épreuve : `BlocClassement.svelte` remis à `origin/main` fait rougir
// le premier témoin (la ligne joue au lieu d'ouvrir) ; `accueilWidgets.ts`
// remis à `origin/main` fait rougir le dernier (`ouvrir: 'lire'`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import BlocClassement from '../../components/v2/blocs/BlocClassement.svelte';
import { elementPisteDuSeau, versElement, type Element } from '../accueilWidgets';
import { activeView, pendingLibraryAlbum } from '../stores/navigation';
import { currentZoneId, zones } from '../stores/zones';

let cible: HTMLDivElement;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  zones.set([{ id: 1, name: 'Salon' } as any]);
  currentZoneId.set(1);
  activeView.set('dashboard' as any);
  pendingLibumReset();
  cible = document.createElement('div');
  document.body.appendChild(cible);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  document.body.innerHTML = '';
});
function pendingLibumReset() { pendingLibraryAlbum.set(null); }

function monter(donnees: Element[]) {
  monte = mount(BlocClassement, { target: cible, props: { donnees } });
  flushSync();
}

describe('BlocClassement', () => {
  it('🔴 la ligne d’un album de la bibliothèque OUVRE l’album ; ▶ joue', () => {
    const jouer = vi.fn(async () => {});
    monter([{ id: 'a', titre: 'Moon Safari', sous: 'Air', ouvrir: 'album', fiche: { id: 9, title: 'Moon Safari' }, jouer }]);
    cible.querySelector<HTMLButtonElement>('.corps')!.click();
    expect(jouer, 'le clic sur la ligne ne LANCE plus la lecture').not.toHaveBeenCalled();
    expect(get(pendingLibraryAlbum)).toBe(9);
    expect(get(activeView)).toBe('library');
    const lire = cible.querySelector<HTMLButtonElement>('.lire');
    expect(lire, 'la lecture garde un bouton').not.toBeNull();
    lire!.click();
    expect(jouer).toHaveBeenCalledWith(1);
  });

  it('une ligne sans album à ouvrir joue, sans bouton ▶ à part', () => {
    const jouer = vi.fn(async () => {});
    monter([{ id: 'b', titre: 'Sexy Boy', sous: 'Air', jouer }]);
    expect(cible.querySelector('.lire')).toBeNull();
    cible.querySelector<HTMLButtonElement>('.corps')!.click();
    expect(jouer).toHaveBeenCalledWith(1);
    expect(get(activeView)).toBe('dashboard');
  });
});

describe('accueilWidgets — la fiche d’album des pistes', () => {
  it('🔴 un titre favori de la bibliothèque OUVRE son album ; un titre de service garde la lecture', () => {
    const local = elementPisteDuSeau({ id: 3, album_id: 12, title: 'Sexy Boy', album_title: 'Moon Safari', artist_name: 'Air' }, 0);
    expect(local.ouvrir).toBe('album');
    expect(local.fiche).toMatchObject({ id: 12, title: 'Moon Safari', artist_name: 'Air' });
    const service = elementPisteDuSeau({ id: null, source: 'qobuz', source_id: 'q1', title: 'X', artist_name: 'Y' }, 1);
    expect(service.ouvrir).toBe('lire');
  });
  it('versElement : l’artiste d’un album devient `artisteDuSous` ; pas pour une playlist', () => {
    expect(versElement({ id: 4, title: 'Moon Safari', artist_name: 'Air', artist_id: 7 }, 0, 'alb').artisteDuSous)
      .toEqual({ id: 7, name: 'Air', source: 'local' });
    expect(versElement({ source_id: 'p1', name: 'Mix', artist_name: 'Air' }, 0, 'pl', { genre: 'playlist', service: 'qobuz' }).artisteDuSous)
      .toBeUndefined();
  });
});
