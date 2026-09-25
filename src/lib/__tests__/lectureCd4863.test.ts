// @vitest-environment jsdom
//
// jsdom : sans `window`, `$effect` ne se déclenche pas et l'écran ne lirait
// jamais `/ext/cd/etat` — un test vert qui n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import LectureCdV2 from '../../components/v2/LectureCdV2.svelte';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';
import { preparerLocale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { cdPlugin, dureeCd, delaiRelectureCd, RELECTURE_CD_MS, RELECTURE_CD_MAX_MS } from '../lectureCd';
import fr from '../locales/fr';

/**
 * Écran « Lecture CD » — renesenses/tune-server-rust#4863.
 *
 * Contrat du greffon natif `cd` (`plugins/tune-cd/src/routes.rs`) :
 *
 *   GET  /api/v1/ext/cd/etat    → { plateforme_prise_en_charge, lecteur, presence }
 *   GET  /api/v1/ext/cd/disque  → { disc_id, metadonnees, titre, artiste, pochette, pistes }
 *                                 409 aucun_disque · 502 lecture_toc
 *   POST /api/v1/ext/cd/jouer   { zone_id, piste? }
 *
 * Ce qui est gardé : les trois états du lecteur, la liste des pistes (durée,
 * « Piste N » sans métadonnées), « Lire le disque » et « Lire cette piste »
 * vers la zone courante, l'insertion vue par la relecture, une erreur dite par
 * une phrase (jamais le code), et l'écran fermé sans le greffon.
 */

const DISQUE = {
  disc_id: 'Wn8eRBtfLDfM0qjYPdxrz.Zjs_U-',
  metadonnees: 'musicbrainz',
  titre: 'Kind of Blue',
  artiste: 'Miles Davis',
  release_id: 'r1',
  pochette: 'https://coverartarchive.org/release/r1/front-250',
  toc: { premiere: 1, derniere: 3, fin: 150000, pistes_de_donnees: [] },
  pistes: [
    { numero: 1, titre: 'So What', artiste: 'Miles Davis', duree_ms: 562000, premier_secteur: 0, secteurs: 1, source_id: 'x/1' },
    { numero: 2, titre: 'Freddie Freeloader', artiste: 'Miles Davis', duree_ms: 586000, premier_secteur: 1, secteurs: 1, source_id: 'x/2' },
    { numero: 3, titre: 'Blue in Green', artiste: 'Miles Davis', duree_ms: 337000, premier_secteur: 2, secteurs: 1, source_id: 'x/3' },
  ],
};

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];
let greffon: unknown[] = [];
let etat: { plateforme_prise_en_charge: boolean; lecteur: string | null; presence: string } = {
  plateforme_prise_en_charge: true, lecteur: '/dev/sr0', presence: 'disque',
};
let disque: unknown = DISQUE;
let refusDisque: { status: number; corps: unknown } | null = null;
let refusJouer: { status: number; corps: unknown } | null = null;

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
  greffon = [{ name: 'cd', type: 'sdk', installed: true, enabled: true, compatible: true, description: 'CD', version: '1' }];
  etat = { plateforme_prise_en_charge: true, lecteur: '/dev/sr0', presence: 'disque' };
  disque = DISQUE;
  refusDisque = null;
  refusJouer = null;
  cdPlugin.set(null);
  currentZoneId.set(3);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      appels.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.includes('/ext/cd/etat')) return reponse(200, etat);
      if (u.includes('/ext/cd/disque')) return refusDisque ? reponse(refusDisque.status, refusDisque.corps) : reponse(200, disque);
      if (u.includes('/ext/cd/jouer')) {
        if (refusJouer) return reponse(refusJouer.status, refusJouer.corps);
        const b = JSON.parse(String(init?.body));
        return reponse(200, { zone_id: b.zone_id, disc_id: DISQUE.disc_id, piste: b.piste ?? 1, file: 3 });
      }
      if (/\/zones\/3$/.test(u)) return reponse(200, { id: 3, name: 'Salon', state: 'playing' });
      if (u.includes('/marketplace')) return reponse(200, { plugins: [] });
      if (u.endsWith('/plugins')) return reponse(200, greffon);
      if (u.includes('/plugins/docs')) return reponse(200, {});
      return reponse(200, {});
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 6; i++) {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
  }
}

async function poser(Vue: typeof LectureCdV2 | typeof PluginsV2): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Vue as any, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}

const appelsCd = () => appels.filter((a) => a.url.includes('/ext/cd/'));
const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

