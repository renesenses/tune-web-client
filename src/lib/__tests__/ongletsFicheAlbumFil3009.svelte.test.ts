// @vitest-environment jsdom
//
// Fil forum 3009 (FabienM ; go de Bertrand du 23/11/2026) — la fiche album :
//
//   9  — « quand on clique sur un album, supprimer l'onglet "Notes/Bio" qui
//        apparaît déjà par défaut à côté de la vignette de l'album » ;
//   11 — « il faut déplacer les notes persos et compléments Qobuz dans 2
//        onglets dédiés à côté de l'onglet "Crédits" » ;
//   13 — « Menu Qobuz : page album, la présentation doit être affichée à côté
//        de la vignette comme c'est le cas pour un album de la bibliothèque.
//        Supprimer ainsi l'onglet "Présentation" ».
//
// Le témoin MONTE la vraie fiche et répond comme le serveur au plus bas niveau
// (`fetch`). Contre-épreuve : `AlbumDetailV2.svelte` et
// `ApportsQobuzAlbum.svelte` remis à `origin/main`, les épreuves rougissent
// (onglet `bio`, « Mes notes » et compléments sous l'en-tête, onglet
// `presentation`, présentation absente de l'en-tête).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;
const LOCAL = { id: 42, title: 'Kind of Blue', artist_name: 'Miles Davis', artist_id: 3 } as any;
const QOBUZ = { id: null, title: 'Kind of Blue', artist_name: 'Miles Davis', source: 'qobuz', source_id: '0886443853839' } as any;

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let apports: Record<string, unknown> | null = null;
let appels: string[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const repondre = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), {
  status, headers: { 'Content-Type': 'application/json' },
});

beforeEach(() => {
  appels = [];
  apports = {
    statut: 'applique',
    service_album_id: 'alb-q1',
    champs: { label: { valeur: 'Columbia', source: 'qobuz' }, upc: { valeur: '0886443853839', source: 'qobuz' } },
  };
  locale.set('fr');
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    appels.push(url);
    if (url.includes('/apports-qobuz')) return apports ? repondre(apports) : repondre({ error: 'absent' }, 404);
    if (url.includes(`/library/albums/${LOCAL.id}/bio`)) return repondre({ bio: 'Enregistré en 1959 au studio de la 30e Rue.', source: null });
    if (url.includes('/streaming/qobuz/albums/0886443853839/description')) return repondre({ description: 'Le disque de jazz le plus vendu.' });
    if (url.includes('/notes')) return repondre({ notes: [] });
    // Les crédits de l'album sont une LISTE (`creditsQobuz` l'itère).
    if (/\/library\/albums\/\d+\/credits/.test(url)) return repondre([]);
    if (/\/tracks(\?|$)/.test(url)) return repondre([]);
    return repondre({});
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function jusqua(cond: () => boolean, essais = 200) {
  for (let i = 0; i < essais; i++) {
    flushSync();
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 0));
  }
  flushSync();
  return cond();
}
async function poser(props: Record<string, unknown>) {
  monte = mount(AlbumDetailV2, { target: hote!, props: { onClose: () => {}, ...props } as any });
  await jusqua(() => false, 30);
}
const onglets = () => Array.from(hote!.querySelectorAll('[role="tab"]')).map((x) => x.getAttribute('data-onglet-album'));
const onglet = (o: string) => hote!.querySelector<HTMLButtonElement>(`[role="tab"][data-onglet-album="${o}"]`);
const tete = () => hote!.querySelector<HTMLElement>('.head');

