// @vitest-environment jsdom
//
// Tune Circle rc8 — la scène : tailles, arrondis, dégradé 404/503, réglage du
// lieu (PUT/DELETE, arrondi avant l'envoi), budget et mouvement réduit,
// points de terre. Contrat : coordination/contrat-tune-circle-rc8.md.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  rayonRelatif, arrondiSignificatif, arrondiDemiDegre, maxConnu, PLANCHER_RAYON, RAYON_PAR_DEFAUT,
} from '../champCercle/tailles';
import { budgetScene, parBudget } from '../champCercle/budget';
import { construireScene, grappesDeGenres, idContact, type DonneesCercle } from '../champCercle/scene';
import { projeter, deprojeter, decoderPointsTerre, DEG } from '../champCercle/globe';
import { POINTS_TERRE } from '../champCercle/pointsTerre';
import { ChampCercle } from '../champCercle/moteur';
import {
  lireMonLieu, poserMonLieu, retirerMonLieu, lireResumeContact, resumeValide, corpsLieu, lieuValide,
} from '../circleMonde';

function reponse(status: number, corps?: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}

type Appel = { url: string; method: string; body: unknown };
function fauxServeur(route: (url: string, method: string, body: any) => Response): Appel[] {
  const appels: Appel[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    appels.push({ url: String(url), method, body });
    return route(String(url), method, body);
  }));
  return appels;
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('tailles des planètes : aire proportionnelle aux albums', () => {
  it('rayon = √(albums / max) : quatre fois moins d\'albums, rayon moitié', () => {
    expect(rayonRelatif(1000, 1000)).toBe(1);
    expect(rayonRelatif(250, 1000)).toBeCloseTo(0.5, 6);
    // L'AIRE (r²) suit le rapport des albums.
    const r = rayonRelatif(640, 1000);
    expect(r * r).toBeCloseTo(0.64, 6);
  });

  it('plancher : une petite bibliothèque reste visible ; jamais au-dessus de 1', () => {
    expect(rayonRelatif(1, 9300)).toBe(PLANCHER_RAYON);
    expect(rayonRelatif(0, 9300)).toBe(PLANCHER_RAYON);
    expect(rayonRelatif(20000, 9300)).toBe(1);
  });

  it('inconnu (contact qui ne partage pas) : taille par défaut, qui ne dit rien', () => {
    expect(rayonRelatif(null, 9300)).toBe(RAYON_PAR_DEFAUT);
    expect(rayonRelatif(undefined, 9300)).toBe(RAYON_PAR_DEFAUT);
    expect(rayonRelatif(Number.NaN, 9300)).toBe(RAYON_PAR_DEFAUT);
    expect(maxConnu([null, 12, undefined, 9336])).toBe(9336);
  });
});

describe('arrondis', () => {
  it('2 chiffres significatifs', () => {
    expect(arrondiSignificatif(9336)).toBe(9300);
    expect(arrondiSignificatif(1249)).toBe(1200);
    expect(arrondiSignificatif(1250)).toBe(1300);
    expect(arrondiSignificatif(87)).toBe(87);
    expect(arrondiSignificatif(149)).toBe(150);
    expect(arrondiSignificatif(3)).toBe(3);
    expect(arrondiSignificatif(0)).toBe(0);
    expect(arrondiSignificatif(31234)).toBe(31000);
  });

  it('demi-degré, sans « -0 »', () => {
    expect(arrondiDemiDegre(47.34)).toBe(47.5);
    expect(arrondiDemiDegre(5.24)).toBe(5);
    expect(arrondiDemiDegre(5.26)).toBe(5.5);
    expect(Object.is(arrondiDemiDegre(-0.2), 0)).toBe(true);
    // Annexe du contrat cloud : demi-pas loin de zéro.
    expect(arrondiDemiDegre(-12.25)).toBe(-12.5);
    expect(arrondiDemiDegre(12.25)).toBe(12.5);
    expect(arrondiDemiDegre(4.9969)).toBe(5);
  });

  it('le résumé d\'un contact est ré-arrondi et borné à 8 genres', () => {
    const r = resumeValide({
      albums: 1234, cover_path: '/home/x', genres: Array.from({ length: 12 }, (_, i) => ({ genre: `G${i}`, albums: 101 + i, path: '/x' })),
    });
    expect(r).toEqual({ albums: 1200, genres: Array.from({ length: 8 }, (_, i) => ({ genre: `G${i}`, albums: arrondiSignificatif(101 + i) })) });
    expect(JSON.stringify(r)).not.toContain('/home');
  });
});

