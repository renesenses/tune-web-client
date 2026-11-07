// @vitest-environment jsdom
//
// tune-server-rust#8066 (forum, fil 2691) — « Remplacer l'indisponible » et
// « Réparer la playlist ». On MONTE la fiche playlist et on lit les requêtes
// réellement émises vers le serveur (simulé).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import lFr from '../locales/fr';
import { notifications } from '../stores/notifications';
import { aDesIndisponibles, issueDe, peutRemplacer, pourcent } from '../remplacementIndisponibles';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
/** [motif, méthode | '*', statut, corps] — le premier qui convient gagne. */
let reponses: [string, string, number, unknown][] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function attendreQue(condition: () => boolean, quoi: string) {
  await vi.waitFor(() => { flushSync(); if (!condition()) throw new Error(`attente expirée : ${quoi}`); },
    { timeout: 25_000, interval: 10 });
}

const LOCALES = [
  { id: null, entry_id: 10, title: 'Angel', artist_name: 'Massive Attack', source: 'qobuz', source_id: '1', disponible: true },
  { id: null, entry_id: 11, title: 'Teardrop', artist_name: 'Massive Attack', source: 'qobuz', source_id: '2', disponible: false },
  { id: 7, entry_id: 12, title: 'Fichier local', artist_name: 'X', source: 'local', disponible: false },
];
const CANDIDATS = [
  { source: 'qobuz', source_id: '20', title: 'Teardrop', artist_name: 'Massive Attack', album_title: 'Mezzanine', duration_ms: 331000, score: 0.95, sure: true },
  { source: 'qobuz', source_id: '21', title: 'Teardrop', artist_name: 'Massive Attack', album_title: 'Mezzanine (Deluxe)', duration_ms: 330000, score: 0.93, sure: true },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  reponses = [];
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    const trouve = reponses.find(([motif, m]) => url.includes(motif) && (m === '*' || m === method));
    const [statut, charge] = trouve ? [trouve[2], trouve[3]] : [200, {}];
    return {
      ok: statut >= 200 && statut < 300, status: statut,
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
  currentZoneId.set(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function ouvrir(item: any, titre: string) {
  monte = mount(PlaylistDetailV2, { target: hote!, props: { item, onClose: () => {} } });
  await attendreQue(() => (hote!.textContent ?? '').includes(titre), 'les titres affichés');
}
const ouvrirLocale = () => ouvrir({ kind: 'local', pl: { id: 5, name: 'Ma liste', track_count: 3 } }, 'Teardrop');
const boutonsRemplacer = () => [...hote!.querySelectorAll<HTMLButtonElement>('button[data-remplacer-indisponible]')];
const boutonReparer = () => hote!.querySelector<HTMLButtonElement>('button[data-reparer-playlist]');
const modale = () => document.querySelector<HTMLElement>('[role="dialog"][data-remplacer-indisponible]');
const posts = () => requetes.filter((r) => r.method === 'POST');

describe('#8066 — règles pures', () => {
  it('seul un titre DE SERVICE indisponible, là où l’on peut écrire, se remplace', () => {
    expect(peutRemplacer(LOCALES[1], true)).toBe(true);
    expect(peutRemplacer(LOCALES[1], false), 'playlist non modifiable').toBe(false);
    expect(peutRemplacer(LOCALES[0], true), 'disponible').toBe(false);
    expect(peutRemplacer(LOCALES[2], true), 'piste locale').toBe(false);
    expect(peutRemplacer({ ...LOCALES[1], disponible: undefined }, true), 'le service ne dit rien').toBe(false);
    expect(aDesIndisponibles(LOCALES, true)).toBe(true);
    expect(aDesIndisponibles([LOCALES[0], LOCALES[2]], true)).toBe(false);
  });
  it('les refus documentés deviennent des issues', () => {
    expect(issueDe({ replaced: true, track: {} }).etat).toBe('remplace');
    expect(issueDe({ code: 'choix_requis', candidates: CANDIDATS })).toEqual({ etat: 'choix', candidats: CANDIDATS });
    expect(issueDe({ code: 'aucun_candidat' }).etat).toBe('aucun');
    expect(issueDe({ code: 'playlist_non_modifiable', error: 'non' })).toEqual({ etat: 'refus', message: 'non' });
    expect(pourcent(0.954)).toBe(95);
  });
});

describe('#8066 — fiche d’une playlist Tune', () => {
  it('🔴 un seul bouton, sur le titre indisponible ; un candidat sûr remplace directement', async () => {
    reponses = [
      ['/playlists/5/tracks/11/replace', 'POST', 200, { replaced: true, entry_id: 11, position: 1 }],
      ['/playlists/5/tracks', 'GET', 200, LOCALES],
    ];
    await ouvrirLocale();
    expect(boutonsRemplacer().length, 'un bouton par titre de service indisponible, pas sur la piste locale').toBe(1);
    expect(boutonsRemplacer()[0].getAttribute('aria-label')).toBe(fr['v2.pl.replaceUnavailable']);
    const lectures = requetes.filter((r) => r.method === 'GET' && r.url.endsWith('/playlists/5/tracks')).length;
    boutonsRemplacer()[0].click();
    await souffler();
    expect(posts()[0]?.url).toMatch(/\/api\/v1\/playlists\/5\/tracks\/11\/replace$/);
    expect(posts()[0]?.body, 'sans choix : le serveur prend le seul candidat sûr').toEqual({});
    await attendreQue(() => requetes.filter((r) => r.method === 'GET' && r.url.endsWith('/playlists/5/tracks')).length > lectures, 'la playlist relue');
    expect(modale(), 'aucune modale : remplacement direct').toBeNull();
  });

  it('🔴 plusieurs candidats : la modale les montre avec leur score, le choix part au serveur', async () => {
    reponses = [
      ['/playlists/5/tracks/11/replace', 'POST', 409, { code: 'choix_requis', error: 'choisir', candidates: CANDIDATS }],
      ['/playlists/5/tracks', 'GET', 200, LOCALES],
    ];
    await ouvrirLocale();
    boutonsRemplacer()[0].click();
    await attendreQue(() => modale() != null, 'la modale de choix');
    const lignes = [...modale()!.querySelectorAll('[data-candidat]')];
    expect(lignes.map((l) => l.getAttribute('data-candidat'))).toEqual(['20', '21']);
    expect(lignes[1].textContent).toContain('Mezzanine (Deluxe)');
    expect(lignes[1].textContent).toContain('93 %');
    expect(lignes[1].textContent).toContain('5:30');
    reponses.unshift(['/playlists/5/tracks/11/replace', 'POST', 200, { replaced: true }]);
    lignes[1].querySelector<HTMLButtonElement>('button')!.click();
    await souffler();
    expect(posts().at(-1)?.body).toEqual({ source_id: '21' });
    await attendreQue(() => modale() == null, 'la modale refermée après le remplacement');
  });

  it('aucun candidat : on le dit, rien ne s’ouvre', async () => {
    reponses = [
      ['/replace', 'POST', 404, { code: 'aucun_candidat', error: 'rien', candidates: [] }],
      ['/playlists/5/tracks', 'GET', 200, LOCALES],
    ];
    const info = vi.spyOn(notifications, 'info');
    await ouvrirLocale();
    boutonsRemplacer()[0].click();
    await souffler();
    expect(modale()).toBeNull();
    expect(info).toHaveBeenCalledWith(fr['v2.pl.replaceNone'].replace('{title}', 'Teardrop'), 5000);
  });

  it('🔴 « Réparer la playlist » rend son rapport, et « Choisir » ouvre les candidats', async () => {
    reponses = [
      ['/playlists/5/repair', 'POST', 200, {
        threshold: 0.9, examined: 2,
        replaced: [{ entry_id: 11, position: 1, title: 'Teardrop', artist_name: 'Massive Attack', score: 0.95 }],
        to_choose: [{ entry_id: 11, position: 1, title: 'Teardrop', artist_name: 'Massive Attack', candidates: CANDIDATS }],
        no_candidate: [], errors: [],
      }],
      ['/playlists/5/tracks', 'GET', 200, LOCALES],
    ];
    await ouvrirLocale();
    expect(boutonReparer(), 'le bouton manque alors qu’un titre est indisponible').toBeTruthy();
    boutonReparer()!.click();
    await attendreQue(() => modale() != null, 'le rapport');
    expect(posts()[0]?.url).toMatch(/\/api\/v1\/playlists\/5\/repair$/);
    expect(modale()!.textContent).toContain(fr['v2.pl.repairReplaced'].replace('{n}', '1'));
    expect(modale()!.textContent).toContain(fr['v2.pl.repairToChoose'].replace('{n}', '1'));
    modale()!.querySelector<HTMLButtonElement>('[data-rapport="to_choose"] button')!.click();
    await attendreQue(() => (modale()?.querySelectorAll('[data-candidat]').length ?? 0) === 2, 'les candidats de la ligne');
  });

  it('sans titre indisponible : ni bouton Remplacer, ni Réparer', async () => {
    reponses = [['/playlists/5/tracks', 'GET', 200, [LOCALES[0], LOCALES[2]]]];
    await ouvrir({ kind: 'local', pl: { id: 5, name: 'Ma liste', track_count: 2 } }, 'Angel');
    expect(boutonsRemplacer().length).toBe(0);
    expect(boutonReparer()).toBeNull();
  });
});

describe('#8066 — fiche d’une playlist du service', () => {
  const SERVICE = [
    { title: 'Angel', artist_name: 'Massive Attack', source_id: '1', disponible: true },
    { title: 'Teardrop', artist_name: 'Massive Attack', source_id: '2', disponible: false },
  ];
  it('🔴 playlist à soi : le remplacement vise le RANG et dit le titre vu', async () => {
    reponses = [
      ['/streaming/qobuz/playlists/11/tracks/1/replace', 'POST', 200, { replaced: true }],
      ['/streaming/qobuz/playlists/11/tracks', 'GET', 200, SERVICE],
    ];
    await ouvrir({ kind: 'streaming', service: 'qobuz', pl: { source_id: '11', name: 'À moi', editable: true } }, 'Teardrop');
    expect(boutonsRemplacer().length).toBe(1);
    boutonsRemplacer()[0].click();
    await souffler();
    expect(posts()[0]?.url).toMatch(/\/api\/v1\/streaming\/qobuz\/playlists\/11\/tracks\/1\/replace$/);
    expect(posts()[0]?.body).toEqual({ track_id: '2' });
  });

  it('🔴 playlist suivie (editable false) ou serveur muet : aucun geste d’écriture', async () => {
    for (const editable of [false, undefined]) {
      reponses = [['/streaming/qobuz/playlists/11/tracks', 'GET', 200, SERVICE]];
      await ouvrir({ kind: 'streaming', service: 'qobuz', pl: { source_id: '11', name: 'Suivie', editable } }, 'Teardrop');
      expect(boutonsRemplacer().length, `editable=${editable}`).toBe(0);
      expect(boutonReparer()).toBeNull();
      unmount(monte!); monte = null;
    }
  });

  it('le refus du serveur (403) est dit en clair', async () => {
    reponses = [
      ['/streaming/qobuz/playlists/11/tracks/1/replace', 'POST', 403, { code: 'playlist_non_modifiable', error: 'Cette playlist qobuz n’est pas modifiable par votre compte' }],
      ['/streaming/qobuz/playlists/11/tracks', 'GET', 200, SERVICE],
    ];
    const erreur = vi.spyOn(notifications, 'error');
    await ouvrir({ kind: 'streaming', service: 'qobuz', pl: { source_id: '11', name: 'À moi', editable: true } }, 'Teardrop');
    boutonsRemplacer()[0].click();
    await souffler();
    expect(erreur).toHaveBeenCalledWith('Cette playlist qobuz n’est pas modifiable par votre compte');
  });
});

describe('#8066 — i18n dans les 15 langues', () => {
  const CLES = ['replaceUnavailable', 'replaceTitle', 'replaceChoose', 'replaceDone', 'replaceNone', 'replaceError',
    'replaceNotEditable', 'replaceScore', 'replaceSure', 'replaceAction', 'repair', 'repairRunning', 'repairReport',
    'repairReplaced', 'repairToChoose', 'repairNoCandidate', 'repairErrors', 'repairNothing', 'repairChoose'];
  it('chaque langue porte chaque clé, et les variables restent', () => {
    expect(ONZE_LANGUES.length).toBe(15);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const c of CLES) {
        const k = `v2.pl.${c}`;
        expect(d[k], `${l} : ${k}`).toBeTruthy();
        for (const v of fr[k].match(/\{\w+\}/g) ?? []) expect(d[k], `${l} : ${k} perd ${v}`).toContain(v);
      }
    }
  });
});
