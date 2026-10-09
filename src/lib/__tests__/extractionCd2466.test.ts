// @vitest-environment jsdom
//
// jsdom : sans `window`, `$effect` ne se déclenche pas — un test vert qui
// n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import LectureCdV2 from '../../components/v2/LectureCdV2.svelte';
import { preparerLocale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import { dialogs } from '../stores/dialogs';
import { preferences } from '../stores/preferences';
import { tuneWS } from '../websocket';
import { cdPlugin } from '../lectureCd';
import {
  corpsLancement, appliquerEvenement, albumIdDepuisRecherche, extractionDisponible, cleRefus,
  type EtatExtraction,
} from '../extractionCd';
import type { WSEvent } from '../types';
import fr from '../locales/fr';

/**
 * Extraction d'un CD vers la bibliothèque — tune-server-rust#2466 (serveur :
 * tune-server-rust#5938). Contrat : `lib/extractionCd.ts`.
 *
 * Gardé ici : la feuille (défauts, corrections seules envoyées, réglage
 * mémorisé), le suivi par les évènements `cd.extraction.*` (avancement,
 * secteurs illisibles, CRC en Expert, état final puis album après le scan),
 * l'annulation, les refus dits par une phrase, et l'action absente sur un
 * serveur antérieur (404).
 */

const DISQUE = {
  disc_id: 'Wn8eRBtfLDfM0qjYPdxrz.Zjs_U-',
  metadonnees: 'musicbrainz',
  titre: 'Kind of Blue',
  artiste: 'Miles Davis',
  release_id: 'r1',
  pochette: null,
  pistes: [
    { numero: 1, titre: 'So What', artiste: 'Miles Davis', duree_ms: 562000, premier_secteur: 0, secteurs: 1, source_id: 'x/1' },
    { numero: 2, titre: 'Freddie Freeloader', artiste: 'Miles Davis', duree_ms: 586000, premier_secteur: 1, secteurs: 1, source_id: 'x/2' },
    { numero: 3, titre: 'Blue in Green', artiste: 'Miles Davis', duree_ms: 337000, premier_secteur: 2, secteurs: 1, source_id: 'x/3' },
  ],
};

const REGLAGES = {
  formats: ['flac', 'wav'], format: 'flac', verifications: ['doute', 'toujours'],
  destination: '/music', destination_source: 'reglage', emplacements: ['/music', '/nas/musique'],
};

function etatExtraction(p: Partial<EtatExtraction> = {}): EtatExtraction {
  return {
    id: 'e1', statut: 'en_cours', format: 'flac', verification: 'doute', lecteur: '/dev/sr0',
    disc_id: DISQUE.disc_id, metadonnees: 'musicbrainz', artiste: 'Miles Davis', album: 'Kind of Blue',
    disque: 1, disques: 1, destination: '/music', dossier: '/music/Miles Davis/Kind of Blue',
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
/** `null` = serveur antérieur : la route n'existe pas (404 nu d'axum). */
let reglages: unknown = REGLAGES;
let extractionsConnues: EtatExtraction[] = [];
let refusLancement: { status: number; corps: unknown } | null = null;
let handlers: ((e: WSEvent) => void)[] = [];

function reponse(status: number, corps: unknown, brut = false): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers(brut ? {} : { 'content-type': 'application/json' }),
    json: async () => (brut ? Promise.reject(new SyntaxError('vide')) : corps),
    text: async () => (brut ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  reglages = REGLAGES;
  extractionsConnues = [];
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
      if (u.includes('/ext/cd/etat')) return reponse(200, { plateforme_prise_en_charge: true, lecteur: '/dev/sr0', presence: 'disque' });
      if (u.includes('/ext/cd/disque')) return reponse(200, DISQUE);
      if (u.includes('/ext/cd/extraction/reglages')) {
        if (reglages === null) return reponse(404, null, true);
        if (method === 'PUT') {
          const b = JSON.parse(String(init?.body));
          reglages = { ...(reglages as object), ...b, destination_source: 'reglage' };
        }
        return reponse(200, reglages);
      }
      if (/\/ext\/cd\/extractions\/[^/]+$/.test(u)) {
        if (method === 'DELETE') return reponse(202, etatExtraction({ statut: 'en_cours' }));
        return reponse(200, extractionsConnues[0] ?? etatExtraction());
      }
      if (u.includes('/ext/cd/extractions')) {
        if (method === 'POST') {
          if (refusLancement) return reponse(refusLancement.status, refusLancement.corps);
          const b = JSON.parse(String(init?.body ?? '{}'));
          return reponse(202, etatExtraction({ format: b.format ?? 'flac' }));
        }
        return reponse(200, { extractions: extractionsConnues });
      }
      if (u.includes('/library/search')) {
        return reponse(200, {
          tracks: [{ id: 7, title: 'So What', album_id: 42, file_path: '/music/Miles Davis/Kind of Blue/01 - So What.flac' }],
          albums: [], artists: [],
        });
      }
      if (u.includes('/library/albums/42/')) return reponse(200, []);
      if (/\/library\/albums\/42$/.test(u)) return reponse(200, { id: 42, title: 'Kind of Blue', artist_name: 'Miles Davis' });
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

async function emettre(type: string, data: unknown) {
  handlers.forEach((h) => h({ type, data }));
  await laisserFaire();
}

const feuille = () => document.querySelector('.feuille-extraction') as HTMLElement | null;
const appelsDe = (motif: string, method: string) => appels.filter((a) => a.url.includes(motif) && a.method === method);
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function ouvrirFeuille(el: HTMLElement) {
  (el.querySelector('button.extraire') as HTMLButtonElement).click();
  await laisserFaire();
}

async function lancer() {
  (feuille()!.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
  await laisserFaire();
}

describe('Extraction CD — disponibilité', () => {
  it('serveur antérieur (404 sur les routes) : aucune action « Extraire »', async () => {
    reglages = null;
    const el = await poser();
    expect(el.querySelector('li.piste'), 'l’écran CD est bien rendu').not.toBeNull();
    expect(appelsDe('/ext/cd/extraction/reglages', 'GET')).toHaveLength(1);
    expect(el.querySelector('button.extraire')).toBeNull();
    expect(el.querySelector('.err')).toBeNull();
  });

  it('contre-épreuve : un serveur qui a les routes montre l’action', async () => {
    const el = await poser();
    expect(texte(el.querySelector('button.extraire'))).toBe(fr['v2.cd.rip.action']);
  });

  it('une réponse sans emplacements ni formats ne prouve rien : pas d’action', () => {
    expect(extractionDisponible({})).toBe(false);
    expect(extractionDisponible(null)).toBe(false);
    expect(extractionDisponible(REGLAGES)).toBe(true);
  });
});

describe('Extraction CD — feuille de lancement', () => {
  it('défauts : FLAC, destination du réglage, toutes les pistes, MusicBrainz, vérification « doute »', async () => {
    const el = await poser();
    await ouvrirFeuille(el);
    const f = feuille()!;
    expect(f).not.toBeNull();
    expect((f.querySelector('input[name=format][value=flac]') as HTMLInputElement).checked).toBe(true);
    expect((f.querySelector('select.destination') as HTMLSelectElement).value).toBe('/music');
    expect((f.querySelector('select.verification') as HTMLSelectElement).value).toBe('doute');
    expect([...f.querySelectorAll('input.coche')].map((c) => (c as HTMLInputElement).checked)).toEqual([true, true, true]);
    expect((f.querySelector('input.artiste') as HTMLInputElement).value).toBe('Miles Davis');
    expect((f.querySelector('input.album') as HTMLInputElement).value).toBe('Kind of Blue');
    expect([...f.querySelectorAll('input.titre-piste')].map((c) => (c as HTMLInputElement).value))
      .toEqual(['So What', 'Freddie Freeloader', 'Blue in Green']);

    // Lancer sans rien changer : aucune correction, aucun réglage réécrit.
    await lancer();
    expect(appelsDe('/extraction/reglages', 'PUT')).toHaveLength(0);
    expect(appelsDe('/ext/cd/extractions', 'POST').map((a) => a.body))
      .toEqual([{ format: 'flac', verification: 'doute', destination: '/music' }]);
    expect(feuille(), 'la feuille se ferme').toBeNull();
    expect(el.querySelector('.suivi')).not.toBeNull();
  });

  it('les choix et les corrections partent ; le format et la destination deviennent le réglage', async () => {
    const el = await poser();
    await ouvrirFeuille(el);
    const f = feuille()!;
    const wav = f.querySelector('input[name=format][value=wav]') as HTMLInputElement;
    wav.click();
    const dest = f.querySelector('select.destination') as HTMLSelectElement;
    dest.value = '/nas/musique'; dest.dispatchEvent(new Event('change'));
    const verif = f.querySelector('select.verification') as HTMLSelectElement;
    verif.value = 'toujours'; verif.dispatchEvent(new Event('change'));
    (f.querySelectorAll('input.coche')[1] as HTMLInputElement).click();
    const t3 = f.querySelectorAll('input.titre-piste')[2] as HTMLInputElement;
    t3.value = 'Blue in Green (take 2)'; t3.dispatchEvent(new Event('input'));
    const album = f.querySelector('input.album') as HTMLInputElement;
    album.value = 'Kind of Blue (Legacy)'; album.dispatchEvent(new Event('input'));
    flushSync();
    await lancer();

    expect(appelsDe('/extraction/reglages', 'PUT').map((a) => a.body))
      .toEqual([{ format: 'wav', destination: '/nas/musique' }]);
    expect(appelsDe('/ext/cd/extractions', 'POST').map((a) => a.body)).toEqual([{
      format: 'wav', verification: 'toujours', destination: '/nas/musique', pistes: [1, 3],
      album: 'Kind of Blue (Legacy)', titres: { 3: 'Blue in Green (take 2)' },
    }]);
  });

  it('un refus du contrat se dit par une phrase, jamais par son code ; la feuille reste ouverte', async () => {
    refusLancement = { status: 409, corps: { error: 'extraction_en_cours', message: 'x', extraction_id: 'zz' } };
    const el = await poser();
    await ouvrirFeuille(el);
    await lancer();
    const err = feuille()!.querySelector('.err');
    expect(texte(err)).toBe(fr['v2.cd.rip.err.ripRunning']);
    expect(texte(err)).not.toContain('extraction_en_cours');
  });

  it('contre-épreuve : chaque motif a sa phrase, un motif inconnu tombe sur la phrase générique', () => {
    expect(cleRefus('fichiers_existants')).toBe('v2.cd.rip.err.filesExist');
    expect(cleRefus('lecture_en_cours')).toBe('v2.cd.rip.err.playing');
    expect(cleRefus('hors_bibliotheque')).toBe('v2.cd.rip.err.outsideLibrary');
    expect(cleRefus('quelque_chose')).toBe('v2.cd.rip.err.generic');
    expect(cleRefus(null)).toBe('v2.cd.rip.err.generic');
  });
});

describe('Extraction CD — suivi par les évènements', () => {
  async function lancee(): Promise<HTMLDivElement> {
    const el = await poser();
    await ouvrirFeuille(el);
    await lancer();
    return el;
  }

  it('progression par piste, secteurs illisibles, CRC en Expert, puis l’album après le scan', async () => {
    const el = await lancee();
    const e = etatExtraction({ pourcentage: 40, piste_courante: 2 });
    e.pistes[0] = { ...e.pistes[0], statut: 'terminee', pourcentage: 100, secteurs_illisibles: 3,
      accuraterip_v1: '1a2b3c4d', accuraterip_v2: '5e6f7a8b', fichier: '/music/Miles Davis/Kind of Blue/01 - So What.flac' };
    e.pistes[1] = { ...e.pistes[1], statut: 'extraction', pourcentage: 25 };
    await emettre('cd.extraction.progression', e);

    const lignes = [...el.querySelectorAll('li.piste-suivi')];
    expect(texte(lignes[1].querySelector('.pc'))).toBe('25 %');
    expect(lignes[1].classList.contains('courante')).toBe(true);
    expect(texte(lignes[0].querySelector('.illisibles'))).toBe(fr['v2.cd.rip.unreadable'].replace('{n}', '3'));
    expect(texte(el.querySelector('.suivi .avert'))).toBe(fr['v2.cd.rip.unreadableWarn']);
    expect(texte(lignes[0].querySelector('.crc'))).toContain('1a2b3c4d');
    expect(texte(el.querySelector('.suivi .global'))).toBe('40 %');

    // Fin, scan lancé : on attend `library.scan.completed` pour proposer l'album.
    await emettre('cd.extraction.terminee', { ...e, statut: 'terminee', pourcentage: 100, piste_courante: null, scan: 'lance' });
    expect(texte(el.querySelector('.suivi .statut'))).toBe(fr['v2.cd.rip.done']);
    expect(el.querySelector('button.ouvrir-album')).toBeNull();
    expect(texte(el.querySelector('.attente-scan'))).toBe(fr['v2.cd.rip.scanWaiting']);
    await emettre('library.scan.completed', {});
    const ouvrir = el.querySelector('button.ouvrir-album') as HTMLButtonElement;
    expect(ouvrir).not.toBeNull();
    ouvrir.click();
    await laisserFaire();
    expect(appels.some((a) => /\/library\/albums\/42$/.test(a.url)), 'l’album est retrouvé par le chemin du fichier').toBe(true);
    expect(document.querySelector('.v2-detail'), 'la fiche de l’album s’ouvre').not.toBeNull();
  });

  it('contre-épreuve : hors Expert, pas de CRC ; un évènement d’une autre extraction ne remplace pas la nôtre', async () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
    const el = await lancee();
    const e = etatExtraction({ pourcentage: 10 });
    e.pistes[0] = { ...e.pistes[0], accuraterip_v1: '1a2b3c4d', accuraterip_v2: '5e6f7a8b' };
    await emettre('cd.extraction.progression', e);
    expect(el.querySelector('.crc')).toBeNull();
    await emettre('cd.extraction.progression', etatExtraction({ id: 'autre', pourcentage: 99 }));
    expect(texte(el.querySelector('.suivi .global'))).toBe('10 %');
  });

  it('un échec dit sa cause par une phrase', async () => {
    const el = await lancee();
    await emettre('cd.extraction.terminee', etatExtraction({ statut: 'echec', erreur: { code: 'disque_retire', message: 'x' } }));
    expect(texte(el.querySelector('.suivi .err'))).toBe(fr['v2.cd.rip.err.discRemoved']);
  });
});

describe('Extraction CD — annulation', () => {
  const enAttente = () => get(dialogs)[0] as { id: number; message: string } | undefined;

  it('« Annuler » demande confirmation, envoie DELETE, et l’état final « annulée » arrive par l’évènement', async () => {
    const el = await poser();
    await ouvrirFeuille(el);
    await lancer();
    (el.querySelector('button.annuler') as HTMLButtonElement).click();
    await laisserFaire();
    expect(enAttente()?.message).toBe(fr['v2.cd.rip.cancelConfirm']);
    dialogs.settle(enAttente()!.id, true);
    await laisserFaire();
    expect(appelsDe('/ext/cd/extractions/e1', 'DELETE')).toHaveLength(1);
    expect(texte(el.querySelector('.suivi .statut'))).toBe(fr['v2.cd.rip.cancelling']);
    await emettre('cd.extraction.terminee', etatExtraction({ statut: 'annulee' }));
    expect(texte(el.querySelector('.suivi .statut'))).toBe(fr['v2.cd.rip.cancelled']);
    expect(el.querySelector('button.annuler')).toBeNull();
  });

  it('contre-épreuve : confirmation refusée, rien n’est annulé', async () => {
    const el = await poser();
    await ouvrirFeuille(el);
    await lancer();
    (el.querySelector('button.annuler') as HTMLButtonElement).click();
    await laisserFaire();
    dialogs.settle(enAttente()!.id, false);
    await laisserFaire();
    expect(appelsDe('/ext/cd/extractions/e1', 'DELETE')).toHaveLength(0);
    expect(texte(el.querySelector('.suivi .statut'))).toBe(fr['v2.cd.rip.running']);
  });

  it('une extraction déjà en cours (lancée ailleurs) est reprise à l’ouverture de l’écran', async () => {
    extractionsConnues = [etatExtraction({ pourcentage: 55 })];
    const el = await poser();
    expect(texte(el.querySelector('.suivi .global'))).toBe('55 %');
    expect((el.querySelector('button.extraire') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Extraction CD — abonnement WebSocket', () => {
  it('le client s’abonne aux évènements `cd.*` : sans eux, le suivi resterait muet', () => {
    const envois: string[] = [];
    let instance: { onopen?: () => void } | null = null;
    vi.stubGlobal('WebSocket', class {
      static OPEN = 1;
      readyState = 1;
      onopen?: () => void;
      constructor() { instance = this; }
      send(m: string) { envois.push(m); }
      close() {}
    } as unknown as typeof WebSocket);
    tuneWS.connect();
    instance!.onopen!();
    const abonnement = envois.map((m) => JSON.parse(m)).find((m) => m.action === 'subscribe');
    expect(abonnement?.patterns).toContain('cd.*');
    tuneWS.disconnect();
  });
});

describe('Extraction CD — aides pures', () => {
  it('corpsLancement : seules les corrections partent', () => {
    const d = { artiste: 'A', titre: 'B', pistes: [{ numero: 1, titre: 'x' }, { numero: 2, titre: 'y' }] };
    expect(corpsLancement({ format: 'flac', destination: '/m', verification: 'doute', pistes: [1, 2],
      artiste: 'A', album: 'B', titres: { 1: 'x', 2: 'y' } }, d))
      .toEqual({ format: 'flac', verification: 'doute', destination: '/m' });
    expect(corpsLancement({ format: 'wav', destination: '/m', verification: 'toujours', pistes: [2],
      artiste: ' A2 ', album: 'B', titres: { 1: 'z', 2: 'y2' }, ecraser: true }, d))
      .toEqual({ format: 'wav', verification: 'toujours', destination: '/m', pistes: [2], artiste: 'A2', titres: { 2: 'y2' }, ecraser: true });
  });

  it('appliquerEvenement : un évènement en retard ne rouvre pas un état final', () => {
    const fin = etatExtraction({ statut: 'terminee' });
    expect(appliquerEvenement(fin, { type: 'cd.extraction.progression', data: etatExtraction() })).toBeNull();
    expect(appliquerEvenement(null, { type: 'zone.updated', data: etatExtraction() })).toBeNull();
    expect(appliquerEvenement(null, { type: 'cd.extraction.demarree', data: etatExtraction() })?.id).toBe('e1');
  });

  it('albumIdDepuisRecherche : le chemin du fichier fait foi, puis titre et artiste', () => {
    const e = etatExtraction();
    e.pistes[0] = { ...e.pistes[0], statut: 'terminee', fichier: '/m/a.flac' };
    expect(albumIdDepuisRecherche({ tracks: [{ file_path: '/m/a.flac', album_id: 9 }], albums: [], artists: [] } as any, e)).toBe(9);
    expect(albumIdDepuisRecherche({ tracks: [{ file_path: '/autre.flac', album_id: 9 }],
      albums: [{ id: 5, title: 'kind of blue', artist_name: 'Miles Davis' }], artists: [] } as any, e)).toBe(5);
    expect(albumIdDepuisRecherche({ tracks: [], albums: [{ id: 5, title: 'Autre', artist_name: 'Miles Davis' }], artists: [] } as any, e)).toBeNull();
  });
});
