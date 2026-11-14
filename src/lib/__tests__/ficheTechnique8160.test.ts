// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// tune-server-rust#8160 — la FICHE TECHNIQUE d'une piste.
//
// Cette garde MONTE l'entrée de menu (`PisteActions`, `MenuPisteV1` — celui
// de Lecture en cours) et `FicheTechniquePanneau` contre des réponses
// simulées de `GET /library/tracks/{id}/fiche-technique` et de
// `POST /library/tracks/{id}/spectrogramme`. Une entrée écrite mais pas
// branchée, une section vide affichée, ou un recalcul qui n'appelle rien, y
// sont rouges.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import MenuPisteV1 from '../../components/partages/MenuPisteV1.svelte';
import FicheTechniquePanneau from '../../components/v2/FicheTechniquePanneau.svelte';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import { oublierSondageNotes } from '../api';
import {
  sectionsVisibles, cleSourceDr, cleVerdictHiRes, cleVerdictIntegrite, cleEtatSpectrogramme,
  tailleLisible, frequenceLisible, type FicheTechnique,
} from '../ficheTechnique';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;

const BIBLIO = {
  id: 2450, source: 'local', title: 'The Meaning of Flowers', artist_name: 'Agnes Obel',
  artist_id: 125, album_id: 259, album_title: 'Myopia', duration_ms: 234000,
};
const TIDAL = {
  id: null, source: 'tidal', source_id: '441078583', title: 'Second Song',
  artist_name: 'Neil Young', artist_id: '35865', album_title: 'Second Song',
  album_id: '441078580', duration_ms: 360000,
};

function ficheLocale(etat: 'a_jour' | 'perime' | 'absent' = 'absent'): FicheTechnique {
  return {
    track_id: 2450, title: 'The Meaning of Flowers', source: 'local', a_un_fichier: true,
    genere_le: '2026-11-09T10:00:00Z',
    format: { codec: 'flac', sample_rate: 96000, bit_depth: 24, channels: 2, bitrate_kbps: 2900, duration_ms: 234000, file_size: 84_000_000, fichier_modifie_le: '2026-10-01T08:00:00Z' },
    spectrogramme: etat === 'absent'
      ? { etat, url: '/api/v1/library/tracks/2450/spectrogramme.png?largeur=1200&hauteur=400', largeur: 1200, hauteur: 400 }
      : { etat, url: '/api/v1/library/tracks/2450/spectrogramme.png?largeur=1200&hauteur=400', largeur: 1200, hauteur: 400, octets: 91_000, calcule_le: '2026-11-08T21:00:00Z', duree_calcul_ms: 1800 },
    dynamic_range: { valeur: 11, source: 'analysis', algo: 'tt-dr-v1', mesure_le: '2026-11-07T10:00:00Z' },
    faux_hires: { verdict: 'verifie', bits_effectifs: 24, coupure_hz: 46000, mesure_le: '2026-11-07T11:00:00Z' },
    integrite: { verdict: 'sain', code: 'ok', mode: 'full', audite_le: '2026-11-06T09:00:00Z', fichier_change_depuis: false },
    provenance: { source: 'local', isrc: 'FRXXX2600001', balises_lues_du_fichier: true, champs_tenus: ['genre'], credits: [{ source: 'tag', nombre: 3 }] },
    note: null,
    forme_d_onde: null,
  };
}
const FICHE_SERVICE: FicheTechnique = {
  track_id: 77, title: 'Service', source: 'qobuz', a_un_fichier: false,
  format: { codec: 'flac', sample_rate: 44100, bit_depth: 16, channels: 2 },
  spectrogramme: null, dynamic_range: null, faux_hires: null, integrite: null,
  provenance: { source: 'qobuz', source_id: 'q-77' }, note: null, forme_d_onde: null,
};

