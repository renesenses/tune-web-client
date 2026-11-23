// @vitest-environment jsdom
//
// web#3045 (fil 2822) — second défaut signalé : « téléverser une pochette »,
// fichier choisi, et l'éditeur d'album se ferme aussitôt sans laisser
// enregistrer. La nouvelle pochette n'apparaît qu'après un rafraîchissement
// forcé.
//
// Deux causes : `onSaved`, qui FERME l'éditeur chez tous ses appelants, était
// appelé dès la fin du téléversement ; et le serveur rend `{ album, hash,
// size }`, lu comme s'il était l'album (`cover_path` et `id` absents).
// Et deux gardes de `ArtistEditModal` manquaient : le clic fantôme du
// sélecteur de fichiers fermait l'éditeur, et un fichier lâché à côté de la
// zone de dépôt était ouvert par le navigateur (`file:///`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import AlbumEditModal from '../../components/partages/AlbumEditModal.svelte';
import { uploadAlbumArtwork } from '../api';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const ALBUM = { id: 5, title: 'Crime of the Century', artist_name: 'Supertramp', cover_path: null };
const REPONSE = { album: { ...ALBUM, cover_path: 'c0ffee1234' }, hash: 'c0ffee1234', size: 3 };

const hotes: HTMLDivElement[] = [];
const montes: Record<string, any>[] = [];
const respirer = () => new Promise((r) => setTimeout(r, 0));

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: RequestInit) => {
    const url = String(entree);
    if (url.includes('/library/albums/5/artwork') && init?.method === 'POST') return reponse(REPONSE);
    return reponse([]);
  }));
});

afterEach(() => {
  while (montes.length) unmount(montes.pop()!);
  while (hotes.length) hotes.pop()!.remove();
  vi.unstubAllGlobals();
});

describe('web#3045 — téléverser une pochette', () => {
  it('l’API rend l’ALBUM, pas l’enveloppe du serveur', async () => {
    const album = await uploadAlbumArtwork(5, new File(['abc'], 'p.jpg', { type: 'image/jpeg' }));
    expect(album.id).toBe(5);
    expect(album.cover_path).toBe('c0ffee1234');
  });

  it('🔴 l’éditeur reste ouvert après le téléversement, la pochette est reportée à la fermeture', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    hotes.push(hote);
    montes.push(mount(AlbumEditModal, { target: hote, props: { album: ALBUM, onClose, onSaved } as any }));
    flushSync();

    const entree = hote.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(entree, 'files', {
      value: [new File(['abc'], 'p.jpg', { type: 'image/jpeg' })],
    });
    entree.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 10; i++) await respirer();
    flushSync();

    expect(onSaved, 'le téléversement ne ferme plus l’éditeur').not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(hote.querySelector('.modal-backdrop')).not.toBeNull();

    hote.querySelector<HTMLButtonElement>('.close-btn')!.click();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved.mock.calls[0][0]).toMatchObject({ id: 5, cover_path: 'c0ffee1234' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sans téléversement, fermer reste un simple onClose', () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    hotes.push(hote);
    montes.push(mount(AlbumEditModal, { target: hote, props: { album: ALBUM, onClose, onSaved } as any }));
    flushSync();
    hote.querySelector<HTMLButtonElement>('.close-btn')!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('🔴 le clic fantôme du sélecteur de fichiers ne ferme pas, un fichier lâché à côté n’est pas ouvert', () => {
    const onClose = vi.fn();
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    hotes.push(hote);
    montes.push(mount(AlbumEditModal, { target: hote, props: { album: ALBUM, onClose } as any }));
    flushSync();
    const fond = hote.querySelector<HTMLElement>('.modal-backdrop')!;
    const entree = hote.querySelector<HTMLInputElement>('input[type="file"]')!;
    entree.click = () => {};
    hote.querySelector<HTMLElement>('.cover-actions .btn-secondary')!.click();
    fond.click();
    expect(onClose, 'clic sur le fond pendant le sélecteur').not.toHaveBeenCalled();

    const lacher = new Event('drop', { bubbles: true, cancelable: true });
    fond.dispatchEvent(lacher);
    expect(lacher.defaultPrevented, 'le navigateur n’ouvre pas le fichier (file:///)').toBe(true);
  });
});
