// @vitest-environment jsdom
//
// web#3090 (fil 2849) — « Supprimer » une playlist locale effaçait la playlist
// et toutes ses lignes au premier clic, sans question. La confirmation est
// désormais exigée sur les trois écrans qui proposent le geste :
//
//  1. le mode « Éditer » de la fiche (`PlaylistDetailV2`, menu « … ») ;
//  2. le menu « … » d'une playlist (`gestesObjet`, listes et vignettes) ;
//  3. la corbeille de la carte dans la liste héritée (`PlaylistManagerView`).
//
// La question dit le nom et le nombre de titres ; le bouton dit « Supprimer »,
// en rouge ; « Annuler » est le choix par défaut (focus, Entrée annule) ; et
// annuler ne supprime RIEN.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../api', async (orig) => {
  const vrai = await orig<typeof import('../api')>();
  return { ...vrai, deletePlaylist: vi.fn(async () => undefined) };
});

import * as api from '../api';
import { t, tn } from '../i18n';
import { dialogs } from '../stores/dialogs';
import { confirmerSuppressionPlaylist } from '../confirmerSuppressionPlaylist';
import { gestesObjet, objetPlaylist } from '../gestesObjet';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import DialogContainer from '../../components/partages/DialogContainer.svelte';

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
const tr = (k: string) => get(t)(k as any);
const titres = (n: number) => get(tn)('v2.common.trackCountN', n);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 4000): Promise<boolean> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return true;
    if (Date.now() >= fin) return false;
    await respirer();
  }
}
const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const PISTES = [
  { id: 11, title: 'So What', artist_name: 'Miles Davis', duration_ms: 562000, source: 'local' },
  { id: 12, title: 'Blue in Green', artist_name: 'Miles Davis', duration_ms: 337000, source: 'local' },
];

let hotes: HTMLElement[] = [];
let montes: Record<string, unknown>[] = [];
function poser(composant: any, props: Record<string, unknown>) {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(composant, { target: hote, props: props as any }));
  flushSync();
  return hote;
}
/** La demande en tête de file (il n'y en a qu'une à la fois dans ces cas). */
const demande = () => get(dialogs)[0];

beforeEach(() => {
  vi.mocked(api.deletePlaylist).mockClear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('IntersectionObserver', ResizeObserverInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/playlists\/\d+\/tracks/.test(u)) return reponse(PISTES);
    return reponse([]);
  }));
});

afterEach(() => {
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  for (const m of montes) unmount(m);
  montes = [];
  for (const h of hotes) h.remove();
  hotes = [];
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('la question', () => {
  it('dit le nom et le nombre de titres, « Supprimer » en rouge, « Annuler » par défaut', async () => {
    const reponseP = confirmerSuppressionPlaylist('Dimanche', 12);
    const d = demande();
    expect(d.kind).toBe('confirm');
    expect(d.danger).toBe(true);
    expect(d.annulerParDefaut).toBe(true);
    expect(d.libelleValider).toBe(tr('common.delete'));
    expect(d.message).toContain('Dimanche');
    expect(d.message).toContain(titres(12));
    expect(d.message).not.toContain('{');
    dialogs.settle(d.id, false);
    expect(await reponseP).toBe(false);
  });

  it('les 15 langues portent la clé, avec {name} et {tracks}', async () => {
    const dossier = resolve(__dirname, '../locales');
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const source = readFileSync(resolve(dossier, `${l}.ts`), 'utf8');
      const m = source.match(/"playlist\.deleteConfirmAsk": "([^"\n]*)"/);
      expect(m, `clé absente en ${l}`).not.toBeNull();
      expect(m![1], l).toContain('{name}');
      expect(m![1], l).toContain('{tracks}');
    }
  });

  it('nombre inconnu : la question sans nombre, plutôt qu’un « 0 titre » faux', async () => {
    const reponseP = confirmerSuppressionPlaylist('Dimanche', undefined);
    const d = demande();
    expect(d.message).toContain('Dimanche');
    expect(d.message).not.toContain('{');
    dialogs.settle(d.id, false);
    expect(await reponseP).toBe(false);
  });
});

