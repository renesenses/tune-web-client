// @vitest-environment jsdom
//
// jsdom : sans `window`, `$effect` ne se déclenche pas — un test vert qui
// n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LectureCdV2 from '../../components/v2/LectureCdV2.svelte';
import { preparerLocale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { tuneWS } from '../websocket';
import { cdPlugin, accurateRipDuChargement, type ChargementCd } from '../lectureCd';
import { corpsLancement, cleRefus, depuisMemoire, type EtatExtraction } from '../extractionCd';
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
import el_ from '../locales/el';
import nb_ from '../locales/nb';
import pl_ from '../locales/pl';
import zh from '../locales/zh';

/**
 * tune-server-rust#8514 (fil 2771) — un CD chargé en mémoire :
 * - les CRC AccurateRip calculés AU CHARGEMENT sont visibles ;
 * - « Enregistrer dans la bibliothèque » verse les pistes déjà lues, sans
 *   relire le disque (`depuis_memoire: true`), dans le dossier choisi.
 */

const DISQUE = {
  disc_id: 'Wn8eRBtfLDfM0qjYPdxrz.Zjs_U-',
  metadonnees: 'musicbrainz',
  titre: 'Kind of Blue',
  artiste: 'Miles Davis',
  release_id: 'r1',
  pochette: null,
  pistes: [
    { numero: 1, titre: 'So What', artiste: 'Miles Davis', duree_ms: 562000 },
    { numero: 2, titre: 'Freddie Freeloader', artiste: 'Miles Davis', duree_ms: 586000 },
    { numero: 3, titre: 'Blue in Green', artiste: 'Miles Davis', duree_ms: 337000 },
  ],
};

const REGLAGES = {
  formats: ['flac', 'wav'], format: 'flac', verifications: ['doute', 'toujours'],
  destination: '/music', destination_source: 'reglage', emplacements: ['/music', '/nas/musique'],
};

const CRC = [
  { piste: 1, v1: '1a2b3c4d', v2: '5e6f7081' },
  { piste: 2, v1: '0badf00d', v2: 'deadbeef' },
  { piste: 3, v1: 'cafebabe', v2: '00c0ffee' },
];

function chargement(p: Partial<ChargementCd> = {}): ChargementCd {
  return {
    disc_id: DISQUE.disc_id, secteurs_charges: 100, secteurs_total: 100, pourcentage: 100,
    pistes_chargees: [1, 2, 3], piste_en_cours: 3, octets_ram: 1, octets_fichier: 0, secteurs_perdus: 0,
    accuraterip: CRC, fin: 'termine', ...p,
  };
}

function etatExtraction(p: Partial<EtatExtraction> = {}): EtatExtraction {
  return {
    id: 'm1', statut: 'en_cours', format: 'flac', verification: 'doute', lecteur: 'memoire', source: 'memoire',
    disc_id: DISQUE.disc_id, metadonnees: 'musicbrainz', artiste: 'Miles Davis', album: 'Kind of Blue',
    disque: 1, disques: 1, destination: '/nas/musique', dossier: '/nas/musique/Miles Davis/Kind of Blue',
    piste_courante: 1, pourcentage: 0, debut: 1, fin: null, erreur: null, scan: null,
    pistes: DISQUE.pistes.map((x) => ({
      numero: x.numero, titre: x.titre, statut: 'en_attente', secteurs: 1000, secteurs_lus: 0, pourcentage: 0,
      lectures_supplementaires: 0, secteurs_illisibles: 0, accuraterip_v1: null, accuraterip_v2: null,
      fichier: null, erreur: null,
    })),
    ...p,
  } as EtatExtraction;
}

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];
let charge: ChargementCd | null = chargement();
let refusLancement: { status: number; corps: unknown } | null = null;
let handlers: ((e: WSEvent) => void)[] = [];

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  charge = chargement();
  refusLancement = null;
  handlers = [];
  cdPlugin.set(null);
  currentZoneId.set(3);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.spyOn(tuneWS, 'onEvent').mockImplementation((h) => {
    handlers.push(h);
    return () => { handlers = handlers.filter((x) => x !== h); };
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      appels.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.includes('/ext/cd/etat')) {
        return reponse(200, { plateforme_prise_en_charge: true, lecteur: '/dev/sr0', presence: 'disque', chargement: charge });
      }
      if (u.includes('/ext/cd/disque')) return reponse(200, DISQUE);
      if (u.includes('/ext/cd/memoire')) return reponse(200, { disponible: true, actif: true, chargement: charge });
      if (u.includes('/ext/cd/extraction/reglages')) {
        if (method === 'PUT') return reponse(200, { ...REGLAGES, ...JSON.parse(String(init?.body)) });
        return reponse(200, REGLAGES);
      }
      if (u.includes('/ext/cd/extractions')) {
        if (method === 'POST') {
          if (refusLancement) return reponse(refusLancement.status, refusLancement.corps);
          return reponse(202, etatExtraction());
        }
        return reponse(200, { extractions: [] });
      }
      if (u.endsWith('/plugins')) return reponse(200, [{ name: 'cd', type: 'sdk', installed: true, enabled: true }]);
      return reponse(200, {});
    }),
  );
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.feuille-extraction').forEach((n) => n.closest('.fond')?.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 8; i++) {
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