interface Requete { url: string; methode: string }
let requetes: Requete[] = [];
let fiche: FicheTechnique | null = ficheLocale();
let statutFiche = 200;

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function attendreQue(condition: () => boolean, limiteMs = 10_000) {
  const fin = Date.now() + limiteMs;
  while (!condition() && Date.now() < fin) { await respirer(); flushSync(); }
  flushSync();
  return condition();
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
function poser(composant: any, props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: props as any });
  flushSync();
  return hote;
}
const panneau = () => document.querySelector<HTMLElement>('[role="dialog"]');
const texte = () => panneau()?.textContent ?? '';
const sectionsAffichees = () =>
  [...document.querySelectorAll<HTMLElement>('[role="dialog"] section[data-section]')].map((s) => s.dataset.section);
const bouton = (libelle: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button.bouton')]
    .find((b) => (b.textContent ?? '').trim() === libelle);

function repondre(statut: number, corps: unknown, type = 'application/json'): Response {
  return {
    ok: statut < 400, status: statut, statusText: '',
    headers: new Headers({ 'content-type': type }),
    blob: async () => new Blob(['PNG'], { type: 'image/png' }),
    text: async () => JSON.stringify(corps),
    json: async () => corps,
  } as unknown as Response;
}

beforeEach(() => {
  locale.set('fr');
  currentZoneId.set(1);
  oublierSondageNotes();
  requetes = [];
  fiche = ficheLocale();
  statutFiche = 200;
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:fiche-test'),
    revokeObjectURL: vi.fn(),
  }));
  vi.stubGlobal('fetch', vi.fn(async (e: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof e === 'string' ? e : e.toString();
    const methode = init?.method ?? 'GET';
    requetes.push({ url, methode });
    if (url.includes('/fiche-technique')) return repondre(statutFiche, statutFiche < 400 ? fiche : { error: 'x' });
    if (url.endsWith('/spectrogramme') && methode === 'POST') {
      return repondre(200, { ...ficheLocale('a_jour').spectrogramme, calcule_le: '2026-11-09T10:05:00Z' });
    }
    if (url.includes('/spectrogramme.png')) return repondre(200, null, 'image/png');
    if (url.includes('/library/notes?')) return repondre(200, { count: 0, notes: [] });
    if (url.includes('/library/notes/track/')) return repondre(404, { error: 'aucune note' });
    return repondre(200, {});
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('#8160 — les règles pures', () => {
  it('une piste locale montre toutes ses sections, forme d’onde réservée comprise', () => {
    expect(sectionsVisibles(ficheLocale())).toEqual([
      'format', 'spectrogramme', 'formeDOnde', 'dynamicRange', 'fauxHires', 'integrite', 'provenance', 'note',
    ]);
  });
  it('une piste de service sans fichier : aucune section vide', () => {
    expect(sectionsVisibles(FICHE_SERVICE)).toEqual(['format', 'provenance', 'note']);
  });
  it('chaque clé produite existe en français et en anglais', () => {
    const en = dictionnaire('en');
    const cles = [
      cleSourceDr('tag'), cleSourceDr('analysis'), cleSourceDr('sidecar'), cleSourceDr(undefined),
      ...['verifie', 'conforme', 'douteux', 'non_concluant', 'non_analyse', 'autre'].map(cleVerdictHiRes),
      ...['sain', 'corrompu', 'non_verifiable'].map(cleVerdictIntegrite),
      ...(['a_jour', 'perime', 'absent'] as const).map(cleEtatSpectrogramme),
    ];
    for (const c of cles) {
      expect(fr[c], c).toBeTruthy();
      expect(en[c], c).toBeTruthy();
    }
  });
  it('toutes les langues du client ont toutes les clés de la fiche', () => {
    const clesFr = Object.keys(fr).filter((k) => k.startsWith('fiche.'));
    expect(clesFr.length).toBeGreaterThan(50);
    expect(ONZE_LANGUES).toHaveLength(15);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of clesFr) expect(d[k], `${l} : ${k}`).toBeTruthy();
    }
  });
  it('unités lisibles dans la langue', () => {
    expect(frequenceLisible(44100, 'fr')).toBe('44,1 kHz');
    expect(frequenceLisible(96000, 'en')).toBe('96 kHz');
    expect(tailleLisible(84_000_000, 'en')).toMatch(/^84 MB$/);
  });
});

describe('#8160 — l’entrée du menu', () => {
  function menuV2(piste: Record<string, unknown>): HTMLButtonElement[] {
    const el = poser(PisteActions, { piste });
    const plus = Array.from(el.querySelectorAll<HTMLButtonElement>('button.pa'))
      .find((b) => b.getAttribute('aria-haspopup') === 'menu');
    plus!.click();
    flushSync();
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.menu button.item'));
  }
  const entree = (items: HTMLButtonElement[]) =>
    items.find((b) => (b.textContent ?? '').trim() === fr['fiche.menu']);

  it('présente pour une piste de la bibliothèque, absente pour un titre de service', () => {
    expect(entree(menuV2(BIBLIO))).toBeTruthy();
    if (monte) unmount(monte); monte = null; hote?.remove(); document.body.innerHTML = '';
    expect(entree(menuV2(TIDAL))).toBeUndefined();
  });
  it('le clic ouvre la fiche de la piste et la demande au serveur', async () => {
    entree(menuV2(BIBLIO))!.click();
    flushSync();
    expect(await attendreQue(() => texte().includes(fr['fiche.section.format']))).toBe(true);
    expect(requetes.some((r) => r.url.endsWith('/library/tracks/2450/fiche-technique'))).toBe(true);
  });
  it('Lecture en cours (MenuPisteV1) : l’entrée ouvre la même fiche', async () => {
    const el = poser(MenuPisteV1, { piste: BIBLIO });
    el.querySelector<HTMLButtonElement>('button.track-more-btn')!.click();
    flushSync();
    const item = [...document.querySelectorAll<HTMLButtonElement>('.track-menu-item')]
      .find((b) => (b.textContent ?? '').trim() === fr['fiche.menu']);
    expect(item, 'l’entrée « Fiche technique » manque au menu de Lecture en cours').toBeTruthy();
    item!.click();
    flushSync();
    expect(await attendreQue(() => texte().includes(fr['fiche.section.format']))).toBe(true);
  });
});

describe('#8160 — le panneau', () => {
  it('une piste locale : sections datées, spectrogramme absent, forme d’onde réservée', async () => {
    poser(FicheTechniquePanneau, { trackId: 2450, titre: 'Flowers', onClose: () => {} });
    expect(await attendreQue(() => sectionsAffichees().length > 0)).toBe(true);
    expect(sectionsAffichees()).toEqual([
      'format', 'spectrogramme', 'formeDOnde', 'dynamicRange', 'fauxHires', 'integrite', 'provenance', 'note',
    ]);
    const t = texte();
    expect(t).toContain('96 kHz');
    expect(t).toContain(fr['fiche.bits'].replace('{n}', '24'));
    expect(t).toContain(fr['fiche.dr.value'].replace('{n}', '11'));
    expect(t).toContain(fr['fiche.dr.sourceAnalysis']);
    expect(t).toContain(fr['fiche.hires.verifie']);
    expect(t).toContain(fr['fiche.integrity.sain']);
    expect(t).toContain(fr['fiche.spectro.absent']);
    expect(t).toContain(fr['fiche.waveform.compute']);
    // Dates : celle du DR, de l'audit et du fichier sont écrites.
    expect(t).toContain(fr['fiche.measuredOn'].split('{date}')[0].trim());
    expect(t).toContain(fr['fiche.auditedOn'].split('{date}')[0].trim());
    // Aucun PNG demandé tant que l'image n'existe pas.
    expect(requetes.some((r) => r.url.includes('spectrogramme.png'))).toBe(false);
    expect(document.querySelector('[role="dialog"] img')).toBeNull();
  });
  it('« Calculer le spectrogramme » appelle le recalcul puis montre l’image', async () => {
    poser(FicheTechniquePanneau, { trackId: 2450, titre: 'Flowers', onClose: () => {} });
    expect(await attendreQue(() => bouton(fr['fiche.spectro.compute']) != null)).toBe(true);
    bouton(fr['fiche.spectro.compute'])!.click();
    expect(await attendreQue(() => panneau()!.querySelector('img') != null)).toBe(true);
    expect(requetes.some((r) => r.methode === 'POST' && r.url.endsWith('/library/tracks/2450/spectrogramme'))).toBe(true);
    expect(requetes.some((r) => r.url.includes('/library/tracks/2450/spectrogramme.png?largeur=1200&hauteur=400'))).toBe(true);
    expect(texte()).toContain(fr['fiche.spectro.upToDate']);
    expect(bouton(fr['fiche.spectro.recompute'])).toBeTruthy();
  });
  it('une image périmée le dit et ne se charge pas', async () => {
    fiche = ficheLocale('perime');
    poser(FicheTechniquePanneau, { trackId: 2450, titre: 'Flowers', onClose: () => {} });
    expect(await attendreQue(() => texte().includes(fr['fiche.spectro.stale']))).toBe(true);
    expect(requetes.some((r) => r.url.includes('spectrogramme.png'))).toBe(false);
    expect(bouton(fr['fiche.spectro.recompute'])).toBeTruthy();
  });
  it('une image à jour se charge à l’ouverture', async () => {
    fiche = ficheLocale('a_jour');
    poser(FicheTechniquePanneau, { trackId: 2450, titre: 'Flowers', onClose: () => {} });
    expect(await attendreQue(() => panneau()?.querySelector('img') != null)).toBe(true);
    expect(panneau()!.querySelector('img')!.getAttribute('src')).toBe('blob:fiche-test');
  });
  it('une piste de service : ni spectrogramme, ni DR, ni intégrité, ni forme d’onde', async () => {
    fiche = FICHE_SERVICE;
    poser(FicheTechniquePanneau, { trackId: 77, titre: 'Service', onClose: () => {} });
    expect(await attendreQue(() => sectionsAffichees().length > 0)).toBe(true);
    expect(sectionsAffichees()).toEqual(['format', 'provenance', 'note']);
    expect(texte()).not.toContain(fr['fiche.section.spectro']);
    expect(texte()).not.toContain(fr['fiche.section.waveform']);
  });
  it('la note personnelle est éditable sur place (composant des notes)', async () => {
    poser(FicheTechniquePanneau, { trackId: 2450, titre: 'Flowers', onClose: () => {} });
    expect(await attendreQue(() => requetes.some((r) => r.url.includes('/library/notes/track/2450')))).toBe(true);
    const note = document.querySelector('[role="dialog"] section[data-section="note"]');
    expect(note?.querySelector('button')).toBeTruthy();
  });
  it('serveur ancien (404) : message clair, sans « Réessayer »', async () => {
    statutFiche = 404;
    poser(FicheTechniquePanneau, { trackId: 2450, titre: 'Flowers', onClose: () => {} });
    expect(await attendreQue(() => texte().includes(fr['fiche.unavailable']))).toBe(true);
    expect(bouton(fr['fiche.retry'])).toBeUndefined();
  });
  it('erreur serveur : message et « Réessayer » relance', async () => {
    statutFiche = 500;
    poser(FicheTechniquePanneau, { trackId: 2450, titre: 'Flowers', onClose: () => {} });
    expect(await attendreQue(() => texte().includes(fr['fiche.error']))).toBe(true);
    statutFiche = 200;
    bouton(fr['fiche.retry'])!.click();
    expect(await attendreQue(() => sectionsAffichees().length > 0)).toBe(true);
  });
});
