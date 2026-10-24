// @vitest-environment jsdom
//
// Tune Circle — poser sa ville sans connaître ses coordonnées (retour de
// Bertrand du 24/10/2026 : « Dijon » tapé, refus « une position sur le
// globe », aucun PUT parti). Index de villes EMBARQUÉ (GeoNames, CC BY 4.0),
// chargé à l'ouverture du réglage seulement ; recherche hors ligne ;
// coordonnées repliées sous « Avancé » et lisibles avec une virgule ; lieu
// déjà posé relu au rechargement, et jamais effacé sans geste.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin } from '../circle';
import { lireCoordonnee } from '../circleMonde';
import { chargerVilles, chercherVilles, lireIndex, normaliser, villeExacte } from '../champCercle/villes';
import fr from '../locales/fr';

// Compte les chargements RÉELS de l'index (le module de données lui-même).
const suivi = vi.hoisted(() => ({ chargements: 0 }));
vi.mock('../champCercle/villesDonnees', async (importOriginal) => {
  suivi.chargements++;
  return await importOriginal();
});

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];
let lieu: null | Record<string, unknown> = null;

function reponse(status: number, corps?: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}

function cloud(chemin: string, method: string, body: any): Response {
  if (method === 'GET' && chemin === '') {
    return reponse(200, { members: [{ user_id: 12, name: 'Alice', since: '2026-09-01T10:00:00Z' }], sent: [], received: [], circles: [] });
  }
  if (chemin === '/library-sync') return reponse(200, { last_sync: null });
  if (chemin === '/shared-with-me') return reponse(200, []);
  if (chemin === '/me/location') {
    if (method === 'GET') return lieu ? reponse(200, lieu) : reponse(204);
    if (method === 'PUT') { lieu = { ...body, lat: Math.round(body.lat * 2) / 2, lon: Math.round(body.lon * 2) / 2 }; return reponse(200, lieu); }
    if (method === 'DELETE') { lieu = null; return reponse(204); }
  }
  if (chemin === '/contacts/locations') return reponse(200, []);
  return reponse(404, { error: 'not_found' });
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  lieu = null;
  circlePlugin.set(null);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    appels.push({ url: u, method, body });
    if (u.includes('/ext/circle')) return cloud(u.replace(/^.*\/api\/v1\/ext\/circle/, '').replace(/\?.*$/, ''), method, body);
    if (u.endsWith('/plugins')) return reponse(200, [{ name: 'circle', installed: true, enabled: true }]);
    return reponse(200, {});
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
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
  for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); }
}
async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CircleV2 as any, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
async function saisir(el: Element, sel: string, v: string) {
  const c = el.querySelector(sel) as HTMLInputElement;
  c.value = v;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  await laisserFaire();
}
async function ouvrirReglage(el: Element) {
  (el.querySelector('.interrupteur-lieu') as HTMLButtonElement).click();
  await laisserFaire();
  // L'import dynamique se résout hors de l'horloge factice : on l'attend vraiment.
  vi.useRealTimers();
  await chargerVilles();
  vi.useFakeTimers();
  await laisserFaire();
}
const puts = () => appels.filter((a) => a.method === 'PUT');

describe('Tune Circle — index des villes : chargé à la demande, pas avant', () => {
  // ⚠️ PREMIER test du fichier : l'index se garde en mémoire une fois chargé.
  it('écran ouvert, réglage fermé : l\'index n\'est PAS chargé ; il l\'est à l\'ouverture du réglage', async () => {
    const el = await poser();
    expect(el.querySelector('.interrupteur-lieu')).not.toBeNull();
    expect(suivi.chargements).toBe(0);
    await ouvrirReglage(el);
    expect(suivi.chargements).toBe(1);
  });
});

