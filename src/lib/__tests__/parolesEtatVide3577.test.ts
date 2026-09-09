// @vitest-environment jsdom
//
// « Le panneau Paroles s'ouvre BLANC » — renesenses/tune-server-rust#3577,
// Belkadi Yacine, fil forum 1703 (07/09/2026, Tune 0.9.140 · Linux).
//
// Deux verrous se cumulaient :
//   1. `tune-server/src/routes/library/tracks.rs` n'interroge LRCLIB que si
//      `lyrics_lrclib_enabled == "true"` ; sinon il rend `404 no_lyrics` ;
//   2. `NowPlayingLyrics.svelte` portait, en branche finale,
//      `<!-- No lyrics: show nothing (no empty state) -->`, et la règle
//      `.lyrics-empty` survivait DÉBRANCHÉE dans le même fichier.
//
// Et `lib/lyrics.ts` avalait toute erreur (`catch { return null }`) : un 404,
// un 500 et une coupure réseau produisaient exactement le même écran — blanc.
//
// 🔴 Ces témoins EXERCENT la conduite : ils montent le vrai composant et
// pilotent la vraie fonction de chargement avec un `fetch` bouchonné. Aucun ne
// lit le source d'un composant : débrancher l'état vide doit les faire rougir,
// ce qu'un test qui cherche une chaîne dans un fichier ne fait pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import NowPlayingLyrics from '../../components/NowPlayingLyrics.svelte';
import { classifyLyricsError } from '../lyrics';
import { parolesEnLigneActives, parolesEnLigneDepuisConfig } from '../lyricsOnline';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

/** Réponse `fetch` minimale, dans la forme que `fetchJSON` consomme. */
function reponse(corps: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

interface Etat {
  loading?: boolean;
  lyrics?: string | null;
  syncedLines?: { time: number; text: string }[];
  source?: string | null;
  miss?: 'none' | 'error' | null;
}

function poser(etat: Etat): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlayingLyrics, {
    target: hote,
    props: {
      loading: false,
      lyrics: null,
      syncedLines: [],
      karaokeMode: false,
      source: null,
      miss: null,
      onToggleKaraoke: () => {},
      ...etat,
    },
  });
  return hote;
}