describe('Lecture CD — états du lecteur', () => {
  it('disque présent : pochette, album, artiste, pistes et durées', async () => {
    const el = await poser(LectureCdV2);
    expect(el.querySelector('.album')?.textContent).toBe('Kind of Blue');
    expect(el.querySelector('.artiste')?.textContent).toBe('Miles Davis');
    expect(el.querySelector('img.pochette')?.getAttribute('src')).toBe(DISQUE.pochette);
    const pistes = [...el.querySelectorAll('li.piste')];
    expect(pistes).toHaveLength(3);
    expect(pistes[0].querySelector('.titre')?.textContent?.trim()).toBe('So What');
    expect(pistes[0].querySelector('.duree')?.textContent).toBe('9:22');
    expect(pistes[2].querySelector('.duree')?.textContent).toBe('5:37');
  });

  it('sans métadonnées : « Piste N » dans la langue de l’écran', async () => {
    disque = {
      ...DISQUE, metadonnees: 'repli', titre: null, artiste: null, pochette: null,
      pistes: DISQUE.pistes.map((p) => ({ ...p, titre: `Piste ${p.numero}`, artiste: '' })),
    };
    const el = await poser(LectureCdV2);
    const titres = [...el.querySelectorAll('li.piste .titre')].map((n) => n.textContent?.trim());
    expect(titres).toEqual([1, 2, 3].map((n) => fr['v2.cd.trackN'].replace('{n}', String(n))));
    expect(el.querySelector('.album')?.textContent).toBe(fr['v2.cd.unknownAlbum']);
    expect(el.querySelector('img.pochette'), 'pas de pochette inventée').toBeNull();
    expect(texte(el)).toContain(fr['v2.cd.noMetadata']);
  });

  it('pas de disque : l’écran le dit, sans lire le disque', async () => {
    etat = { ...etat, presence: 'vide' };
    const el = await poser(LectureCdV2);
    expect(el.querySelector('.vide')?.textContent).toBe(fr['v2.cd.noDisc']);
    expect(appelsCd().some((a) => a.url.includes('/disque'))).toBe(false);
  });

  it('pas de lecteur : l’écran le dit', async () => {
    etat = { plateforme_prise_en_charge: true, lecteur: null, presence: 'aucun_lecteur' };
    const el = await poser(LectureCdV2);
    expect(el.querySelector('.lecteur-absent')?.textContent).toBe(fr['v2.cd.noDrive']);
  });

  it('plateforme non prise en charge (macOS, Windows) : un état, pas une erreur', async () => {
    etat = { plateforme_prise_en_charge: false, lecteur: null, presence: 'aucun_lecteur' };
    const el = await poser(LectureCdV2);
    expect(el.querySelector('.plateforme')?.textContent).toBe(fr['v2.cd.unsupportedPlatform']);
    expect(el.querySelector('.err')).toBeNull();
  });
});