describe('dégradé : routes relais absentes (404) ou cloud injoignable (503)', () => {
  it('404 sur /me/location = serveur plus ancien : « absent »', async () => {
    fauxServeur(() => reponse(404, { error: 'not_found' }));
    expect(await lireMonLieu()).toEqual({ relais: 'absent', lieu: null });
  });

  it('503 = indisponible, et rien n\'est inventé', async () => {
    fauxServeur(() => reponse(503, { code: 'circle.cloud_unavailable' }));
    expect(await lireMonLieu()).toEqual({ relais: 'indisponible', lieu: null });
  });

  it('204 = routes présentes, aucun lieu posé', async () => {
    fauxServeur(() => reponse(204));
    expect(await lireMonLieu()).toEqual({ relais: 'ok', lieu: null });
  });

  it('résumé d\'un contact : 403, 404, 204 et 503 donnent tous « inconnu »', async () => {
    for (const s of [403, 404, 204, 503]) {
      fauxServeur(() => reponse(s, s === 204 ? undefined : { error: 'x' }));
      expect(await lireResumeContact(12), `statut ${s}`).toBeNull();
    }
  });
});

describe('réglage « Montrer ma ville à mes proches »', () => {
  it('PUT : position arrondie au demi-degré AVANT l\'envoi, rien d\'autre ne part', async () => {
    const appels = fauxServeur((_u, m, b) => (m === 'PUT' ? reponse(200, b) : reponse(404)));
    const l = await poserMonLieu({ label: '  Talant  ', country_code: 'fr', lat: 47.3361, lon: 5.0049 });
    expect(appels).toHaveLength(1);
    expect(appels[0].method).toBe('PUT');
    expect(appels[0].url).toMatch(/\/api\/v1\/ext\/circle\/me\/location$/);
    expect(appels[0].body).toEqual({ label: 'Talant', country_code: 'FR', lat: 47.5, lon: 5 });
    expect(l).toEqual({ label: 'Talant', country_code: 'FR', lat: 47.5, lon: 5 });
  });

  it('libellé vide ou trop long, position hors du globe : rien ne part', async () => {
    const appels = fauxServeur(() => reponse(200, {}));
    await expect(poserMonLieu({ label: '', lat: 1, lon: 1 })).rejects.toThrow();
    await expect(poserMonLieu({ label: 'x'.repeat(61), lat: 1, lon: 1 })).rejects.toThrow();
    await expect(poserMonLieu({ label: 'Nulle part', lat: 91, lon: 1 })).rejects.toThrow();
    await expect(poserMonLieu({ label: 'Ici', lat: Number.NaN, lon: 1 })).rejects.toThrow();
    expect(appels).toHaveLength(0);
    expect(corpsLieu({ label: 'x'.repeat(60), lat: 0, lon: 0 })).not.toBeNull();
    expect(corpsLieu({ label: 'Ici', country_code: 'FRA', lat: 0, lon: 0 })).toBeNull();
  });

  it('retrait en un clic : DELETE', async () => {
    const appels = fauxServeur(() => reponse(204));
    await retirerMonLieu();
    expect(appels.map((a) => `${a.method} ${a.url.replace(/^.*\/api\/v1/, '')}`)).toEqual(['DELETE /ext/circle/me/location']);
  });

  it('un lieu reçu est relu champ par champ (et ré-arrondi)', () => {
    expect(lieuValide({ label: 'Budapest', country_code: 'hu', lat: 47.49, lon: 19.04, street: 'x' }))
      .toEqual({ label: 'Budapest', country_code: 'HU', lat: 47.5, lon: 19 });
    expect(lieuValide({ label: 'x', lat: 120, lon: 0 })).toBeNull();
  });
});

