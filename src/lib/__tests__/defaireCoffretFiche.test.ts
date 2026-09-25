// @vitest-environment jsdom
//
// « Défaire le coffret » sur la fiche d'un coffret AUTOMATIQUE — GO de
// Bertrand du 25/09/2026. Pas de bouton sur un coffret manuel (sa route
// répond 409), ni sur un album ordinaire. Une confirmation dit la suite : les
// disques redeviennent des albums séparés, et le regroupement ne reviendra
// pas. Puis `POST /library/coffrets/{id}/defaire`, et retour là d'où l'on
// venait (`onClose`).
//
// Ce témoin MONTE la vraie fiche, lit l'origine comme elle la lit (magasin
// clé-valeur de l'album), clique le bouton et répond au vrai dialogue
// (`dialogs`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import * as api from '../api';
import { dialogs } from '../stores/dialogs';
import { locale } from '../i18n';
import { EVT_COFFRET_DEFAIT, origineDuCoffret } from '../coffretAuto';
import lFr from '../locales/fr';
import type { Album } from '../types';

vi.mock('../api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAlbumTracks: vi.fn(async () => []),
  getStreamingAlbumTracks: vi.fn(async () => []),
  bandcampAlbum: vi.fn(async () => ({ tracks: [] })),
  getAlbumExtendedMetadata: vi.fn(async () => ({})),
  defaireCoffret: vi.fn(async () => ({ cible: 11049, albums_recrees: [12000] })),
}));

const FR = lFr as Record<string, string>;
const BOUTON = FR['v2.album.boxUndo'];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let fermee = 0;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function ouvrir(meta: Record<string, string>, album: Partial<Album> = {}): Promise<HTMLDivElement> {
  vi.mocked(api.getAlbumExtendedMetadata).mockResolvedValue(meta);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, {
    target: hote,
    props: {
      album: { id: 11049, title: 'Early Works', source: 'local', ...album } as Album,
      onClose: () => { fermee += 1; },
    },
  });
  for (let i = 0; i < 8; i++) await respirer();
  flushSync();
  return hote;
}

function bouton(el: HTMLElement): HTMLButtonElement | null {
  return [...el.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => (b.textContent ?? '').trim() === BOUTON) ?? null;
}

/** Attend le dialogue ouvert par la fiche, et y répond. */
async function repondre(oui: boolean): Promise<string> {
  for (let i = 0; i < 8 && get(dialogs).length === 0; i++) await respirer();
  const [d] = get(dialogs);
  expect(d, 'aucune confirmation demandée').toBeTruthy();
  dialogs.settle(d.id, oui);
  for (let i = 0; i < 8; i++) await respirer();
  flushSync();
  return d.message;
}

const AUTO = { coffret: JSON.stringify({ origine: 'auto', cle: 'x', disques: [] }) };
const MANUEL = { coffret: JSON.stringify({ origine: 'manuel' }) };

beforeEach(() => {
  locale.set('fr');
  fermee = 0;
  vi.mocked(api.defaireCoffret).mockClear();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
});

describe('fiche d’album — « Défaire le coffret »', () => {
  it('🔴 un coffret AUTOMATIQUE : confirmation, route, retour', async () => {
    const evenements: unknown[] = [];
    const ecoute = (e: Event) => evenements.push((e as CustomEvent).detail);
    window.addEventListener(EVT_COFFRET_DEFAIT, ecoute);
    const el = await ouvrir(AUTO);
    const b = bouton(el);
    expect(b, 'pas de bouton sur un coffret automatique').not.toBeNull();
    b!.click();
    const message = await repondre(true);
    // La confirmation EXPLIQUE la suite.
    expect(message).toBe(FR['v2.album.boxUndoConfirm']);
    expect(message).toContain('albums séparés');
    expect(message).toContain('ne reviendra pas');
    expect(api.defaireCoffret).toHaveBeenCalledWith(11049);
    expect(fermee, 'la fiche d’un coffret défait reste ouverte').toBe(1);
    expect(evenements).toEqual([{ id: 11049 }]);
    window.removeEventListener(EVT_COFFRET_DEFAIT, ecoute);
  });

  it('🟢 CONTRE-ÉPREUVE : annuler ne défait rien et laisse la fiche ouverte', async () => {
    const el = await ouvrir(AUTO);
    bouton(el)!.click();
    await repondre(false);
    expect(api.defaireCoffret).not.toHaveBeenCalled();
    expect(fermee).toBe(0);
  });

  it('🔴 un coffret MANUEL n’a pas de bouton (sa route répond 409)', async () => {
    expect(bouton(await ouvrir(MANUEL))).toBeNull();
  });

  it('🔴 un album ordinaire n’a pas de bouton', async () => {
    expect(bouton(await ouvrir({}))).toBeNull();
  });

  it('🔴 un album d’un dépôt distant ne demande même pas son origine', async () => {
    vi.mocked(api.getAlbumExtendedMetadata).mockClear();
    await ouvrir(AUTO, { source: 'qobuz' });
    expect(api.getAlbumExtendedMetadata).not.toHaveBeenCalled();
  });
});

describe('origineDuCoffret', () => {
  it('lit le marqueur du serveur, et rien d’autre', () => {
    expect(origineDuCoffret(AUTO.coffret)).toBe('auto');
    expect(origineDuCoffret(MANUEL.coffret)).toBe('manuel');
    expect(origineDuCoffret(undefined)).toBeNull();
    expect(origineDuCoffret('pas du json')).toBeNull();
    expect(origineDuCoffret('{"origine":"autre"}')).toBeNull();
  });
});