describe('fil 3009 — fiche d’un album de la BIBLIOTHÈQUE', () => {
  it('🔴 point 9 — plus d’onglet « Notes / Bio » ; la notice est à côté de la vignette', async () => {
    await poser({ album: LOCAL });
    expect(await jusqua(() => !!hote!.querySelector('[data-description-album]')?.textContent?.includes('30e Rue'))).toBe(true);
    expect(onglets()).not.toContain('bio');
    expect(Array.from(hote!.querySelectorAll('[role="tab"]')).map((x) => x.textContent?.trim()))
      .not.toContain(fr['library.notesBio']);
  });

  it('🔴 point 11 — « Mes notes » et « Compléments Qobuz » en onglets, juste après « Crédits »', async () => {
    await poser({ album: LOCAL });
    expect(await jusqua(() => onglets().includes('qobuz')), 'pas d’onglet Compléments Qobuz').toBe(true);
    expect(onglets().slice(0, 4)).toEqual(['pistes', 'credits', 'notes', 'qobuz']);
    expect(onglet('notes')!.textContent?.trim()).toBe(fr['mesNotes.titre']);
    expect(onglet('qobuz')!.textContent?.trim()).toBe(fr['v2.album.qobuz.title']);
  });

  it('🔴 point 11 — sur l’onglet Pistes, ni « Mes notes » ni les compléments ne s’affichent', async () => {
    await poser({ album: LOCAL });
    await jusqua(() => onglets().includes('qobuz'));
    // Sur Pistes : la section des compléments est montée mais CACHÉE, et
    // « Mes notes » n'est pas rendue.
    const qobuz = hote!.querySelector<HTMLElement>('[data-panneau-qobuz-album]');
    expect(qobuz?.hasAttribute('hidden')).toBe(true);
    expect(hote!.querySelector('[data-panneau-notes]')).toBeNull();
    // Rien de tout ça n'est resté dans l'en-tête.
    expect(tete()?.querySelector('[data-apports-qobuz]')).toBeFalsy();
  });

  it('🔴 point 11 — chaque onglet montre son contenu', async () => {
    await poser({ album: LOCAL });
    await jusqua(() => onglets().includes('qobuz'));
    onglet('qobuz')!.click();
    flushSync();
    const qobuz = hote!.querySelector<HTMLElement>('[data-panneau-qobuz-album]')!;
    expect(qobuz.hasAttribute('hidden')).toBe(false);
    expect(qobuz.getAttribute('role')).toBe('tabpanel');
    expect(qobuz.textContent).toContain('Columbia');
    // Dans l'onglet, le titre repliable de la section n'a plus lieu d'être.
    expect(qobuz.querySelector('[data-replier-qobuz]')).toBeNull();
    expect(hote!.querySelector('.tracks')!.hasAttribute('hidden')).toBe(true);

    onglet('notes')!.click();
    flushSync();
    expect(hote!.querySelector('[data-panneau-notes]')).not.toBeNull();
    expect(qobuz.hasAttribute('hidden')).toBe(true);
  });

  it('un album jamais retrouvé chez Qobuz n’a pas d’onglet Compléments, « Mes notes » si', async () => {
    apports = null;
    await poser({ album: LOCAL });
    await jusqua(() => false, 40);
    expect(onglets()).toContain('notes');
    expect(onglets()).not.toContain('qobuz');
  });
});

describe('fil 3009 — fiche d’un album QOBUZ', () => {
  it('🔴 point 13 — la présentation est à côté de la vignette, sans onglet « Présentation »', async () => {
    await poser({ album: QOBUZ, service: 'qobuz' });
    expect(await jusqua(() => !!hote!.querySelector('[data-description-album]')?.textContent?.includes('Le disque de jazz le plus vendu.')),
      'la présentation n’est pas dans l’en-tête').toBe(true);
    expect(hote!.querySelector('.head [data-description-album]')).not.toBeNull();
    expect(onglets()).not.toContain('presentation');
    expect(hote!.querySelector('[data-panneau-presentation]')).toBeNull();
    // Lue UNE fois, à l'ouverture, sans clic.
    expect(appels.filter((u) => u.includes('/description')).length).toBe(1);
  });

  it('point 13 — ni « Mes notes » ni compléments sur un album de service', async () => {
    await poser({ album: QOBUZ, service: 'qobuz' });
    await jusqua(() => false, 40);
    expect(onglets()).not.toContain('notes');
    expect(onglets()).not.toContain('qobuz');
  });
});