describe('budget de la scène', () => {
  it('mouvement réduit : image fixe', () => {
    expect(budgetScene({ largeur: 1440, lectureLocale: false, mouvementReduit: true })).toMatchObject({ anime: false, ips: 0 });
  });

  it('lecture dans le navigateur : moins de particules, 30 i/s, densité 1', () => {
    const b = budgetScene({ largeur: 1440, lectureLocale: true, mouvementReduit: false });
    expect(b).toEqual({ anime: true, facteur: 0.4, ips: 30, dprMax: 1 });
    expect(parBudget(2600, b)).toBe(1040);
  });

  it('petit écran (< 768 px) : moitié moins, et cumul avec la lecture', () => {
    expect(budgetScene({ largeur: 390, lectureLocale: false, mouvementReduit: false }).facteur).toBe(0.5);
    expect(budgetScene({ largeur: 390, lectureLocale: true, mouvementReduit: false }).facteur).toBe(0.2);
    expect(budgetScene({ largeur: 1440, lectureLocale: false, mouvementReduit: false })).toEqual({ anime: true, facteur: 1, ips: 60, dprMax: 2 });
  });
});

describe('scène en données', () => {
  const base = (): DonneesCercle => ({
    moi: { nom: 'Bertrand', albums: 9300, genres: [{ genre: 'Jazz', albums: 1400 }, { genre: 'Rock', albums: 2100 }], lieu: { label: 'Talant', lat: 47.5, lon: 5 } },
    contacts: [
      { id: 12, nom: 'Levente', albums: 1200, genres: [{ genre: 'Jazz', albums: 300 }], lieu: { label: 'Budapest', lat: 47.5, lon: 19 } },
      { id: 13, nom: 'Ana', albums: null, genres: [], lieu: null },
    ],
    cercles: [{ id: 7, nom: 'Family', membres: [12, 13] }],
    focus: null, maxAutour: 12, maxGrappes: 6,
  });

  it('Réseau : la taille suit l\'aire ; sans partage, taille par défaut', () => {
    const s = construireScene(base());
    const r = s.vues.reseau.noeuds;
    // Un cercle au milieu : ma planète se fait plus petite pour lui laisser la place.
    expect(r.self.sphere).toBeCloseTo(0.2, 3);
    expect(r[idContact(12)].sphere).toBeCloseTo(0.16 * Math.sqrt(1200 / 9300), 3);
    expect(r[idContact(13)].sphere).toBeCloseTo(0.16 * RAYON_PAR_DEFAUT, 3);
    // Le flux dit « partage » : vers moi, et jamais pour un contact qui ne partage pas.
    expect(s.vues.reseau.liens[`self|${idContact(12)}`]).toBe('stream');
    // Ana ne partage pas et est dans « Family » : aucun fil, elle est dans l'anneau du cercle (avec moi).
    expect(s.vues.reseau.liens[`self|${idContact(13)}`]).toBeUndefined();
    expect(s.liens.some((l) => l.a === 'k:7' || l.b === 'k:7')).toBe(false);
    expect(s.noeuds.find((n) => n.id === 'k:7')?.enclos).toEqual(['self', idContact(12), idContact(13)]);
    const sans = base();
    sans.cercles = [];
    const s2 = construireScene(sans);
    expect(s2.vues.reseau.noeuds.self.sphere).toBeCloseTo(0.3, 3);
    expect(s2.vues.reseau.liens[`self|${idContact(13)}`]).toBe('line');
  });

  it('Genres : seuls les contacts qui partagent forment les grappes', () => {
    const g = grappesDeGenres(base(), 6);
    expect(g).toEqual([{ genre: 'Jazz', albums: 1700, membres: [12], moi: true }]);
  });

  it('Genres sans aucun partage : mes genres locaux, personne autour', () => {
    const d = base();
    d.contacts = d.contacts.map((c) => ({ ...c, albums: null, genres: [] }));
    expect(grappesDeGenres(d, 6).map((g) => [g.genre, g.membres.length])).toEqual([['Rock', 0], ['Jazz', 0]]);
  });

  it('Monde : une épingle par lieu POSÉ, rien pour les autres', () => {
    const s = construireScene(base());
    expect(Object.keys(s.vues.monde.noeuds).sort()).toEqual(['p:12', 'p:moi']);
    const d = base();
    d.moi.lieu = null;
    expect(Object.keys(construireScene(d).vues.monde.noeuds)).toEqual(['p:12']);
  });

  it('grand écran : 11 contacts sans partage ni lieu = 11 planètes en Réseau, aucune puce « +N », reliées à moi', () => {
    const d = base();
    d.cercles = [];
    d.maxAutour = 30;
    d.contacts = Array.from({ length: 11 }, (_, i) => ({ id: 100 + i, nom: `P${i}`, albums: null, genres: [], lieu: null }));
    const s = construireScene(d);
    const cs = Object.keys(s.vues.reseau.noeuds).filter((k) => k.startsWith('c:'));
    expect(cs).toHaveLength(11);
    expect(s.noeuds.find((n) => n.id === 'more')).toBeUndefined();
    for (const id of cs) {
      expect(s.vues.reseau.noeuds[id].alpha).toBe(1);
      expect(s.vues.reseau.noeuds[id].sphere).toBeGreaterThan(0.05);
      expect(s.vues.reseau.liens[`self|${id}`]).toBe('line');
    }
    // Lisibles : deux planètes voisines ne se touchent pas (unités de scène).
    const pts = cs.map((id) => s.vues.reseau.noeuds[id]);
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      expect(Math.hypot(pts[i].x! - pts[j].x!, pts[i].y! - pts[j].y!)).toBeGreaterThan(0.3);
    }
  });

  it('30 contacts : deux couronnes alternées, tous visibles', () => {
    const d = base();
    d.cercles = [];
    d.maxAutour = 30;
    d.contacts = Array.from({ length: 30 }, (_, i) => ({ id: 200 + i, nom: `P${i}`, albums: null, genres: [], lieu: null }));
    const s = construireScene(d);
    const cs = Object.keys(s.vues.reseau.noeuds).filter((k) => k.startsWith('c:'));
    expect(cs).toHaveLength(30);
    const rayons = new Set(cs.map((id) => Math.hypot(s.vues.reseau.noeuds[id].x! / 0.84, s.vues.reseau.noeuds[id].y! / 0.8).toFixed(2)));
    expect(rayons.size).toBe(2);
  });

  it('cercles : en Solo et en Réseau des ANNEAUX nommés (plus aucun nœud entre moi et mes membres)', () => {
    const d = base();
    d.contacts = [
      { id: 12, nom: 'Levente', albums: null, genres: [], lieu: null },
      { id: 13, nom: 'Ana', albums: null, genres: [], lieu: null },
      { id: 14, nom: 'Bruno', albums: null, genres: [], lieu: null },
      { id: 15, nom: 'Hors', albums: null, genres: [], lieu: null },
    ];
    d.cercles = [{ id: 7, nom: 'Family', membres: [12, 13] }, { id: 8, nom: 'Jazz', membres: [13, 14] }];
    const s = construireScene(d);
    // Solo : deux anneaux, nommés, qui m'englobent avec leurs membres ; les pastilles des membres sont là.
    const solo = Object.keys(s.vues.seul.noeuds).filter((k) => k.startsWith('ks:')).sort();
    expect(solo).toEqual(['ks:7', 'ks:8']);
    expect(s.noeuds.find((n) => n.id === 'ks:7')).toMatchObject({ kind: 'ring', label: 'Family', enclos: ['self', idContact(12), idContact(13)] });
    expect(s.vues.seul.noeuds[idContact(13)].avatar).toBeGreaterThan(0);
    expect(s.vues.seul.noeuds[idContact(15)]).toBeUndefined();
    expect(Object.keys(s.vues.seul.liens)).toEqual([]);
    // Réseau : Ana est UNE planète, dans les DEUX anneaux ; « Hors » est relié à moi.
    expect(s.noeuds.filter((n) => n.id === idContact(13))).toHaveLength(1);
    expect(s.noeuds.find((n) => n.id === 'k:7')?.enclos).toContain(idContact(13));
    expect(s.noeuds.find((n) => n.id === 'k:8')?.enclos).toContain(idContact(13));
    expect(s.noeuds.find((n) => n.id === 'k:7')?.enclos).not.toContain(idContact(14));
    expect(s.vues.reseau.liens[`self|${idContact(15)}`]).toBe('line');
    expect(s.noeuds.some((n) => (n.kind as string) === 'circle')).toBe(false);
    // Genres inchangé : aucun anneau.
    expect(Object.keys(s.vues.genres.noeuds).some((k) => k.startsWith('k'))).toBe(false);
  });

  it('mobile : au plus 8 contacts autour, puis « +N »', () => {
    const d = base();
    d.maxAutour = 8;
    d.contacts = Array.from({ length: 11 }, (_, i) => ({ id: 100 + i, nom: `P${i}`, albums: null, genres: [], lieu: null }));
    const s = construireScene(d);
    expect(Object.keys(s.vues.reseau.noeuds).filter((k) => k.startsWith('c:'))).toHaveLength(8);
    expect(s.noeuds.find((n) => n.id === 'more')?.label).toBe('+3');
  });
});