describe('Tune Circle — poser sa ville par son nom', () => {
  it('« Dijon » propose « Dijon, FR » ; le choix envoie libellé, pays et position ARRONDIE au demi-degré', async () => {
    const el = await poser();
    await ouvrirReglage(el);
    const champ = el.querySelector('.sc-libelle') as HTMLInputElement;
    expect(champ.getAttribute('role')).toBe('combobox');
    await saisir(el, '.sc-libelle', 'Dijon');
    const options = [...el.querySelectorAll('.sc-ville-option')];
    expect(options.length).toBeGreaterThan(0);
    expect(texte(options[0].querySelector('.sc-ville-nom'))).toBe('Dijon, FR');
    expect(champ.getAttribute('aria-expanded')).toBe('true');
    (options[0] as HTMLElement).click();
    await laisserFaire();
    expect((el.querySelector('.sc-pays') as HTMLInputElement).value).toBe('FR');
    expect(el.querySelector('.sc-ville-option')).toBeNull();
    (el.querySelector('.sc-enregistrer-lieu') as HTMLButtonElement).click();
    await laisserFaire();
    expect(puts(), texte(el.querySelector('.sc-retour-lieu'))).toHaveLength(1);
    expect(puts()[0].url).toMatch(/\/ext\/circle\/me\/location$/);
    // Dijon : 47.32 N, 5.04 E → 47.5 / 5 ; jamais la position exacte.
    expect(puts()[0].body).toEqual({ label: 'Dijon', country_code: 'FR', lat: 47.5, lon: 5 });
    expect((el.querySelector('.interrupteur-lieu') as HTMLElement).getAttribute('aria-checked')).toBe('true');
  });

  it('« Dijon » tapé puis « Montrer ma ville » SANS choisir dans la liste : la ville de ce nom part quand même', async () => {
    const el = await poser();
    await ouvrirReglage(el);
    await saisir(el, '.sc-libelle', 'dijon');
    (el.querySelector('.sc-enregistrer-lieu') as HTMLButtonElement).click();
    await laisserFaire();
    expect(puts(), texte(el.querySelector('.sc-retour-lieu'))).toHaveLength(1);
    expect(puts()[0].body).toEqual({ label: 'Dijon', country_code: 'FR', lat: 47.5, lon: 5 });
  });

  it('les coordonnées sont repliées sous « Avancé » par défaut', async () => {
    const el = await poser();
    await ouvrirReglage(el);
    const avance = el.querySelector('details.sc-avance') as HTMLDetailsElement;
    expect(avance).not.toBeNull();
    expect(avance.open).toBe(false);
    expect(texte(avance.querySelector('summary'))).toBe(fr['v2.circle.scene.loc.advanced']);
    expect(avance.querySelector('.sc-lat')).not.toBeNull();
    expect(avance.querySelector('.sc-lon')).not.toBeNull();
    // Le libellé et le pays restent dehors, visibles.
    expect(avance.querySelector('.sc-libelle')).toBeNull();
  });

  it('coordonnées à la VIRGULE (« 47,32 ») : acceptées, arrondies, envoyées', async () => {
    const el = await poser();
    await ouvrirReglage(el);
    await saisir(el, '.sc-libelle', 'Chez moi');
    await saisir(el, '.sc-lat', '47,32');
    await saisir(el, '.sc-lon', '5,04');
    (el.querySelector('.sc-enregistrer-lieu') as HTMLButtonElement).click();
    await laisserFaire();
    expect(puts(), texte(el.querySelector('.sc-retour-lieu'))).toHaveLength(1);
    expect(puts()[0].body).toEqual({ label: 'Chez moi', lat: 47.5, lon: 5 });
  });

  it('retaper le nom d\'une ville choisie efface sa position (pas de « Lyon » posé à Dijon)', async () => {
    const el = await poser();
    await ouvrirReglage(el);
    await saisir(el, '.sc-libelle', 'Dijon');
    (el.querySelector('.sc-ville-option') as HTMLElement).click();
    await laisserFaire();
    await saisir(el, '.sc-libelle', 'Zzyzxqwv');
    expect((el.querySelector('.sc-lat') as HTMLInputElement).value).toBe('');
    expect(texte(el.querySelector('.sc-aucune-ville'))).toBe(fr['v2.circle.scene.loc.noMatch']);
    (el.querySelector('.sc-enregistrer-lieu') as HTMLButtonElement).click();
    await laisserFaire();
    expect(puts()).toHaveLength(0);
    expect(texte(el.querySelector('.sc-retour-lieu'))).toBe(fr['v2.circle.scene.loc.invalid']);
  });

  it('aucune géolocalisation du navigateur, aucun appel réseau pour chercher', async () => {
    const geo = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: geo, watchPosition: geo } });
    const el = await poser();
    await ouvrirReglage(el);
    const avant = appels.length;
    await saisir(el, '.sc-libelle', 'Saint-Ét');
    expect(el.querySelectorAll('.sc-ville-option').length).toBeGreaterThan(0);
    expect(appels.length).toBe(avant);
    expect(geo).not.toHaveBeenCalled();
  });
});

