// @vitest-environment jsdom
//
// jsdom : sans `window`, `$effect` ne se déclenche pas et l'écran ne lirait
// jamais `/ext/cd/etat`.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import LectureCdV2 from '../../components/v2/LectureCdV2.svelte';
import { preparerLocale, t } from '../i18n';
import { currentZoneId } from '../stores/zones';
import { tuneWS } from '../websocket';
import { cdPlugin, etatChargementCd, chargementDepuisEvenement, type ChargementCd } from '../lectureCd';
import { creerPropositionChargementCd, nomDisqueInsere, type DependancesProposition } from '../propositionChargementCd';
import type { WSEvent } from '../types';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import hu from '../locales/hu';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import vi_ from '../locales/vi';
import zh from '../locales/zh';

/**
 * renesenses/tune-server-rust#6596 — option 3 du fil 2342 (décision du
 * 20/10) : à l'insertion, Tune PROPOSE de charger le disque en mémoire, dit
 * quand il est prêt, et c'est l'utilisateur qui lance la lecture. Rien
 * n'est coupé d'office : ni l'insertion ni le chargement n'appellent
 * `POST /ext/cd/jouer`.
 */

const DISC = 'Wn8eRBtfLDfM0qjYPdxrz.Zjs_U-';
const DISQUE = {
  disc_id: DISC,
  metadonnees: 'musicbrainz',
  titre: 'Kind of Blue',
  artiste: 'Miles Davis',
  release_id: 'r1',
  pochette: null,
  toc: { premiere: 1, derniere: 2, fin: 1000, pistes_de_donnees: [] },
  pistes: [
    { numero: 1, titre: 'So What', artiste: 'Miles Davis', duree_ms: 562000, premier_secteur: 0, secteurs: 1, source_id: 'x/1' },
    { numero: 2, titre: 'Freddie Freeloader', artiste: 'Miles Davis', duree_ms: 586000, premier_secteur: 1, secteurs: 1, source_id: 'x/2' },
  ],
};

function chargement(pourcentage: number, fin: ChargementCd['fin']): ChargementCd {
  return {
    disc_id: DISC, secteurs_charges: pourcentage * 10, secteurs_total: 1000, pourcentage,
    pistes_chargees: [], piste_en_cours: 1, octets_ram: 0, octets_fichier: 0, secteurs_perdus: 0, fin,
  };
}

const INSERE: WSEvent = {
  type: 'cd.disque.insere',
  data: {
    disc_id: DISC, nom: 'Miles Davis — Kind of Blue', album: 'Kind of Blue', artiste: 'Miles Davis',
    pistes: 2, pochette: null, memoire: { disponible: true, actif: true },
  },
};

beforeAll(async () => { await preparerLocale('fr'); });

// ─── La proposition (toasts), sans écran ─────────────────────────────────────

type Toast = { message: string; bouton: string; action: () => void };

function banc(opts: { chargerEchoue?: boolean } = {}) {
  const toasts: Toast[] = [];
  const infos: string[] = [];
  const erreurs: string[] = [];
  const charges: number[] = [];
  const lectures: number[] = [];
  const d: DependancesProposition = {
    proposer: (message, bouton, action) => { toasts.push({ message, bouton, action }); return toasts.length; },
    info: (m) => infos.push(m),
    erreur: (m) => erreurs.push(m),
    retirer: () => {},
    traduire: (cle) => get(t)(cle as any),
    zoneCourante: () => 3,
    charger: () => { charges.push(1); return opts.chargerEchoue ? Promise.reject(new Error('x')) : Promise.resolve({}); },
    jouer: (z) => { lectures.push(z); return Promise.resolve({}); },
  };
  return { traiter: creerPropositionChargementCd(d), toasts, infos, erreurs, charges, lectures };
}