describe('globe', () => {
  it('cliquer un point du globe rend le lieu projeté (aller-retour)', () => {
    const o = { lon0: 8 * DEG, tilt: 0.62 };
    const [x, y, z] = projeter(47.34 * DEG, 5.0 * DEG, 300, 400, 300, o);
    expect(z).toBeGreaterThan(0);
    const l = deprojeter(x, y, 300, 400, 300, o)!;
    expect(l.lat).toBeCloseTo(47.34, 6);
    expect(l.lon).toBeCloseTo(5.0, 6);
    expect(deprojeter(0, 0, 300, 400, 300, o)).toBeNull();
  });

  it('points de terre : fichier versionné ≤ 40 Ko, la terre est là où elle est', () => {
    const f = join(__dirname, '..', 'champCercle', 'pointsTerre.ts');
    expect(statSync(f).size).toBeLessThanOrEqual(40 * 1024);
    expect(readFileSync(f, 'utf8')).toContain('ISC');
    const pts = decoderPointsTerre(POINTS_TERRE);
    expect(pts.length).toBeGreaterThan(2000);
    const pres = (lat: number, lon: number) => pts.some(([a, b]) => Math.abs(a / DEG - lat) < 1.7 && Math.abs(b / DEG - lon) < 2.5);
    expect(pres(47.3, 5.0), 'Bourgogne').toBe(true);
    expect(pres(-23.5, -46.6), 'São Paulo').toBe(true);
    expect(pres(30, -40), 'milieu de l\'Atlantique').toBe(false);
    expect(pres(0, -150), 'Pacifique').toBe(false);
  });
});