describe('la fenêtre (DialogContainer)', () => {
  it('le focus est sur « Annuler », Entrée annule, « Supprimer » est rouge', async () => {
    const hote = poser(DialogContainer, {});
    const reponseP = confirmerSuppressionPlaylist('Dimanche', 2);
    flushSync();
    const annuler = hote.querySelector<HTMLButtonElement>('[data-dialog-annuler]')!;
    const valider = hote.querySelector<HTMLButtonElement>('[data-dialog-valider]')!;
    expect(valider.textContent?.trim()).toBe(tr('common.delete'));
    expect(valider.classList.contains('danger')).toBe(true);
    expect(document.activeElement).toBe(annuler);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(await reponseP).toBe(false);
  });

  it('Entrée sur le bouton « Supprimer » (focus posé exprès) valide', async () => {
    const hote = poser(DialogContainer, {});
    const reponseP = confirmerSuppressionPlaylist('Dimanche', 2);
    flushSync();
    const valider = hote.querySelector<HTMLButtonElement>('[data-dialog-valider]')!;
    valider.focus();
    valider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(await reponseP).toBe(true);
  });
});

describe('menu « … » d’une playlist (gestesObjet)', () => {
  it('ANNULER ne supprime rien ; CONFIRMER supprime la bonne playlist', async () => {
    const g = gestesObjet(objetPlaylist({ id: 7, name: 'Dimanche', track_count: 12 }));
    g.supprimer!();
    expect(await jusqua(() => !!demande())).toBe(true);
    expect(demande().message).toContain(titres(12));
    dialogs.settle(demande().id, false);
    await respirer();
    expect(api.deletePlaylist).not.toHaveBeenCalled();

    g.supprimer!();
    expect(await jusqua(() => !!demande())).toBe(true);
    dialogs.settle(demande().id, true);
    expect(await jusqua(() => vi.mocked(api.deletePlaylist).mock.calls.length > 0)).toBe(true);
    expect(api.deletePlaylist).toHaveBeenCalledWith(7);
  });
});

describe('mode « Éditer » de la fiche playlist (PlaylistDetailV2)', () => {
  const PL = { kind: 'local', pl: { id: 7, name: 'Dimanche', description: null, track_count: 2 } };

  async function cliquerSupprimer(hote: HTMLElement) {
    const menu = () => document.body.querySelector<HTMLElement>('[role="menu"]');
    const plus = hote.querySelector<HTMLButtonElement>('[data-menu-playlist]')!;
    plus.click();
    flushSync();
    menu()!.querySelector<HTMLElement>('[data-editer-playlist]')!.click();
    flushSync();
    plus.click();
    flushSync();
    menu()!.querySelector<HTMLElement>('[data-supprimer-playlist]')!.click();
    flushSync();
  }

  it('la confirmation est exigée, et ANNULER ne supprime rien', async () => {
    const fermer = vi.fn();
    const hote = poser(PlaylistDetailV2, { item: PL, onClose: fermer });
    expect(await jusqua(() => !!hote.querySelector('[data-menu-playlist]'))).toBe(true);
    await jusqua(() => false, 150);
    await cliquerSupprimer(hote);
    expect(await jusqua(() => !!demande())).toBe(true);
    expect(api.deletePlaylist, 'aucune suppression avant la réponse').not.toHaveBeenCalled();
    expect(demande().message).toContain('Dimanche');
    expect(demande().message).toContain(titres(2));
    expect(demande().danger).toBe(true);
    dialogs.settle(demande().id, false);
    await jusqua(() => false, 50);
    expect(api.deletePlaylist).not.toHaveBeenCalled();
    expect(fermer).not.toHaveBeenCalled();
  });

  it('CONFIRMER supprime puis ferme la fiche', async () => {
    const fermer = vi.fn();
    const hote = poser(PlaylistDetailV2, { item: PL, onClose: fermer });
    expect(await jusqua(() => !!hote.querySelector('[data-menu-playlist]'))).toBe(true);
    await jusqua(() => false, 150);
    await cliquerSupprimer(hote);
    expect(await jusqua(() => !!demande())).toBe(true);
    dialogs.settle(demande().id, true);
    expect(await jusqua(() => fermer.mock.calls.length > 0)).toBe(true);
    expect(api.deletePlaylist).toHaveBeenCalledWith(7);
  });
});

describe('carte de la liste héritée (PlaylistManagerView)', () => {
  it('la corbeille passe par la confirmation AVANT la route', () => {
    const source = readFileSync(
      resolve(__dirname, '../../components/v2-heritage/PlaylistManagerView.svelte'), 'utf8');
    const debut = source.indexOf('async function deletePlaylist(');
    expect(debut).toBeGreaterThan(-1);
    const corps = source.slice(debut, source.indexOf('\n  }\n', debut));
    const question = corps.indexOf('confirmerSuppressionPlaylist(');
    const route = corps.indexOf('api.deletePlaylist(');
    expect(question, 'la confirmation manque').toBeGreaterThan(-1);
    expect(route).toBeGreaterThan(question);
    expect(source).toMatch(/deletePlaylist\(item\.local\.id, item\.name, /);
  });
});
