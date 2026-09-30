// @vitest-environment jsdom
//
// « Défaire le coffret » sur la fiche d'un coffret composé À LA MAIN —
// décision de Bertrand du 29/09/2026 (tune-server-rust#5319).
//
// La route (`POST /library/coffrets/{id}/defaire-manuel`) n'existe que sur un
// serveur qui l'annonce : la fiche d'édition (`GET …/edition`) porte alors
// `defaire_coffret_manuel: true`. Sans cette sonde, pas de bouton — un
// serveur antérieur répondrait 409 à la route des coffrets automatiques.
//
// La confirmation passe par le composant de l'application (`dialogs`), jamais
// par une boîte du navigateur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import * as api from '../api';
import { dialogs } from '../stores/dialogs';
import { locale } from '../i18n';
import { EVT_COFFRET_DEFAIT } from '../coffretAuto';
import lFr from '../locales/fr';
import type { Album } from '../types';

vi.mock('../api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAlbumTracks: vi.fn(async () => []),
  getStreamingAlbumTracks: vi.fn(async () => []),
  bandcampAlbum: vi.fn(async () => ({ tracks: [] })),
  getAlbumExtendedMetadata: vi.fn(async () => ({})),
  getAlbumEdition: vi.fn(async () => null),
  defaireCoffret: vi.fn(async () => ({ cible: 7, albums_recrees: [8] })),
  defaireCoffretManuel: vi.fn(async () => ({ cible: 7, albums_recrees: [8] })),
}));

const FR = lFr as Record<string, string>;
const BOUTON = FR['v2.album.boxUndo'];
const MANUEL = { coffret: JSON.stringify({ origine: 'manuel', cle: '', disques: [] }) };

function edition(sonde: boolean) {
  return {
    album: {
      id: 7, title: 'Messiah - Gardiner', album_artist: null, year: null, label: null,
      genre: null, release_type: null, cover_path: null, compilation_mode: 'auto',
      compilation_effective: false, coffret: 'manuel', champs_edites: ['discs', 'title'],
    },
    discs: [], tracks: [], ecriture_balises: true,
    ...(sonde ? { defaire_coffret_manuel: true } : {}),
  };
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let fermee = 0;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function ouvrir(meta: Record<string, string>, sonde: boolean): Promise<HTMLDivElement> {
  vi.mocked(api.getAlbumExtendedMetadata).mockResolvedValue(meta);
  vi.mocked(api.getAlbumEdition).mockResolvedValue(edition(sonde) as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, {
    target: hote,
    props: {
      album: { id: 7, title: 'Messiah - Gardiner', source: 'local' } as Album,
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

async function repondre(oui: boolean): Promise<string> {
  for (let i = 0; i < 8 && get(dialogs).length === 0; i++) await respirer();
  const [d] = get(dialogs);
  expect(d, 'aucune confirmation demandée').toBeTruthy();
  dialogs.settle(d.id, oui);
  for (let i = 0; i < 8; i++) await respirer();
  flushSync();
  return d.message;
}

beforeEach(() => {
  locale.set('fr');
  fermee = 0;
  vi.mocked(api.defaireCoffret).mockClear();
  vi.mocked(api.defaireCoffretManuel).mockClear();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
});

describe('fiche d’album — « Défaire le coffret » d’un coffret MANUEL (#5319)', () => {
  it('🔴 serveur qui l’annonce : confirmation de l’application, route manuelle, retour', async () => {
    const confirmNatif = vi.spyOn(window, 'confirm');
    const evenements: unknown[] = [];
    const ecoute = (e: Event) => evenements.push((e as CustomEvent).detail);
    window.addEventListener(EVT_COFFRET_DEFAIT, ecoute);
    const el = await ouvrir(MANUEL, true);
    const b = bouton(el);
    expect(b, 'pas de bouton sur un coffret manuel annoncé').not.toBeNull();
    b!.click();
    const message = await repondre(true);
    expect(message).toBe(FR['v2.album.boxUndoManualConfirm']);
    expect(message).toContain('son dossier');
    expect(message, 'ce n’est pas le texte des coffrets automatiques').not.toContain('ne reviendra pas');
    expect(confirmNatif, 'boîte de dialogue du navigateur').not.toHaveBeenCalled();
    expect(api.defaireCoffretManuel).toHaveBeenCalledWith(7);
    expect(api.defaireCoffret, 'route des coffrets automatiques').not.toHaveBeenCalled();
    expect(fermee).toBe(1);
    expect(evenements).toEqual([{ id: 7 }]);
    window.removeEventListener(EVT_COFFRET_DEFAIT, ecoute);
    confirmNatif.mockRestore();
  });

  it('🟢 CONTRE-ÉPREUVE : serveur antérieur (pas de sonde) — pas de bouton', async () => {
    expect(bouton(await ouvrir(MANUEL, false))).toBeNull();
  });

  it('🟢 CONTRE-ÉPREUVE : annuler ne défait rien et laisse la fiche ouverte', async () => {
    const el = await ouvrir(MANUEL, true);
    bouton(el)!.click();
    await repondre(false);
    expect(api.defaireCoffretManuel).not.toHaveBeenCalled();
    expect(fermee).toBe(0);
  });

  it('🔴 un album ordinaire n’a pas de bouton, même avec la sonde', async () => {
    expect(bouton(await ouvrir({}, true))).toBeNull();
  });
});