const feuille = () => document.querySelector('.feuille-extraction') as HTMLElement | null;
const posts = () => appels.filter((a) => a.url.includes('/ext/cd/extractions') && a.method === 'POST');
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('#8514 — AccurateRip au chargement', () => {
  it('disque entier en mémoire : les CRC du chargement sont visibles, piste par piste', async () => {
    const el = await poser();
    const d = el.querySelector('.accuraterip-chargement');
    expect(d, 'le détail AccurateRip du chargement').not.toBeNull();
    expect(texte(d!.querySelector('summary'))).toBe(fr['v2.cd.memAccurateRip'].replace('{n}', '3'));
    const lignes = [...d!.querySelectorAll('li')].map(texte);
    expect(lignes).toEqual(CRC.map((c) => `${c.piste} ${fr['v2.cd.rip.crc'].replace('{crc1}', c.v1).replace('{crc2}', c.v2)}`));
  });

  it('contre-épreuve : chargement en cours, ou d’un autre disque, ou serveur antérieur : rien', async () => {
    for (const c of [
      chargement({ fin: null, pourcentage: 40 }),
      chargement({ disc_id: 'autre' }),
      chargement({ accuraterip: undefined }),
    ]) {
      charge = c;
      const el = await poser();
      expect(el.querySelector('li.piste'), 'l’écran CD est bien rendu').not.toBeNull();
      expect(el.querySelector('.accuraterip-chargement')).toBeNull();
      unmount(monte!); monte = null; hote?.remove(); hote = null;
    }
  });

  it('accurateRipDuChargement : seulement le disque affiché, entièrement chargé', () => {
    expect(accurateRipDuChargement(chargement(), DISQUE.disc_id)).toEqual(CRC);
    expect(accurateRipDuChargement(chargement({ fin: null }), DISQUE.disc_id)).toEqual([]);
    expect(accurateRipDuChargement(chargement({ fin: 'libere' }), DISQUE.disc_id)).toEqual([]);
    expect(accurateRipDuChargement(chargement(), 'autre')).toEqual([]);
    expect(accurateRipDuChargement(null, DISQUE.disc_id)).toEqual([]);
  });
});