describe('#6596 — proposer de charger le CD inséré, sans rien jouer', () => {
  it('à l’insertion : « Disque inséré : … — Charger en mémoire », et rien ne part seul', () => {
    const b = banc();
    b.traiter(INSERE);
    expect(b.toasts).toHaveLength(1);
    expect(b.toasts[0].message).toBe(fr['v2.cd.insertedPrompt'].replace('{disc}', 'Miles Davis — Kind of Blue'));
    expect(b.toasts[0].bouton).toBe(fr['v2.cd.loadIntoMemory']);
    expect(b.charges, 'le chargement est parti sans le geste').toHaveLength(0);
    expect(b.lectures, 'l’insertion a lancé la lecture').toHaveLength(0);
  });

  it('le geste charge ; prêt : « Disque chargé — Lire », la lecture attend le second geste', async () => {
    const b = banc();
    b.traiter(INSERE);
    b.toasts[0].action();
    await Promise.resolve();
    expect(b.charges).toHaveLength(1);
    expect(b.infos).toEqual([fr['v2.cd.memLoadStarted']]);
    b.traiter({ type: 'cd.memoire.progression', data: chargement(40, null) });
    expect(b.toasts).toHaveLength(1);
    b.traiter({ type: 'cd.memoire.termine', data: chargement(100, 'termine') });
    expect(b.toasts).toHaveLength(2);
    expect(b.toasts[1].message).toBe(fr['v2.cd.memReadyPrompt'].replace('{disc}', 'Miles Davis — Kind of Blue'));
    expect(b.toasts[1].bouton).toBe(fr['v2.cd.playDisc']);
    expect(b.lectures, 'le disque chargé a été lu sans le geste').toHaveLength(0);
    b.toasts[1].action();
    await Promise.resolve();
    expect(b.lectures).toEqual([3]);
  });

  it('un chargement qui échoue le dit ; un refus du serveur aussi', async () => {
    const b = banc();
    b.traiter(INSERE);
    b.toasts[0].action();
    b.traiter({ type: 'cd.memoire.termine', data: chargement(12, 'ejecte') });
    expect(b.erreurs).toEqual([fr['v2.cd.memLoadFailed']]);
    expect(b.toasts).toHaveLength(1);

    const r = banc({ chargerEchoue: true });
    r.traiter(INSERE);
    r.toasts[0].action();
    await Promise.resolve();
    await Promise.resolve();
    expect(r.erreurs).toEqual([fr['v2.cd.memLoadFailed']]);
  });

  it('rien à proposer si le réglage est coupé ; pas de « Lire » pour un chargement d’ailleurs', () => {
    const b = banc();
    b.traiter({ ...INSERE, data: { ...INSERE.data, memoire: { disponible: true, actif: false } } });
    b.traiter({ ...INSERE, data: { ...INSERE.data, memoire: undefined } });
    expect(b.toasts).toHaveLength(0);
    // Chargement lancé par une lecture (ou un autre client) : rien.
    b.traiter({ type: 'cd.memoire.termine', data: chargement(100, 'termine') });
    expect(b.toasts).toHaveLength(0);
    expect(b.lectures).toHaveLength(0);
  });

  it('le nom : celui du serveur, sinon l’album, sinon « album inconnu »', () => {
    expect(nomDisqueInsere({ disc_id: 'd', nom: 'CD audio', album: null }, 'Inconnu')).toBe('Inconnu');
    expect(nomDisqueInsere({ disc_id: 'd', nom: 'CD audio', album: 'Fiction' }, 'Inconnu')).toBe('Fiction');
    expect(nomDisqueInsere({ disc_id: 'd', nom: 'A — B' }, 'Inconnu')).toBe('A — B');
  });

  it('les états du chargement : aucun, en cours, prêt, échec', () => {
    expect(etatChargementCd(null, DISC)).toBe('aucun');
    expect(etatChargementCd({ ...chargement(10, null), disc_id: 'autre' }, DISC)).toBe('aucun');
    expect(etatChargementCd(chargement(10, null), DISC)).toBe('en_cours');
    expect(etatChargementCd(chargement(100, 'termine'), DISC)).toBe('pret');
    expect(etatChargementCd(chargement(5, 'echec'), DISC)).toBe('echec');
    expect(etatChargementCd(chargement(5, 'ejecte'), DISC)).toBe('echec');
    expect(etatChargementCd(chargement(5, 'libere'), DISC)).toBe('aucun');
    expect(chargementDepuisEvenement({ type: 'cd.extraction.progression', data: {} })).toBeNull();
  });

  it('les textes existent dans les douze catalogues', () => {
    const cles = ['v2.cd.insertedPrompt', 'v2.cd.loadIntoMemory', 'v2.cd.loadIntoMemoryHint',
      'v2.cd.memLoadStarted', 'v2.cd.memLoadFailed', 'v2.cd.memReadyPrompt'];
    for (const [l, cat] of Object.entries({ fr, en, de, es, it: it_, hu, ja, ko, ro, sv, vi: vi_, zh })) {
      for (const c of cles) {
        const v = (cat as Record<string, string>)[c];
        expect(typeof v === 'string' && v.trim().length > 0, `${l} : ${c}`).toBe(true);
        if (c.endsWith('Prompt')) expect(v, `${l} : ${c} sans {disc}`).toContain('{disc}');
      }
    }
  });
});

