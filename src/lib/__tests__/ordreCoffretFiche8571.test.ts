// @vitest-environment jsdom
//
// « Réordonner les albums » sur la fiche d'un coffret composé à la main —
// tune-server-rust#8571 (fil 2763). La sonde (`ordre_coffret` dans la fiche
// d'édition) décide : un serveur sans la route ne montre rien.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import * as api from '../api';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import type { Album } from '../types';
import { entreeParLibelle } from './aides/menuFiche';

vi.mock('../api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAlbumTracks: vi.fn(async () => []),
  getStreamingAlbumTracks: vi.fn(async () => []),
  bandcampAlbum: vi.fn(async () => ({ tracks: [] })),
  getAlbumExtendedMetadata: vi.fn(async () => ({})),
  getAlbumEdition: vi.fn(async () => null),
  getAlbum: vi.fn(async () => null),
  getOrdreCoffret: vi.fn(async () => null),
  reordonnerCoffret: vi.fn(async () => null),
}));

const FR = lFr as Record<string, string>;
const MANUEL = { coffret: JSON.stringify({ origine: 'manuel', cle: '', disques: [] }) };
const ORDRE = {
  coffret: 7,
  membres: [
    { membre: 0, titre: 'Immersion Box Set', disques: [1, 2, 3], pistes: 36 },
    { membre: 1, titre: 'Immersion Stereo', disques: [4], pistes: 10 },
  ],
};

function edition(sonde: boolean) {
  return {
    album: {
      id: 7, title: 'Immersion', album_artist: null, year: null, label: null,
      genre: null, release_type: null, cover_path: null, compilation_mode: 'auto',
      compilation_effective: false, coffret: 'manuel', champs_edites: ['discs', 'title'],
    },
    discs: [], tracks: [], ecriture_balises: true, defaire_coffret_manuel: true,
    ...(sonde ? { ordre_coffret: true } : {}),
  };
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function attendreUnPeu() { for (let i = 0; i < 8; i++) await respirer(); flushSync(); }

async function ouvrir(meta: Record<string, string>, sonde: boolean): Promise<HTMLDivElement> {
  vi.mocked(api.getAlbumExtendedMetadata).mockResolvedValue(meta);
  vi.mocked(api.getAlbumEdition).mockResolvedValue(edition(sonde) as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, {
    target: hote,
    props: { album: { id: 7, title: 'Immersion', source: 'local' } as Album, onClose: () => {} },
  });
  await attendreUnPeu();
  return hote;
}
const entree = (el: HTMLElement) => entreeParLibelle(el, FR['v2.album.boxReorder']) as HTMLButtonElement | null;

beforeEach(() => {
  locale.set('fr');
  vi.mocked(api.getOrdreCoffret).mockReset().mockResolvedValue(ORDRE as any);
  vi.mocked(api.reordonnerCoffret).mockReset().mockResolvedValue(ORDRE as any);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
});

describe('fiche d’un coffret manuel — « Réordonner les albums » (#8571)', () => {
  it('🔴 serveur qui l’annonce : la liste s’ouvre, se réordonne, et l’ordre part au serveur', async () => {
    const el = await ouvrir(MANUEL, true);
    const b = entree(el);
    expect(b, 'pas d’entrée « Réordonner les albums »').not.toBeNull();
    b!.click();
    await attendreUnPeu();
    expect(api.getOrdreCoffret).toHaveBeenCalledWith(7);
    const panneau = el.querySelector('[data-ordre-coffret-fiche]');
    expect(panneau, 'le panneau ne s’ouvre pas').not.toBeNull();
    const enregistrer = panneau!.querySelector<HTMLButtonElement>('[data-enregistrer-ordre]')!;
    expect(enregistrer.disabled, 'rien à enregistrer tant que l’ordre n’a pas changé').toBe(true);
    panneau!.querySelector('li[data-cle="1"]')!.querySelector<HTMLButtonElement>('[data-sens="haut"]')!.click();
    flushSync();
    const disques = [...panneau!.querySelectorAll('.cfordre-disques')].map((x) => x.textContent);
    expect(disques).toEqual(['Disque 1', 'Disques 2 à 4']);
    expect(enregistrer.disabled).toBe(false);
    enregistrer.click();
    await attendreUnPeu();
    expect(api.reordonnerCoffret).toHaveBeenCalledWith(7, [1, 0]);
    expect(el.querySelector('[data-ordre-coffret-fiche]'), 'le panneau reste ouvert après l’enregistrement').toBeNull();
  });

  it('🟢 CONTRE-ÉPREUVE : serveur sans la route (pas de sonde) — pas d’entrée', async () => {
    expect(entree(await ouvrir(MANUEL, false))).toBeNull();
    expect(api.getOrdreCoffret).not.toHaveBeenCalled();
  });

  it('🟢 CONTRE-ÉPREUVE : un album ordinaire n’a pas d’entrée, même avec la sonde', async () => {
    expect(entree(await ouvrir({}, true))).toBeNull();
  });

  it('🔴 coffret qui ne retient plus ses albums (409) : le dit, sans liste ni enregistrement', async () => {
    vi.mocked(api.getOrdreCoffret).mockRejectedValue(Object.assign(new Error('x'), { status: 409 }));
    const el = await ouvrir(MANUEL, true);
    entree(el)!.click();
    await attendreUnPeu();
    expect(el.querySelector('[data-ordre-indisponible]')?.textContent).toBe(FR['v2.album.boxReorderUnavailable']);
    expect(el.querySelector('[data-enregistrer-ordre]')).toBeNull();
    expect(el.querySelector('[data-ordre-coffret]')).toBeNull();
  });

  it('🟢 Annuler ferme sans rien écrire', async () => {
    const el = await ouvrir(MANUEL, true);
    entree(el)!.click();
    await attendreUnPeu();
    el.querySelector<HTMLButtonElement>('[data-annuler-ordre]')!.click();
    await attendreUnPeu();
    expect(el.querySelector('[data-ordre-coffret-fiche]')).toBeNull();
    expect(api.reordonnerCoffret).not.toHaveBeenCalled();
  });
});
