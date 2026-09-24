// @vitest-environment jsdom
//
// `renesenses/tune-server-rust#4806` — bannir un titre, tranche WEB.
//
// Bertrand, 23/09/2026 : un titre banni reste VISIBLE mais grisé (et barré)
// dans son album, jamais caché ; il n'est plus jamais joué automatiquement
// (c'est le serveur qui l'exclut) ; un clic délibéré le joue après
// confirmation ; bibliothèque locale seulement — pas d'entrée sur une piste
// de service.
//
// Contrat serveur assumé (PR #4818, diff lu le 23/09/2026) :
//   POST   /library/tracks/{id}/ban    DELETE /library/tracks/{id}/ban
//   GET    /library/tracks/banned  →  { total, items: [{ track_id, title,
//          artist, album_id, album_title, banned_at, resolved }] }
//   et `banned: boolean` sur chaque ligne des listes de pistes.
//
// 🔴 Ces témoins MONTENT les composants et lisent les requêtes RÉELLEMENT
// émises. Contre-épreuve : sur `origin/main`, `lib/titreBanni` n'existe pas —
// le fichier ne s'importe même pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PisteActions from '../../components/v2/PisteActions.svelte';
import LignePisteV2 from '../../components/v2/LignePisteV2.svelte';
import TitresBannisV2 from '../../components/v2/TitresBannisV2.svelte';
import { locale } from '../i18n';
import { entreesMenuPiste } from '../menuPiste';
import { bannissable, estBannie, surchargesBannissement } from '../titreBanni';
import { dialogs } from '../stores/dialogs';
import lFr from '../locales/fr';
import lEn from '../locales/en';
import lDe from '../locales/de';
import lEs from '../locales/es';
import lIt from '../locales/it';
import lRo from '../locales/ro';
import lSv from '../locales/sv';
import lHu from '../locales/hu';
import lJa from '../locales/ja';
import lKo from '../locales/ko';
import lZh from '../locales/zh';
import type { Track } from '../types';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
let reponses: [string, unknown][] = [];
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const LOCALE = { id: 12, title: 'Lovely Day', artist_name: 'Bill Withers', album_title: 'Menagerie',
  album_id: 3, source: 'local', duration_ms: 255000, banned: false } as unknown as Track;
const BANNIE = { ...LOCALE, banned: true } as Track;
const QOBUZ = { id: null, title: 'Lovely Day', artist_name: 'Bill Withers', source: 'qobuz',
  source_id: '4791523', duration_ms: 255000 } as unknown as Track;

beforeEach(() => {
  requetes = [];
  reponses = [];
  locale.set('fr');
  surchargesBannissement.set(new Map());
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    const trouve = reponses.find(([motif]) => url.includes(motif));
    const charge = trouve ? trouve[1] : {};
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.fond, .modal-backdrop').forEach((e) => e.remove());
  // Un dialogue resté en attente polluerait le cas suivant.
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  vi.unstubAllGlobals();
});