beforeEach(() => {
  parolesEnLigneActives.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('le panneau ne s’ouvre plus blanc', () => {
  it('affiche « aucune parole » quand le serveur n’en a pas', () => {
    const el = poser({ miss: 'none' });
    expect(el.textContent).toContain(fr['lyrics.empty.none']);
    // La règle débranchée est rebranchée : le texte porte bien la classe.
    expect(el.querySelector('.lyrics-empty')).not.toBeNull();
  });

  it('nomme le réglage quand la recherche en ligne est éteinte — la case est à l’autre bout de l’application', () => {
    parolesEnLigneActives.set(false);
    const el = poser({ miss: 'none' });
    expect(el.textContent).toContain(fr['lyrics.empty.onlineOff']);
  });

  it('n’accuse pas le réglage quand la recherche en ligne est allumée', () => {
    parolesEnLigneActives.set(true);
    const el = poser({ miss: 'none' });
    expect(el.textContent).toContain(fr['lyrics.empty.none']);
    expect(el.textContent).not.toContain(fr['lyrics.empty.onlineOff']);
  });

  it('n’accuse pas le réglage tant qu’il n’est PAS ÉTABLI', () => {
    // `null` = config pas encore lue. Accuser un réglage qu'on n'a pas lu
    // serait une invention, et l'utilisateur irait décocher une case déjà
    // cochée.
    parolesEnLigneActives.set(null);
    const el = poser({ miss: 'none' });
    expect(el.textContent).not.toContain(fr['lyrics.empty.onlineOff']);
  });

  it('dit « échec » quand la requête a échoué, et JAMAIS « aucune parole »', () => {
    const el = poser({ miss: 'error' });
    expect(el.textContent).toContain(fr['lyrics.empty.error']);
    expect(el.textContent).not.toContain(fr['lyrics.empty.none']);
  });

  /** Contre-épreuve : les trois phrases ne doivent JAMAIS couvrir un texte. */
  it('se tait quand il a des paroles à montrer', () => {
    const el = poser({ lyrics: 'Ne me quitte pas', miss: null });
    expect(el.textContent).toContain('Ne me quitte pas');
    for (const cle of ['lyrics.empty.none', 'lyrics.empty.onlineOff', 'lyrics.empty.error']) {
      expect(el.textContent).not.toContain(fr[cle]);
    }
    expect(el.querySelector('.lyrics-empty')).toBeNull();
  });

  it('se tait pendant le chargement — le tourniquet suffit, et l’état vide mentirait', () => {
    const el = poser({ loading: true, miss: 'none' });
    expect(el.querySelector('.spinner-sm')).not.toBeNull();
    expect(el.textContent).not.toContain(fr['lyrics.empty.none']);
  });

  it('se tait tant que rien n’a été demandé pour cette piste (miss null)', () => {
    const el = poser({ miss: null });
    expect(el.querySelector('.lyrics-empty')).toBeNull();
  });
});

describe('lyrics.ts ne confond plus « rien » et « panne »', () => {
  it('classe 404 et 405 en « rien », tout le reste en panne', () => {
    expect(classifyLyricsError({ status: 404 })).toBe('none');
    expect(classifyLyricsError({ status: 405 })).toBe('none');
    expect(classifyLyricsError({ status: 500 })).toBe('error');
    expect(classifyLyricsError({ status: 502 })).toBe('error');
    // Coupure réseau : `fetchJSON` relance l'erreur de `fetch`, sans statut.
    expect(classifyLyricsError(new Error('Failed to fetch'))).toBe('error');
    expect(classifyLyricsError(null)).toBe('error');
  });

  /** Le vrai chemin, `fetch` compris : c'est lui qui avalait le motif. */
  it('rend miss=none sur le 404 no_lyrics du serveur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({ error: 'no_lyrics' }, 404)));
    const { fetchTrackLyrics } = await import('../lyrics');
    expect(await fetchTrackLyrics(42)).toEqual({ data: null, miss: 'none' });
  });

  it('rend miss=error sur un 500 — la panne remonte jusqu’à l’écran', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({ error: 'boom' }, 500)));
    const { fetchTrackLyrics } = await import('../lyrics');
    expect(await fetchTrackLyrics(42)).toEqual({ data: null, miss: 'error' });
  });

  it('rend miss=error quand le réseau tombe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const { fetchTrackLyrics } = await import('../lyrics');
    expect(await fetchTrackLyrics(42)).toEqual({ data: null, miss: 'error' });
  });

  it('rend les paroles et aucun motif quand le serveur répond', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      reponse({ synced: false, source: 'tag', lines: [{ t_ms: null, text: 'une ligne' }] }),
    ));
    const { fetchTrackLyrics } = await import('../lyrics');
    const r = await fetchTrackLyrics(42);
    expect(r.miss).toBeNull();
    expect(r.data?.lines[0].text).toBe('une ligne');
  });

  it('rend miss=none, et non une requête, quand titre ou artiste manque', async () => {
    const appels = vi.fn(async () => reponse({}, 200));
    vi.stubGlobal('fetch', appels);
    const { fetchLyricsByMeta } = await import('../lyrics');
    expect(await fetchLyricsByMeta({ title: ' ', artist: 'A', radio: true })).toEqual({
      data: null, miss: 'none',
    });
    expect(appels).not.toHaveBeenCalled();
  });
});

describe('le témoin « recherche en ligne » suit la règle du serveur', () => {
  /**
   * `tracks.rs` compare à la CHAÎNE "true" :
   *     settings.get("lyrics_lrclib_enabled")…as_deref() == Some("true")
   * et `/system/config` ne publie pas de défaut pour cette clé : absente =
   * éteinte. Le client doit dire la même chose, sans quoi il accuserait le
   * réglage à tort ou l'innocenterait à tort.
   */
  it('lit true et "true" comme allumé, tout le reste comme éteint', () => {
    expect(parolesEnLigneDepuisConfig(true)).toBe(true);
    expect(parolesEnLigneDepuisConfig('true')).toBe(true);
    expect(parolesEnLigneDepuisConfig(false)).toBe(false);
    expect(parolesEnLigneDepuisConfig('false')).toBe(false);
    expect(parolesEnLigneDepuisConfig(undefined)).toBe(false);
  });

  it('renseigne le témoin depuis /system/config', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({ lyrics_lrclib_enabled: 'true' })));
    const mod = await import('../lyricsOnline');
    await mod.chargerParolesEnLigne(true);
    expect(get(mod.parolesEnLigneActives)).toBe(true);
  });

  it('laisse le témoin à « pas établi » quand la config est illisible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const mod = await import('../lyricsOnline');
    await mod.chargerParolesEnLigne(true);
    expect(get(mod.parolesEnLigneActives)).toBeNull();
  });
});