// ─── L'écran Lecture CD ──────────────────────────────────────────────────────

type Appel = { url: string; method: string };
let appels: Appel[] = [];
let etat: Record<string, unknown> = {};
let memoireSrv: Record<string, unknown> = {};
let handlers: ((ev: WSEvent) => void)[] = [];

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  handlers = [];
  etat = { plateforme_prise_en_charge: true, lecteur: '/dev/sr0', presence: 'disque', chargement: null };
  memoireSrv = { disponible: true, actif: true, plafond_mio: 800, chargement: null };
  cdPlugin.set(null);
  currentZoneId.set(3);
  vi.spyOn(tuneWS, 'onEvent').mockImplementation((h) => {
    handlers.push(h);
    return () => { handlers = handlers.filter((x) => x !== h); };
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    appels.push({ url: u, method });
    if (u.includes('/ext/cd/etat')) return reponse(200, etat);
    if (u.includes('/ext/cd/disque')) return reponse(200, DISQUE);
    if (u.includes('/ext/cd/memoire/charger')) {
      memoireSrv = { ...memoireSrv, chargement: chargement(0, null) };
      return reponse(200, memoireSrv);
    }
    if (u.includes('/ext/cd/memoire')) return reponse(200, memoireSrv);
    if (u.includes('/ext/cd/jouer')) return reponse(200, { zone_id: 3, disc_id: DISC, piste: 1, file: 2 });
    if (u.endsWith('/plugins')) return reponse(200, [{ name: 'cd', installed: true, enabled: true }]);
    return reponse(200, {});
  }));
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 6; i++) {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LectureCdV2 as any, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}

const emettre = (ev: WSEvent) => { for (const h of handlers) h(ev); flushSync(); };
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ');

describe('#6596 — écran Lecture CD : charger, suivre, puis lire au choix', () => {
  it('« Charger en mémoire » charge sans jouer ; la progression suit les évènements ; prêt, rien ne joue', async () => {
    const el = await poser();
    const bouton = el.querySelector('button.charger-memoire') as HTMLButtonElement | null;
    expect(bouton, 'bouton « Charger en mémoire » absent').not.toBeNull();
    expect(bouton!.textContent?.trim()).toBe(fr['v2.cd.loadIntoMemory']);
    bouton!.click();
    await laisserFaire();
    expect(appels.filter((a) => a.method === 'POST' && a.url.includes('/ext/cd/memoire/charger'))).toHaveLength(1);

    emettre({ type: 'cd.memoire.progression', data: chargement(37, null) });
    expect(texte(el.querySelector('.chargement'))).toContain(fr['v2.cd.memLoading'].replace('{pct}', '37'));
    expect(el.querySelector('button.charger-memoire'), 'le bouton reste pendant le chargement').toBeNull();

    emettre({ type: 'cd.memoire.termine', data: chargement(100, 'termine') });
    expect(el.querySelector('.chargement')?.classList.contains('fini')).toBe(true);
    expect(texte(el.querySelector('.chargement'))).toContain(fr['v2.cd.memLoaded']);
    expect(el.querySelector('button.lire-disque')?.textContent?.trim()).toBe(fr['v2.cd.playDisc']);

    await vi.advanceTimersByTimeAsync(10_000);
    await laisserFaire();
    expect(appels.filter((a) => a.url.includes('/ext/cd/jouer')), 'la lecture est partie toute seule').toHaveLength(0);
  });

  it('un échec se dit, et « Charger en mémoire » revient', async () => {
    const el = await poser();
    (el.querySelector('button.charger-memoire') as HTMLButtonElement).click();
    await laisserFaire();
    emettre({ type: 'cd.memoire.termine', data: chargement(8, 'echec') });
    expect(texte(el.querySelector('.echec-chargement'))).toContain(fr['v2.cd.memLoadFailed']);
    expect(el.querySelector('button.charger-memoire')).not.toBeNull();
  });

  it('réglage coupé : pas de bouton', async () => {
    memoireSrv = { ...memoireSrv, actif: false };
    const el = await poser();
    expect(el.querySelector('button.charger-memoire')).toBeNull();
  });
});