describe('Lecture CD — lecture vers la zone courante', () => {
  it('« Lire le disque » pose le disque entier sur la zone courante, sans piste', async () => {
    const el = await poser(LectureCdV2);
    (el.querySelector('button.lire-disque') as HTMLButtonElement).click();
    await laisserFaire();
    const jouer = appels.filter((a) => a.url.includes('/ext/cd/jouer'));
    expect(jouer).toHaveLength(1);
    expect(jouer[0].method).toBe('POST');
    expect(jouer[0].body).toEqual({ zone_id: 3 });
    // La barre de lecture reçoit l'état de la zone tout de suite.
    expect(appels.some((a) => /\/zones\/3$/.test(a.url))).toBe(true);
  });

  it('« Lire cette piste » envoie le numéro de la piste', async () => {
    const el = await poser(LectureCdV2);
    const boutons = el.querySelectorAll('button.lire-piste');
    (boutons[1] as HTMLButtonElement).click();
    await laisserFaire();
    const jouer = appels.filter((a) => a.url.includes('/ext/cd/jouer'));
    expect(jouer.map((a) => a.body)).toEqual([{ zone_id: 3, piste: 2 }]);
  });

  it('sans zone courante, les boutons de lecture sont éteints', async () => {
    currentZoneId.set(null);
    const el = await poser(LectureCdV2);
    expect((el.querySelector('button.lire-disque') as HTMLButtonElement).disabled).toBe(true);
    expect((el.querySelector('button.lire-piste') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Lecture CD — insertion, éjection, erreurs', () => {
  it('l’insertion est vue par la relecture de /etat, puis le disque est lu', async () => {
    etat = { ...etat, presence: 'vide' };
    const el = await poser(LectureCdV2);
    expect(el.querySelector('li.piste')).toBeNull();
    etat = { ...etat, presence: 'disque' };
    await vi.advanceTimersByTimeAsync(RELECTURE_CD_MS);
    await laisserFaire();
    expect(el.querySelectorAll('li.piste')).toHaveLength(3);
    // Éjection : la liste disparaît, l'écran dit « vide ».
    etat = { ...etat, presence: 'vide' };
    await vi.advanceTimersByTimeAsync(RELECTURE_CD_MS);
    await laisserFaire();
    expect(el.querySelector('li.piste')).toBeNull();
    expect(el.querySelector('.vide')).not.toBeNull();
  });

  it('le disque n’est pas relu tant que la présence ne change pas', async () => {
    await poser(LectureCdV2);
    await vi.advanceTimersByTimeAsync(RELECTURE_CD_MS * 3);
    await laisserFaire();
    const disques = appelsCd().filter((a) => a.url.includes('/disque'));
    const etats = appelsCd().filter((a) => a.url.includes('/etat'));
    expect(disques).toHaveLength(1);
    expect(etats.length).toBeGreaterThanOrEqual(3);
  });

  it('la relecture s’arrête quand l’écran est fermé', async () => {
    await poser(LectureCdV2);
    unmount(monte!); monte = null;
    const avant = appelsCd().length;
    await vi.advanceTimersByTimeAsync(RELECTURE_CD_MS * 5);
    expect(appelsCd().length).toBe(avant);
  });

  it('un disque illisible : une phrase claire, jamais le code ni le bandeau brut', async () => {
    refusDisque = { status: 502, corps: { error: 'lecture_toc', message: 'ioctl CDROMREADTOCHDR: EIO' } };
    const el = await poser(LectureCdV2);
    const err = el.querySelector('.err')?.textContent ?? '';
    expect(err).toBe(fr['v2.cd.unreadable']);
    expect(err).not.toContain('lecture_toc');
    expect(document.body.textContent ?? '').not.toContain('Server error');
  });

  it('un refus de lecture se dit par une phrase', async () => {
    refusJouer = { status: 502, corps: { error: 'lecture', message: 'zone introuvable' } };
    const el = await poser(LectureCdV2);
    (el.querySelector('button.lire-disque') as HTMLButtonElement).click();
    await laisserFaire();
    expect(el.querySelector('.err')?.textContent).toBe(fr['v2.cd.playFailed']);
  });
});

describe('Lecture CD — masquée sans le greffon', () => {
  it('greffon absent : l’écran n’interroge pas ses routes', async () => {
    greffon = [];
    const el = await poser(LectureCdV2);
    expect(appelsCd()).toHaveLength(0);
    expect(el.querySelector('.absent')?.textContent).toBe(fr['v2.cd.notInstalled']);
    expect(el.querySelector('li.piste')).toBeNull();
  });

  it('greffon installé mais pas encore chargé (redémarrage attendu) : idem', async () => {
    greffon = [{ name: 'cd', installed: true, enabled: false }];
    await poser(LectureCdV2);
    expect(appelsCd()).toHaveLength(0);
  });

  it('Extensions : « Ouvrir » n’existe que pour un greffon cd actif, et mène à l’écran', async () => {
    greffon = [{ name: 'cd', type: 'sdk', installed: false, enabled: false, compatible: true, description: 'CD', version: '1' }];
    let el = await poser(PluginsV2);
    expect(el.querySelector('button.ouvrir-cd')).toBeNull();
    unmount(monte!); monte = null; hote?.remove();

    greffon = [{ name: 'cd', type: 'sdk', installed: true, enabled: true, compatible: true, description: 'CD', version: '1' }];
    el = await poser(PluginsV2);
    const ouvrir = el.querySelector('button.ouvrir-cd') as HTMLButtonElement | null;
    expect(ouvrir).not.toBeNull();
    ouvrir!.click();
    expect(get(activeView)).toBe('lecturecd');
  });
});

describe('Lecture CD — aides', () => {
  it('durées', () => {
    expect(dureeCd(0)).toBe('0:00');
    expect(dureeCd(61_000)).toBe('1:01');
    expect(dureeCd(3_725_000)).toBe('1:02:05');
  });
  it('la relecture ralentit sur échec, bornée', () => {
    expect(delaiRelectureCd(0)).toBe(RELECTURE_CD_MS);
    expect(delaiRelectureCd(1)).toBe(RELECTURE_CD_MS * 2);
    expect(delaiRelectureCd(20)).toBe(RELECTURE_CD_MAX_MS);
  });
});