describe('moteur : image fixe sous mouvement réduit, pause onglet caché', () => {
  function fausseToile(): { canvas: HTMLCanvasElement; dessins: () => number } {
    let n = 0;
    const ctx = new Proxy({}, {
      get: (_c, k) => {
        if (k === 'clearRect') return () => { n++; };
        if (k === 'createRadialGradient') return () => ({ addColorStop() {} });
        return () => {};
      },
      set: () => true,
    });
    const canvas = document.createElement('canvas');
    (canvas as any).getContext = () => ctx;
    return { canvas, dessins: () => n };
  }
  const scene = construireScene({
    moi: { nom: 'B', albums: 10, genres: [], lieu: null }, contacts: [], cercles: [], focus: null, maxAutour: 12, maxGrappes: 6,
  });

  function rafFactice() {
    const file: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { file.push(f); return file.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    let t = 0;
    return {
      enAttente: () => file.length,
      tourner(n: number) { for (let i = 0; i < n && file.length; i++) { t += 40; file.shift()!(t); } },
    };
  }

  it('mouvement réduit : UNE image, et plus aucune image en attente', () => {
    const raf = rafFactice();
    const { canvas, dessins } = fausseToile();
    const m = new ChampCercle(canvas, { budget: budgetScene({ largeur: 1200, lectureLocale: false, mouvementReduit: true }) });
    m.redimensionner(800, 500);
    m.majScene(scene);
    m.vue('seul');
    raf.tourner(10);
    expect(dessins()).toBe(1);
    expect(raf.enAttente()).toBe(0);
    m.vue('reseau');
    raf.tourner(10);
    expect(dessins()).toBe(2);
    expect(raf.enAttente()).toBe(0);
    m.detruire();
  });

  it('animé : la boucle tourne, s\'arrête onglet caché et au démontage', () => {
    const raf = rafFactice();
    const { canvas, dessins } = fausseToile();
    const m = new ChampCercle(canvas, { budget: budgetScene({ largeur: 1200, lectureLocale: false, mouvementReduit: false }) });
    m.redimensionner(800, 500);
    m.majScene(scene);
    raf.tourner(5);
    expect(dessins()).toBeGreaterThanOrEqual(4);
    expect(raf.enAttente()).toBe(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(raf.enAttente()).toBe(1); // l'image déjà demandée a été annulée côté navigateur…
    raf.tourner(1);
    expect(raf.enAttente()).toBe(0); // …et rien ne se ré-arme tant que l'onglet est caché
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(raf.enAttente()).toBe(1);
    m.detruire();
    raf.tourner(3);
    expect(raf.enAttente()).toBe(0);
  });
});