describe('#8514 — « Enregistrer dans la bibliothèque » sans relire le disque', () => {
  it('le disque prêt en mémoire : la feuille part avec `depuis_memoire`, dans le dossier choisi, sans vérification', async () => {
    const el = await poser();
    const bouton = el.querySelector('button.enregistrer-memoire') as HTMLButtonElement;
    expect(texte(bouton)).toBe(fr['v2.cd.save.action']);
    expect(el.querySelector('button.extraire'), 'l’extraction depuis le lecteur reste offerte').not.toBeNull();
    bouton.click();
    await laisserFaire();
    const f = feuille()!;
    expect(texte(f.querySelector('h2'))).toBe(fr['v2.cd.save.sheetTitle']);
    expect(texte(f.querySelector('.indice-memoire'))).toBe(fr['v2.cd.save.hint']);
    expect(f.querySelector('select.verification'), 'rien à relire : pas de vérification').toBeNull();
    const dest = f.querySelector('select.destination') as HTMLSelectElement;
    dest.value = '/nas/musique'; dest.dispatchEvent(new Event('change'));
    flushSync();
    expect(texte(f.querySelector('button.lancer'))).toBe(fr['v2.cd.save.start']);
    (f.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await laisserFaire();

    expect(posts().map((a) => a.body)).toEqual([{ format: 'flac', depuis_memoire: true, destination: '/nas/musique' }]);
    expect(feuille()).toBeNull();
    expect(texte(el.querySelector('.suivi .statut'))).toBe(fr['v2.cd.save.running']);
    handlers.forEach((h) => h({ type: 'cd.extraction.terminee', data: etatExtraction({ statut: 'terminee', pourcentage: 100, scan: 'lance' }) }));
    await laisserFaire();
    expect(texte(el.querySelector('.suivi .statut'))).toBe(fr['v2.cd.save.done']);
  });

  it('contre-épreuve : « Extraire » reste une extraction depuis le lecteur (vérification, pas de `depuis_memoire`)', async () => {
    const el = await poser();
    (el.querySelector('button.extraire') as HTMLButtonElement).click();
    await laisserFaire();
    expect(texte(feuille()!.querySelector('h2'))).toBe(fr['v2.cd.rip.sheetTitle']);
    expect(feuille()!.querySelector('select.verification')).not.toBeNull();
    (feuille()!.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await laisserFaire();
    expect(posts().map((a) => a.body)).toEqual([{ format: 'flac', verification: 'doute', destination: '/music' }]);
  });

  it('pas de bouton tant que le disque n’est pas entier en mémoire', async () => {
    for (const c of [chargement({ fin: null, pourcentage: 40 }), chargement({ fin: 'echec' }), null]) {
      charge = c;
      const el = await poser();
      expect(el.querySelector('button.extraire')).not.toBeNull();
      expect(el.querySelector('button.enregistrer-memoire')).toBeNull();
      unmount(monte!); monte = null; hote?.remove(); hote = null;
    }
  });

  it('refus `memoire_incomplete` : une phrase, jamais le code', async () => {
    refusLancement = { status: 409, corps: { error: 'memoire_incomplete', message: 'x' } };
    const el = await poser();
    (el.querySelector('button.enregistrer-memoire') as HTMLButtonElement).click();
    await laisserFaire();
    (feuille()!.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await laisserFaire();
    expect(texte(feuille()!.querySelector('.err'))).toBe(fr['v2.cd.save.err.notLoaded']);
    expect(cleRefus('memoire_incomplete')).toBe('v2.cd.save.err.notLoaded');
  });

  it('aides pures : corps et source', () => {
    const s = { format: 'wav' as const, destination: '/music', verification: 'toujours' as const, pistes: [1, 2, 3],
      artiste: 'Miles Davis', album: 'Kind of Blue', titres: {} };
    expect(corpsLancement({ ...s, depuisMemoire: true }, DISQUE)).toEqual({ format: 'wav', depuis_memoire: true, destination: '/music' });
    expect(corpsLancement(s, DISQUE)).toEqual({ format: 'wav', verification: 'toujours', destination: '/music' });
    expect(depuisMemoire(etatExtraction())).toBe(true);
    expect(depuisMemoire(etatExtraction({ source: 'lecteur' }))).toBe(false);
    expect(depuisMemoire(etatExtraction({ source: undefined }))).toBe(false);
  });

  it('les textes existent dans les quinze catalogues', () => {
    const cles = ['v2.cd.save.action', 'v2.cd.save.sheetTitle', 'v2.cd.save.hint', 'v2.cd.save.start',
      'v2.cd.save.running', 'v2.cd.save.done', 'v2.cd.save.err.notLoaded', 'v2.cd.memAccurateRip'];
    const catalogues = { fr, en, de, es, it: it_, hu, ja, ko, ro, sv, vi: vi_, el: el_, nb: nb_, pl: pl_, zh };
    expect(Object.keys(catalogues)).toHaveLength(15);
    for (const [l, cat] of Object.entries(catalogues)) {
      for (const c of cles) {
        const v = (cat as Record<string, string>)[c];
        expect(typeof v === 'string' && v.trim().length > 0, `${l} : ${c}`).toBe(true);
        if (c === 'v2.cd.memAccurateRip') expect(v, `${l} : ${c} sans {n}`).toContain('{n}');
      }
    }
  });
});