describe('Tune Circle — un lieu déjà posé', () => {
  it('rechargement avec GET 200 : interrupteur ALLUMÉ, lieu affiché, épingle sur le globe, et RIEN n\'est écrit', async () => {
    lieu = { label: 'Dijon', country_code: 'FR', lat: 47.5, lon: 5.0 };
    const el = await poser();
    const inter = el.querySelector('.interrupteur-lieu') as HTMLButtonElement;
    expect(inter.getAttribute('aria-checked')).toBe('true');
    expect(texte(el.querySelector('.sc-lieu-actuel'))).toContain('Dijon');
    // Le globe montre mon épingle (vue liste sous jsdom), et dit qui n'a pas posé sa ville.
    (el.querySelector('.vue-monde') as HTMLButtonElement).click();
    await laisserFaire();
    expect([...el.querySelectorAll('.sc-ligne-nom')].map(texte).join(' ')).toContain('Dijon');
    expect(texte(el.querySelector('.sc-sans-ville'))).toBe(fr['v2.circle.scene.world.unplacedOne']);
    await laisserFaire();
    expect(appels.filter((a) => /\/me\/location/.test(a.url) && a.method !== 'GET')).toHaveLength(0);
  });

  it('« Modifier » rouvre le réglage sur le lieu actuel, sans rien effacer', async () => {
    lieu = { label: 'Dijon', country_code: 'FR', lat: 47.5, lon: 5.0 };
    const el = await poser();
    (el.querySelector('.sc-changer-lieu') as HTMLButtonElement).click();
    await laisserFaire();
    expect((el.querySelector('.sc-libelle') as HTMLInputElement).value).toBe('Dijon');
    expect((el.querySelector('.sc-lat') as HTMLInputElement).value).toBe('47.5');
    expect(appels.filter((a) => a.method === 'DELETE')).toHaveLength(0);
    expect((el.querySelector('.interrupteur-lieu') as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
  });
});

describe('Tune Circle — la scène montre mes contacts', () => {
  it('contacts sans partage ni lieu : la première vue est Réseau, et chacun y est', async () => {
    const el = await poser();
    expect(el.querySelector('.vue-reseau')?.getAttribute('aria-pressed')).toBe('true');
    expect([...el.querySelectorAll('.sc-ligne-nom')].map(texte)).toContain('Alice');
  });
});

describe('Tune Circle — mise en page du réglage', () => {
  it('le réglage du lieu est juste SOUS la scène (avant le slogan) : globe et formulaire se voient ensemble', async () => {
    const el = await poser();
    const lieuBloc = el.querySelector('.sc-lieu')!;
    const bas = el.querySelector('.sc-bas')!;
    expect(lieuBloc.compareDocumentPosition(bas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('le texte d\'aide de la pose n\'est écrit qu\'UNE fois (plus dans la scène ET sous le réglage)', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'components', 'v2', 'SceneCercleV2.svelte'), 'utf8');
    expect(src.split("'v2.circle.scene.loc.pick'").length - 1).toBe(1);
  });

  it('l\'attribution GeoNames est affichée dans le réglage', async () => {
    const el = await poser();
    await ouvrirReglage(el);
    expect(texte(el.querySelector('.sc-source-villes'))).toContain('GeoNames');
  });
});

describe('Tune Circle — index des villes (données réelles)', () => {
  it('Dijon → FR, 47.3 N 5.0 E ; « dijon, fr » et les accents tolérés', async () => {
    const villes = await chargerVilles();
    expect(villes.length).toBeGreaterThan(20000);
    const d = chercherVilles(villes, 'Dijon')[0];
    expect(d).toMatchObject({ nom: 'Dijon', pays: 'FR' });
    expect(d.lat).toBeCloseTo(47.3, 0);
    expect(d.lon).toBeCloseTo(5.0, 0);
    expect(villeExacte(villes, 'dijon, fr')?.nom).toBe('Dijon');
    expect(chercherVilles(villes, 'saint etienne').some((v) => v.pays === 'FR' && /tienne/.test(v.nom))).toBe(true);
    expect(chercherVilles(villes, 'Paris')[0]).toMatchObject({ nom: 'Paris', pays: 'FR' });
    expect(chercherVilles(villes, 'p')).toEqual([]);
  });

  it('lecture du format compact, normalisation', () => {
    expect(lireIndex('Zürich|Zurich|CH|474|85|341\n')).toEqual([{ nom: 'Zürich', pays: 'CH', lat: 47.4, lon: 8.5, pop: 341, cles: ['zurich'] }]);
    expect(normaliser("  Saint-Étienne ")).toBe('saint etienne');
  });

  it('coordonnée tapée : virgule ou point, vide = rien', () => {
    expect(lireCoordonnee('47,32')).toBe(47.32);
    expect(lireCoordonnee(' -4.5 ')).toBe(-4.5);
    expect(lireCoordonnee('')).toBeNull();
    expect(lireCoordonnee(' ')).toBeNull();
    expect(lireCoordonnee('abc')).toBeNull();
    expect(lireCoordonnee('47°')).toBe(47);
  });

  it('fichier < 400 Ko gzip, attribution CC BY, et jamais importé statiquement (morceau à part)', () => {
    const racine = join(__dirname, '..', '..');
    const donnees = readFileSync(join(racine, 'lib', 'champCercle', 'villesDonnees.ts'));
    expect(gzipSync(donnees, { level: 9 }).length).toBeLessThan(400 * 1024);
    expect(donnees.toString('utf8')).toContain('Creative Commons Attribution 4.0');
    const statiques: string[] = [];
    const parcourir = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const f = join(dir, n);
        if (statSync(f).isDirectory()) { if (n !== '__tests__') parcourir(f); continue; }
        if (!/\.(ts|svelte)$/.test(n) || n === 'villesDonnees.ts') continue;
        if (/^\s*import\s[^;]*['"][^'"]*villesDonnees['"]/m.test(readFileSync(f, 'utf8'))) statiques.push(f);
      }
    };
    parcourir(racine);
    expect(statiques).toEqual([]);
  });
});
