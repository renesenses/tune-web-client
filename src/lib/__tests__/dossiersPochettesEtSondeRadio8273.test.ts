// @vitest-environment jsdom
//
// tune-server-rust discussion #8273 (rc13) :
//   1. « Répertoires » montre la pochette de chaque dossier — une VIGNETTE
//      demandée en chargement paresseux, l'icône de dossier tant qu'elle
//      n'est pas là ou s'il n'y en a pas ;
//   3. ajouter une station en collant son adresse : le serveur la sonde
//      (`POST /radios/probe`), le formulaire se pré-remplit sans écraser ce
//      qui est déjà tapé, « Écouter » joue l'adresse dans la zone en cours,
//      et la création emporte codec et débit.
//
// Les témoins montent les VRAIS écrans et lisent les requêtes émises.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import BrowseView from '../../components/v2-heritage/BrowseView.svelte';
import RadioEditModale from '../../components/v2/RadioEditModale.svelte';
import { locale } from '../i18n';
import { zones, currentZoneId } from '../stores/zones';
import * as api from '../api';

vi.setConfig({ testTimeout: 30_000 });

const ZONE = { id: 4, name: 'Salon', state: 'stopped', volume: 0.5 } as any;
const DOSSIERS = [
  { name: 'Coltrane', path: '/music/Jazz/Coltrane', track_count: 12 },
  { name: 'Davis & Co', path: '/music/Jazz/Davis & Co', track_count: 3 },
];

type Envoi = { methode: string; chemin: string; corps: any };
let envois: Envoi[] = [];
let sonde: { status: number; corps: any } = { status: 200, corps: {} };

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Bad Request',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
    clone() { return this; },
  } as unknown as Response;
}

function repondre(url: string, init?: RequestInit): Response {
  const u = new URL(url, 'http://localhost');
  const p = u.pathname.replace(/^\/api\/v1/, '');
  const methode = init?.method ?? 'GET';
  if (methode !== 'GET') {
    envois.push({ methode, chemin: p, corps: init?.body ? JSON.parse(String(init.body)) : null });
  }
  if (p === '/library/browse') return reponse(200, { roots: [{ name: 'Musique', path: '/music', track_count: 15, exists: true }] });
  if (p === '/library/browse/dir') {
    return reponse(200, {
      path: '/music/Jazz', parent: '/music', music_root: '/music', accessible: true, tracks: [],
      directories: DOSSIERS,
    });
  }
  if (p === '/radios/probe') return reponse(sonde.status, sonde.corps);
  if (p === '/radios' && methode === 'POST') return reponse(201, { id: 99, ...JSON.parse(String(init!.body)) });
  if (p === `/zones/${ZONE.id}/play`) return reponse(200, { ...ZONE, state: 'playing' });
  if (/\/zones/.test(p)) return reponse(200, [ZONE]);
  return reponse(200, {});
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendreQue(cond: () => boolean, quoi: string, ms = 5_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
}

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

function saisir(input: HTMLInputElement, valeur: string) {
  input.value = valeur;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

beforeEach(() => {
  envois = [];
  sonde = { status: 200, corps: {} };
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  locale.set('fr');
  zones.set([ZONE]);
  currentZoneId.set(ZONE.id);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => repondre(String(url), init)));
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#8273 (1) — Répertoires : la pochette de chaque dossier', () => {
  it('l’adresse de vignette encode le chemin et demande une case, jamais l’original', () => {
    const url = api.folderCoverUrl('/music/Jazz/Davis & Co', 80);
    expect(url).toContain('/library/browse/cover?path=%2Fmusic%2FJazz%2FDavis%20%26%20Co&size=80');
  });

  it('chaque dossier demande SA vignette en chargement paresseux, et garde l’icône jusqu’à son arrivée', async () => {
    monte = mount(BrowseView, { target: hote!, props: {} });
    flushSync();
    await attendreQue(() => !!hote!.querySelector('.root-item'), 'les emplacements');
    hote!.querySelector<HTMLButtonElement>('.root-item')!.click();
    flushSync();
    await attendreQue(() => hote!.querySelectorAll('[data-vignette-dossier]').length === 2, 'les vignettes des dossiers');

    const vignettes = [...hote!.querySelectorAll<HTMLElement>('[data-vignette-dossier]')];
    vignettes.forEach((v, i) => {
      const img = v.querySelector('img')!;
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('src')).toBe(api.folderCoverUrl(DOSSIERS[i].path, 80));
      // Pas encore chargée : l'icône de dossier est là.
      expect(v.querySelector('svg')).not.toBeNull();
    });

    // Arrivée : l'icône s'efface.
    vignettes[0].querySelector('img')!.dispatchEvent(new Event('load'));
    flushSync();
    expect(vignettes[0].querySelector('svg')).toBeNull();
    expect(vignettes[0].querySelector('img')!.classList.contains('chargee')).toBe(true);

    // 404 : pas d'image cassée, l'icône reste.
    vignettes[1].querySelector('img')!.dispatchEvent(new Event('error'));
    flushSync();
    expect(vignettes[1].querySelector('img')).toBeNull();
    expect(vignettes[1].querySelector('svg')).not.toBeNull();
  });
});

