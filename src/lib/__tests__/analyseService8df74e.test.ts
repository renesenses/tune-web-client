// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// Go du 13/11 (rc12) — forme d'onde et spectrogramme d'une piste QOBUZ ou
// TIDAL de la bibliothèque. Le serveur télécharge l'audio pour le calcul,
// puis l'efface ; ses refus sont des 422 `{ error, raison }`.
//
// Ici : la lecture des raisons, l'entrée de menu, l'état « Téléchargement
// pour analyse… », le zoom sans requête, les raisons traduites dans les
// quinze langues.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import FormeOnde from '../../components/v2/FormeOnde.svelte';
import SpectrogrammePanneau from '../../components/v2/SpectrogrammePanneau.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import {
  genreDeRefus, raisonDeRefus, idAnalyseDe, analyseParTelechargement, cleRaisonService,
  raisonRetentable, RAISONS_SERVICE, chargerSpectrogramme, ErreurSpectrogramme,
} from '../spectrogramme';
import { chargerFormeOnde, ErreurFormeOnde, ANTI_REBOND_ZOOM_MS, type FormeOnde as Forme } from '../formeOnde';
import { entreesMenuPiste } from '../menuPiste';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;

function forme(): Forme {
  const n = 100;
  const max = Array.from({ length: n }, () => 0.5);
  const v = (canal: number) => ({
    canal, min: max.map((x) => -x), max, rms: max.map((x) => x / Math.SQRT2),
    crete_dbfs: -6.02, rms_dbfs: -9.03, facteur_crete_db: 3.01, ecretes: 0,
  });
  return {
    version: 1, track_id: 7, colonnes: n, canaux: 2, sample_rate: 44100, debut_s: 0, duree_s: 200,
    ecretage_suite_min: 3,
    global: { crete_dbfs: -6.02, rms_dbfs: -9.03, facteur_crete_db: 3.01, ecretes: 0 },
    voies: [v(0), v(1)],
  };
}

function repondre(statut: number, corps: unknown): Response {
  return {
    ok: statut < 400, status: statut, statusText: '',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)),
    json: async () => corps,
    blob: async () => new Blob(['PNG'], { type: 'image/png' }),
  } as unknown as Response;
}
const refus = (raison: string) => repondre(422, { error: 'x', raison });

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function attendreQue(condition: () => boolean, limiteMs = 10_000) {
  const fin = Date.now() + limiteMs;
  while (!condition() && Date.now() < fin) { await respirer(); flushSync(); }
  flushSync();
  return condition();
}

let requetes: string[] = [];
let repondeur: (url: string) => Promise<Response> = async () => repondre(200, forme());
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
function poser(composant: any, props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: props as any });
  flushSync();
}
const bouton = (libelle: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.textContent ?? '').trim() === libelle);
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