const items = () => [...document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
const entree = (libelle: string) => items().find((b) => (b.textContent ?? '').includes(libelle));
async function ouvrirMenu(piste: Track) {
  monte = mount(PisteActions, { target: hote!, props: { piste } });
  await souffler();
  const plus = hote!.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  expect(plus, 'le bouton « … » est absent').toBeTruthy();
  plus!.click();
  await souffler();
}

describe('#4806 — le MODULE du menu : « Bannir » / « Débannir », bibliothèque seule', () => {
  const gestes = { bannir: () => {}, debannir: () => {} };
  const cles = (c: Parameters<typeof entreesMenuPiste>[0]) => entreesMenuPiste(c, gestes).map((e) => e.cle);
  it('une piste de bibliothèque non bannie propose « Bannir », pas « Débannir »', () => {
    const k = cles({ jouable: true, idBibliotheque: 12, artistId: null, albumId: null });
    expect(k).toContain('ban.ban');
    expect(k).not.toContain('ban.unban');
  });
  it('une piste bannie propose « Débannir », pas « Bannir » — jamais les deux', () => {
    const k = cles({ jouable: true, idBibliotheque: 12, artistId: null, albumId: null, bannie: true });
    expect(k).toContain('ban.unban');
    expect(k).not.toContain('ban.ban');
  });
  it('une piste de SERVICE n’a aucune des deux entrées (tranche locale seule)', () => {
    const k = cles({ jouable: true, idBibliotheque: null, artistId: null, albumId: null, playlistDeService: 'qobuz' });
    expect(k).not.toContain('ban.ban');
    expect(k).not.toContain('ban.unban');
  });
  it('sans geste fourni, l’entrée est absente — comme toutes les autres', () => {
    const k = entreesMenuPiste({ jouable: true, idBibliotheque: 12, artistId: null, albumId: null }, {}).map((e) => e.cle);
    expect(k).not.toContain('ban.ban');
  });
});

describe('#4806 — estBannie : le drapeau serveur, puis la décision locale', () => {
  it('lit `banned` posé par le serveur, et `false` quand la clé manque (serveur d’avant)', () => {
    expect(estBannie(BANNIE, new Map())).toBe(true);
    expect(estBannie(LOCALE, new Map())).toBe(false);
    expect(estBannie({ id: 5, source: 'local' } as Track, new Map())).toBe(false);
  });
  it('la surcharge locale PRIME sur le drapeau, dans les deux sens', () => {
    expect(estBannie(LOCALE, new Map([[12, true]]))).toBe(true);
    expect(estBannie(BANNIE, new Map([[12, false]]))).toBe(false);
  });
  it('une piste de service n’est jamais bannie, quel que soit son `source_id`', () => {
    expect(estBannie({ ...QOBUZ, banned: true } as Track, new Map())).toBe(false);
    expect(bannissable(QOBUZ)).toBe(false);
    expect(bannissable(LOCALE)).toBe(true);
  });
});

describe('#4806 — le menu « … » MONTÉ : la requête réellement émise', () => {
  it('🔴 « Bannir ce titre » → POST /library/tracks/12/ban, puis le menu dit « Débannir »', async () => {
    reponses = [['/library/tracks/12/ban', { track_id: 12, banned: true }]];
    await ouvrirMenu(LOCALE);
    const e = entree(fr['ban.ban']);
    expect(e, '« Bannir ce titre » absent du menu d’une piste locale').toBeTruthy();
    expect(entree(fr['ban.unban'])).toBeUndefined();
    e!.click();
    await souffler(20);
    const post = requetes.find((r) => r.method === 'POST');
    expect(post?.url).toMatch(/\/api\/v1\/library\/tracks\/12\/ban$/);
    expect(get(surchargesBannissement).get(12)).toBe(true);
    // Rouvrir : la piste est désormais bannie aux yeux du menu, sans rechargement.
    hote!.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    await souffler();
    expect(entree(fr['ban.unban']), '« Débannir » absent après le bannissement').toBeTruthy();
    expect(entree(fr['ban.ban'])).toBeUndefined();
  });
  it('🔴 « Débannir » → DELETE /library/tracks/12/ban', async () => {
    reponses = [['/library/tracks/12/ban', { track_id: 12, banned: false }]];
    await ouvrirMenu(BANNIE);
    const e = entree(fr['ban.unban']);
    expect(e, '« Débannir » absent du menu d’une piste bannie').toBeTruthy();
    e!.click();
    await souffler(20);
    const del = requetes.find((r) => r.method === 'DELETE');
    expect(del?.url).toMatch(/\/api\/v1\/library\/tracks\/12\/ban$/);
    expect(get(surchargesBannissement).get(12)).toBe(false);
  });
  it('une piste Qobuz n’a ni « Bannir » ni « Débannir »', async () => {
    await ouvrirMenu(QOBUZ);
    expect(items().length, 'le menu est vide').toBeGreaterThan(0);
    expect(entree(fr['ban.ban'])).toBeUndefined();
    expect(entree(fr['ban.unban'])).toBeUndefined();
  });
});

describe('#4806 — la LIGNE : grisée, barrée, visible ; le clic délibéré demande confirmation', () => {
  it('🔴 une piste bannie porte la classe `bannie` et son badge ; une piste normale, non', async () => {
    monte = mount(LignePisteV2, { target: hote!, props: { piste: BANNIE, onLire: () => {} } });
    await souffler();
    const ligne = hote!.querySelector('.trk');
    expect(ligne?.classList.contains('bannie')).toBe(true);
    expect(hote!.querySelector('.bannie-etiq')?.textContent).toBe(fr['ban.badge']);
    // Visible : le titre est là, rien n'est caché.
    expect(hote!.querySelector('.tt')?.textContent).toBe('Lovely Day');
    unmount(monte); monte = null;
    monte = mount(LignePisteV2, { target: hote!, props: { piste: LOCALE, onLire: () => {} } });
    await souffler();
    expect(hote!.querySelector('.trk')?.classList.contains('bannie')).toBe(false);
    expect(hote!.querySelector('.bannie-etiq')).toBeNull();
  });
  it('🔴 le clic sur une piste bannie ouvre le dialogue du projet ; « OK » lit, « Annuler » ne lit pas', async () => {
    const lu = vi.fn();
    monte = mount(LignePisteV2, { target: hote!, props: { piste: BANNIE, onLire: lu } });
    await souffler();
    hote!.querySelector<HTMLButtonElement>('.tclick')!.click();
    await souffler();
    let attente = get(dialogs);
    expect(attente.length, 'aucune confirmation demandée').toBe(1);
    expect(attente[0].kind).toBe('confirm');
    expect(attente[0].message).toBe(fr['ban.playConfirm'].replace('{title}', 'Lovely Day'));
    expect(lu).not.toHaveBeenCalled();
    dialogs.settle(attente[0].id, true);
    await souffler();
    expect(lu).toHaveBeenCalledTimes(1);
    // Annuler : rien ne part.
    hote!.querySelector<HTMLButtonElement>('.tclick')!.click();
    await souffler();
    attente = get(dialogs);
    expect(attente.length).toBe(1);
    dialogs.settle(attente[0].id, false);
    await souffler();
    expect(lu).toHaveBeenCalledTimes(1);
  });
  it('une piste non bannie se lit SANS dialogue — le chemin d’avant, intact', async () => {
    const lu = vi.fn();
    monte = mount(LignePisteV2, { target: hote!, props: { piste: LOCALE, onLire: lu } });
    await souffler();
    hote!.querySelector<HTMLButtonElement>('.tclick')!.click();
    await souffler();
    expect(get(dialogs).length).toBe(0);
    expect(lu).toHaveBeenCalledTimes(1);
  });
  it('la ligne se grise dès que le menu a banni, sans recharger la liste', async () => {
    monte = mount(LignePisteV2, { target: hote!, props: { piste: LOCALE, onLire: () => {} } });
    await souffler();
    expect(hote!.querySelector('.trk')?.classList.contains('bannie')).toBe(false);
    surchargesBannissement.set(new Map([[12, true]]));
    await souffler();
    expect(hote!.querySelector('.trk')?.classList.contains('bannie')).toBe(true);
  });
});

describe('#4806 — l’écran « Titres bannis »', () => {
  const LISTE = {
    total: 2,
    items: [
      { track_id: 7, title: 'Song A', artist: 'Artist A', album_id: 3, album_title: 'Album A',
        banned_at: '2026-09-23T10:00:00Z', resolved: true },
      { track_id: 9, title: 'Song B', artist: null, album_id: null, album_title: null,
        banned_at: null, resolved: false },
    ],
  };
  it('🔴 lit GET /library/tracks/banned et rend titre, artiste, album, pochette et bouton Débannir', async () => {
    reponses = [['/library/tracks/banned', LISTE]];
    monte = mount(TitresBannisV2, { target: hote!, props: {} });
    await souffler(20);
    expect(requetes.some((r) => r.method === 'GET' && /\/api\/v1\/library\/tracks\/banned$/.test(r.url))).toBe(true);
    const lignes = [...hote!.querySelectorAll('.ligne')];
    expect(lignes.length).toBe(2);
    expect(lignes[0].querySelector('.tt')?.textContent).toBe('Song A');
    expect(lignes[0].textContent).toContain('Artist A');
    expect(lignes[0].textContent).toContain('Album A');
    expect(lignes[0].querySelector('.cv')).toBeTruthy();
    expect(lignes[0].querySelector('button[data-debannir]')?.textContent).toBe(fr['ban.unban']);
    // Le marqueur orphelin reste listé, et le dit.
    expect(lignes[1].textContent).toContain(fr['ban.orphan']);
    expect(hote!.textContent).toContain(fr['ban.count'].replace('{n}', '2'));
  });
  it('🔴 « Débannir » → DELETE /library/tracks/7/ban, et la ligne disparaît', async () => {
    reponses = [['/library/tracks/banned', LISTE], ['/library/tracks/7/ban', { track_id: 7, banned: false }]];
    monte = mount(TitresBannisV2, { target: hote!, props: {} });
    await souffler(20);
    hote!.querySelector<HTMLButtonElement>('.ligne button[data-debannir]')!.click();
    await souffler(20);
    const del = requetes.find((r) => r.method === 'DELETE');
    expect(del?.url).toMatch(/\/api\/v1\/library\/tracks\/7\/ban$/);
    const restantes = [...hote!.querySelectorAll('.ligne .tt')].map((e) => e.textContent);
    expect(restantes).toEqual(['Song B']);
    expect(get(surchargesBannissement).get(7)).toBe(false);
  });
  it('état vide : « Aucun titre banni. »', async () => {
    reponses = [['/library/tracks/banned', { total: 0, items: [] }]];
    monte = mount(TitresBannisV2, { target: hote!, props: {} });
    await souffler(20);
    expect(hote!.querySelectorAll('.ligne').length).toBe(0);
    expect(hote!.querySelector('.state.vide')?.textContent).toBe(fr['ban.empty']);
  });
});

describe('#4806 — onze langues', () => {
  const CLES = ['ban.ban', 'ban.unban', 'ban.badge', 'ban.playConfirm', 'ban.banned', 'ban.unbanned',
    'ban.error', 'ban.title', 'ban.eyebrow', 'ban.intro', 'ban.empty', 'ban.loadError', 'ban.retry',
    'ban.count', 'ban.orphan'];
  const LANGUES: [string, unknown][] = [['fr', lFr], ['en', lEn], ['de', lDe], ['es', lEs], ['it', lIt],
    ['ro', lRo], ['sv', lSv], ['hu', lHu], ['ja', lJa], ['ko', lKo], ['zh', lZh]];
  it('chaque clé existe dans les 11 fichiers, et « {title} » y survit', () => {
    for (const [nom, dico] of LANGUES) {
      const d = dico as Record<string, string>;
      for (const k of CLES) expect(typeof d[k], `${nom} : ${k}`).toBe('string');
      expect(d['ban.playConfirm'], `${nom} : ban.playConfirm`).toContain('{title}');
      expect(d['ban.count'], `${nom} : ban.count`).toContain('{n}');
    }
  });
});