const NOUVELLE = { id: null, name: '', stream_url: '', logo_url: '', genre: '', country: '', homepage_url: '' } as any;

describe('#8273 (3) — ajouter une station en collant son adresse', () => {
  it('la sonde pré-remplit les champs VIDES, garde ce qui est tapé, et la création emporte codec et débit', async () => {
    sonde = {
      status: 200,
      corps: {
        stream_url: 'https://flux.example/live.mp3', playlist_url: 'https://radio.example/ecoute.pls',
        reachable: true, hls: false, codec: 'MP3', bitrate: 192, sample_rate: 44100,
        name: 'Radio Exemple', genre: 'Jazz', homepage_url: 'https://radio.example',
        logo_url: 'https://radio.example/logo.png',
      },
    };
    const enregistrees: any[] = [];
    monte = mount(RadioEditModale, {
      target: hote!,
      props: { radio: { ...NOUVELLE }, onClose: () => {}, onSaved: (r: any) => enregistrees.push(r) },
    });
    flushSync();
    const champ = (sel: string) => document.querySelector<HTMLInputElement>(sel)!;
    // Le genre est déjà tapé : la sonde ne l'écrase pas.
    const champs = [...document.querySelectorAll<HTMLInputElement>('form input:not([type=file])')];
    const genre = champs.find((i) => i.closest('label')?.textContent?.includes('Genre'))!;
    saisir(genre, 'Bebop');

    saisir(champ('#radio-flux-sonde'), 'https://radio.example/ecoute.pls');
    document.querySelector<HTMLButtonElement>('[data-sonder]')!.click();
    await attendreQue(() => !!document.querySelector('[data-sonde-resultat]'), 'le résultat de la sonde');

    expect(envois.find((e) => e.chemin === '/radios/probe')?.corps).toEqual({ url: 'https://radio.example/ecoute.pls' });
    expect(champ('#radio-flux-sonde').value).toBe('https://flux.example/live.mp3');
    const resultat = document.querySelector('[data-sonde-resultat]')!.textContent!;
    expect(resultat).toContain('MP3');
    expect(resultat).toContain('192 kbit/s');
    expect(resultat).toContain('liste');
    const nom = champs.find((i) => i.closest('label')?.textContent?.includes('Nom'))!;
    expect(nom.value).toBe('Radio Exemple');
    expect(genre.value).toBe('Bebop');

    document.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await attendreQue(() => enregistrees.length === 1, 'la station créée');
    const creation = envois.find((e) => e.chemin === '/radios' && e.methode === 'POST')!.corps;
    expect(creation).toMatchObject({
      name: 'Radio Exemple', stream_url: 'https://flux.example/live.mp3', genre: 'Bebop',
      logo_url: 'https://radio.example/logo.png', homepage_url: 'https://radio.example',
      codec: 'MP3', bitrate: 192,
    });
  });

  it('« Écouter » joue l’adresse dans la zone en cours, sans rien enregistrer', async () => {
    monte = mount(RadioEditModale, { target: hote!, props: { radio: { ...NOUVELLE }, onClose: () => {} } });
    flushSync();
    saisir(document.querySelector<HTMLInputElement>('#radio-flux-sonde')!, 'https://flux.example/live.aac');
    document.querySelector<HTMLButtonElement>('[data-ecouter]')!.click();
    await attendreQue(() => envois.some((e) => e.chemin === `/zones/${ZONE.id}/play`), 'la lecture d’essai');
    expect(envois.find((e) => e.chemin === `/zones/${ZONE.id}/play`)!.corps).toMatchObject({
      source: 'radio', source_id: 'https://flux.example/live.aac',
    });
    expect(envois.some((e) => e.chemin === '/radios')).toBe(false);
  });

  it('une station déjà présente est signalée ; une station muette n’empêche pas l’enregistrement', async () => {
    sonde = { status: 200, corps: { stream_url: 'https://flux.example/x', reachable: false, hls: false, existing_id: 7, existing_name: 'FIP' } };
    monte = mount(RadioEditModale, { target: hote!, props: { radio: { ...NOUVELLE }, onClose: () => {} } });
    flushSync();
    saisir(document.querySelector<HTMLInputElement>('#radio-flux-sonde')!, 'https://flux.example/x');
    document.querySelector<HTMLButtonElement>('[data-sonder]')!.click();
    await attendreQue(() => !!document.querySelector('[data-sonde-existe]'), 'l’alerte de doublon');
    expect(document.querySelector('[data-sonde-existe]')!.textContent).toContain('« FIP »');
    expect(document.querySelector('[data-sonde-resultat]')!.textContent).toContain('enregistrer quand même');
  });
});