beforeEach(() => {
  locale.set('fr');
  requetes = [];
  repondeur = async () => repondre(200, forme());
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (e: RequestInfo | URL) => {
    const url = typeof e === 'string' ? e : e.toString();
    requetes.push(url);
    return repondeur(url);
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('go du 13/11 — les règles pures', () => {
  it('lit la raison d’un 422 JSON, garde l’ancien texte pour « pas de fichier local »', () => {
    expect(raisonDeRefus('{"error":"x","raison":"region"}')).toBe('region');
    expect(raisonDeRefus('{"raison":"inconnue"}')).toBeNull();
    expect(raisonDeRefus('track has no local file')).toBeNull();
    expect(genreDeRefus(422, '{"error":"streaming service not connected","raison":"service_non_connecte"}')).toBe('service');
    // Spotify, YouTube… : le serveur garde le texte d'avant.
    expect(genreDeRefus(422, '{"error":"track has no local file","raison":"service_non_pris_en_charge"}')).toBe('non-locale');
    expect(genreDeRefus(422, 'waveform failed: boom')).toBe('impossible');
  });

  it('Qobuz et TIDAL seulement, avec un identifiant de bibliothèque', () => {
    expect(analyseParTelechargement('qobuz')).toBe(true);
    expect(analyseParTelechargement('TIDAL')).toBe(true);
    expect(analyseParTelechargement('spotify')).toBe(false);
    expect(idAnalyseDe({ id: 12, source: 'tidal' })).toBe(12);
    expect(idAnalyseDe({ id: null, source: 'qobuz' })).toBeNull();
    expect(idAnalyseDe({ id: 12, source: 'youtube' })).toBeNull();
    expect(raisonRetentable('delai_depasse')).toBe(true);
    expect(raisonRetentable('region')).toBe(false);
  });

  it('le menu d’une piste Qobuz de la bibliothèque offre spectrogramme et fiche', () => {
    const cles = (idAnalyse: number | null) => entreesMenuPiste(
      { jouable: true, idBibliotheque: null, idAnalyse, artistId: null, albumId: null },
      { spectrogramme: () => {}, ficheTechnique: () => {} },
    ).map((e) => e.cle);
    expect(cles(12)).toEqual(expect.arrayContaining(['spectro.menu', 'fiche.menu']));
    expect(cles(null)).not.toContain('spectro.menu');
    expect(cles(null)).not.toContain('fiche.menu');
  });

  it('les erreurs portent la raison', async () => {
    repondeur = async () => refus('trop_volumineux');
    const e1 = await chargerFormeOnde(7).catch((e) => e);
    expect(e1).toBeInstanceOf(ErreurFormeOnde);
    expect(e1.genre).toBe('service');
    expect(e1.raison).toBe('trop_volumineux');
    repondeur = async () => refus('service_non_connecte');
    const e2 = await chargerSpectrogramme(7).catch((e) => e);
    expect(e2).toBeInstanceOf(ErreurSpectrogramme);
    expect(e2.raison).toBe('service_non_connecte');
  });

  it('chaque raison est traduite dans les quinze langues', () => {
    expect(ONZE_LANGUES).toHaveLength(15);
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const cle of ['analyse.downloading', ...RAISONS_SERVICE.map(cleRaisonService)]) {
        expect(d[cle], `${code} : ${cle}`).toBeTruthy();
        expect(d[cle]).not.toMatch(/\u00C3/);
      }
    }
    expect(fr['analyse.downloading']).toMatch(/^Téléchargement pour analyse…/);
  });
});

describe('go du 13/11 — la forme d’onde d’une piste de service', () => {
  it('dit « Téléchargement pour analyse… », puis trace ; le zoom ne redemande rien', async () => {
    let lacher!: () => void;
    repondeur = (url) => new Promise((ok) => {
      if (url.includes('debut_s=')) { ok(repondre(200, forme())); return; }
      lacher = () => ok(repondre(200, forme()));
    });
    poser(FormeOnde, { trackId: 7, section: { etat: 'absent', url: '', colonnes: 1000, service: 'qobuz' }, titre: 'X' });
    bouton(fr['fiche.waveform.compute'])!.click();
    flushSync();
    expect(await attendreQue(() => !!document.querySelector('[data-telechargement]'))).toBe(true);
    expect(document.body.textContent).toContain(fr['analyse.downloading']);
    expect(document.body.textContent).not.toContain(fr['fiche.waveform.notLocal']);
    lacher();
    expect(await attendreQue(() => document.querySelectorAll('.canal').length === 2)).toBe(true);
    bouton(fr['fiche.waveform.zoomIn'])!.click();
    flushSync();
    await new Promise((r) => setTimeout(r, ANTI_REBOND_ZOOM_MS + 100));
    flushSync();
    expect(requetes.filter((u) => u.includes('debut_s='))).toEqual([]);
  });

  it('un refus du service se dit avec sa raison ; seul un délai se retente', async () => {
    repondeur = async () => refus('region');
    poser(FormeOnde, { trackId: 7, section: { etat: 'a_jour', url: '', colonnes: 1000, service: 'tidal' } });
    expect(await attendreQue(() => !!document.querySelector('[data-raison="region"]'))).toBe(true);
    expect(document.body.textContent).toContain(fr['analyse.raison.region']);
    expect(bouton(fr['fiche.waveform.compute'])).toBeUndefined();
    unmount(monte!); monte = null; document.body.innerHTML = '';

    repondeur = async () => refus('delai_depasse');
    poser(FormeOnde, { trackId: 7, section: { etat: 'a_jour', url: '', colonnes: 1000, service: 'tidal' } });
    expect(await attendreQue(() => !!document.querySelector('[data-raison="delai_depasse"]'))).toBe(true);
    expect(bouton(fr['fiche.waveform.compute'])).toBeDefined();
  });
});

describe('go du 13/11 — le spectrogramme d’une piste de service', () => {
  it('dit « Téléchargement pour analyse… », puis la raison d’un refus', async () => {
    let lacher!: () => void;
    repondeur = () => new Promise((ok) => { lacher = () => ok(refus('service_non_connecte')); });
    poser(SpectrogrammePanneau, { trackId: 7, titre: 'X', source: 'tidal', onClose: () => {} });
    bouton(fr['spectro.generate'])!.click();
    flushSync();
    expect(await attendreQue(() => !!document.querySelector('[data-telechargement]'))).toBe(true);
    expect(document.body.textContent).toContain(fr['analyse.downloading']);
    lacher();
    expect(await attendreQue(() => !!document.querySelector('[data-raison="service_non_connecte"]'))).toBe(true);
    expect(document.body.textContent).toContain(fr['analyse.raison.service_non_connecte']);
    expect(document.body.textContent).not.toContain(fr['spectro.notLocal']);
  });
});

describe('recette du 14/11 — un refus ne laisse jamais l’écran sur « Calcul… »', () => {
  const enAttente = () => !!document.querySelector('[role="status"][aria-live="polite"]');

  it('422 texte « track has no local file » : message, plus de calcul en cours', async () => {
    repondeur = async () => repondre(422, 'track has no local file');
    poser(FormeOnde, { trackId: 190466, section: { etat: 'a_jour', url: '', colonnes: 1000 } });
    expect(await attendreQue(() => document.body.textContent!.includes(fr['fiche.waveform.notLocal']))).toBe(true);
    expect(enAttente()).toBe(false);
  });

  it('422 `source_reseau` (piste UPnP sans copie locale) : la raison traduite', async () => {
    repondeur = async () => refus('source_reseau');
    poser(FormeOnde, { trackId: 190466, section: { etat: 'a_jour', url: '', colonnes: 1000 } });
    expect(await attendreQue(() => !!document.querySelector('[data-raison="source_reseau"]'))).toBe(true);
    expect(document.body.textContent).toContain(fr['analyse.raison.source_reseau']);
    expect(enAttente()).toBe(false);
    expect(bouton(fr['fiche.waveform.compute'])).toBeUndefined();
  });

  it('toute autre erreur (500, réseau) sort aussi de l’attente', async () => {
    repondeur = async () => { throw new TypeError('Failed to fetch'); };
    poser(FormeOnde, { trackId: 7, section: { etat: 'a_jour', url: '', colonnes: 1000 } });
    expect(await attendreQue(() => !enAttente())).toBe(true);
    expect(bouton(fr['fiche.waveform.compute'])).toBeDefined();
  });
});
