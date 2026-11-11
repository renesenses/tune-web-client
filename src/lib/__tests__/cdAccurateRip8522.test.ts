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
import { cdPlugin, chargementDepuisEvenement, verificationDuChargement, type ChargementCd } from '../lectureCd';
import { cleRefus, type EtatExtraction } from '../extractionCd';
import { resumeAr, texteVerdictAr, verificationAr, type VerificationAr } from '../verificationAr';
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
 * tune-server-rust#8522 (fil 2771) — la vérification AccurateRip RÉELLE :
 * verdict par piste (vérifiée / absente / différente / non vérifiée) pour
 * le CD en mémoire et pour l'extraction, décalage du lecteur réglable.
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
  decalage_lecteur: 0, decalage_max: 2940,
};

const VERIF: VerificationAr = {
  identifiant: 'dBAR-003-0001-0002-0003', base: 'trouvee', decalage: 6, decalage_detecte: true,
  pistes: [
    { piste: 1, statut: 'verifie', version: 'v2', confiance: 12, v1: '1a2b3c4d', v2: '5e6f7081', decalage: 6 },
    { piste: 2, statut: 'different', version: null, confiance: 9, v1: '0badf00d', v2: 'deadbeef', decalage: 6 },
    { piste: 3, statut: 'absent', version: null, confiance: 0, v1: 'cafebabe', v2: '00c0ffee', decalage: 6 },
  ],
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
    accuraterip: CRC, verification_accuraterip: VERIF, fin: 'termine', ...p,
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

const tr = (k: string) => (fr as Record<string, string>)[k];

describe('#8522 — CD en mémoire : verdict de la base', () => {
  it('le résumé et le verdict de chaque piste, décalage détecté compris', async () => {
    const el = await poser();
    const d = el.querySelector('.accuraterip-chargement')!;
    expect(texte(d.querySelector('summary'))).toBe(
      `${fr['v2.cd.ar.summary'].replace('{ok}', '1').replace('{total}', '3')} · ${fr['v2.cd.ar.offsetDetected'].replace('{n}', '+6')}`);
    const v = [...d.querySelectorAll('li .verdict-ar')].map(texte);
    expect(v).toEqual([fr['v2.cd.ar.verified'].replace('{n}', '12'), fr['v2.cd.ar.different'], fr['v2.cd.ar.absent']]);
    expect(d.querySelector('li[data-ar=verifie]')).not.toBeNull();
  });

  it('en cours, puis le verdict arrive par `cd.memoire.accuraterip`', async () => {
    charge = chargement({ verification_accuraterip: { ...VERIF, base: 'en_cours', pistes: [] } });
    const el = await poser();
    expect(texte(el.querySelector('.accuraterip-chargement summary'))).toBe(fr['v2.cd.ar.checking']);
    handlers.forEach((h) => h({ type: 'cd.memoire.accuraterip', data: chargement() }));
    await laisserFaire();
    expect(texte(el.querySelector('.accuraterip-chargement summary'))).toContain(fr['v2.cd.ar.summary'].split('{ok}')[0]);
    expect(el.querySelectorAll('.accuraterip-chargement .verdict-ar')).toHaveLength(3);
  });

  it('contre-épreuve : serveur antérieur (pas de verdict) → l’affichage #8514, sans verdict ; autre disque → rien', async () => {
    charge = chargement({ verification_accuraterip: undefined });
    let el = await poser();
    expect(texte(el.querySelector('.accuraterip-chargement summary'))).toBe(fr['v2.cd.memAccurateRip'].replace('{n}', '3'));
    expect(el.querySelector('.verdict-ar')).toBeNull();
    unmount(monte!); monte = null; hote?.remove(); hote = null;
    expect(verificationDuChargement(chargement({ disc_id: 'autre' }), DISQUE.disc_id)).toBeNull();
    expect(verificationDuChargement(chargement({ fin: 'libere' }), DISQUE.disc_id)).toBeNull();
    expect(chargementDepuisEvenement({ type: 'cd.memoire.accuraterip', data: chargement() })).not.toBeNull();
  });
});

describe('#8522 — extraction : verdict par piste et décalage du lecteur', () => {
  it('le décalage se règle dans la feuille et part avec les réglages', async () => {
    const el = await poser();
    (el.querySelector('button.extraire') as HTMLButtonElement).click();
    await laisserFaire();
    const f = feuille()!;
    const d = f.querySelector('input.decalage') as HTMLInputElement;
    expect(d.value).toBe('0');
    d.value = '667'; d.dispatchEvent(new Event('input'));
    flushSync();
    (f.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await laisserFaire();
    const puts = appels.filter((a) => a.url.includes('/extraction/reglages') && a.method === 'PUT');
    expect(puts.map((a) => a.body)).toEqual([{ format: 'flac', destination: '/music', decalage_lecteur: 667 }]);
  });

  it('contre-épreuve : décalage inchangé → aucun réglage réécrit ; refus `decalage_invalide` en phrase', async () => {
    const el = await poser();
    (el.querySelector('button.extraire') as HTMLButtonElement).click();
    await laisserFaire();
    (feuille()!.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await laisserFaire();
    expect(appels.filter((a) => a.url.includes('/extraction/reglages') && a.method === 'PUT')).toHaveLength(0);
    expect(cleRefus('decalage_invalide')).toBe('v2.cd.rip.err.badOffset');
  });

  it('le suivi montre le verdict de chaque piste et le résumé du disque', async () => {
    const el = await poser();
    const pistes = etatExtraction().pistes.map((p, i) => ({ ...p, statut: 'terminee', pourcentage: 100, verification: VERIF.pistes[i] }));
    handlers.forEach((h) => h({ type: 'cd.extraction.terminee', data: etatExtraction({
      source: 'lecteur', statut: 'terminee', pourcentage: 100, scan: 'lance', pistes: pistes as any,
      accuraterip: { ...VERIF, decalage: 0, decalage_detecte: false },
    }) }));
    await laisserFaire();
    const v = [...el.querySelectorAll('.suivi .verdict-ar')];
    expect(v.map((x) => x.getAttribute('data-ar'))).toEqual(['verifie', 'different', 'absent']);
    expect(texte(v[0])).toBe(fr['v2.cd.ar.verified'].replace('{n}', '12'));
    expect(texte(el.querySelector('.suivi .resume-ar'))).toBe(
      `${fr['v2.cd.ar.summary'].replace('{ok}', '1').replace('{total}', '3')} · ${fr['v2.cd.ar.offset'].replace('{n}', '0')}`);
  });

  it('aides pures : phrases, jamais de code ; forme inconnue écartée', () => {
    expect(texteVerdictAr({ ...VERIF.pistes[0], statut: 'non_verifie' }, tr)).toBe(fr['v2.cd.ar.unverified']);
    expect(texteVerdictAr({ ...VERIF.pistes[0], statut: 'bizarre' as any }, tr)).toBe(fr['v2.cd.ar.unverified']);
    expect(resumeAr({ ...VERIF, decalage: -1164, decalage_detecte: false }, tr)).toContain('-1164');
    expect(verificationAr({})).toBeNull();
    expect(verificationAr(null)).toBeNull();
    expect(verificationAr(VERIF)).toEqual(VERIF);
  });

  it('les textes existent dans les quinze catalogues', () => {
    const cles = ['v2.cd.ar.verified', 'v2.cd.ar.absent', 'v2.cd.ar.different', 'v2.cd.ar.unverified', 'v2.cd.ar.checking',
      'v2.cd.ar.summary', 'v2.cd.ar.offset', 'v2.cd.ar.offsetDetected', 'v2.cd.rip.driveOffset', 'v2.cd.rip.driveOffsetHint',
      'v2.cd.rip.err.badOffset'];
    const catalogues = { fr, en, de, es, it: it_, hu, ja, ko, ro, sv, vi: vi_, el: el_, nb: nb_, pl: pl_, zh };
    expect(Object.keys(catalogues)).toHaveLength(15);
    const jetons: Record<string, string[]> = {
      'v2.cd.ar.verified': ['{n}'], 'v2.cd.ar.summary': ['{ok}', '{total}'], 'v2.cd.ar.offset': ['{n}'], 'v2.cd.ar.offsetDetected': ['{n}'],
    };
    for (const [l, cat] of Object.entries(catalogues)) {
      for (const c of cles) {
        const v = (cat as Record<string, string>)[c];
        expect(typeof v === 'string' && v.trim().length > 0, `${l} : ${c}`).toBe(true);
        for (const j of jetons[c] ?? []) expect(v, `${l} : ${c} sans ${j}`).toContain(j);
      }
    }
  });
});
