// @vitest-environment jsdom
//
// renesenses/tune-server-rust#5065, étape 2 — la rubrique « Sources » de la
// barre latérale, et la page d'une source.
//
// 🔴 CE BANC MONTE LA VRAIE BARRE LATÉRALE et fait parler le VRAI bus
// (`tuneWS`) comme le serveur le ferait : `sources.changed` porte la liste
// complète à chaque insertion, éjection ou branchement.
//
// Contrat bouchonné (le serveur est codé en parallèle) :
//   GET  /api/v1/sources               → [{ id, type, greffon, nom, etat, detail }]
//   POST /api/v1/sources/{id}/jouer    { zone_id, piste? }
//   bus  sources.changed               → la liste complète
//
// Contre-épreuves (par copie, documentées dans la PR) : une barre qui
// n'applique pas `sources.changed` rougit les témoins « en direct » ; des
// virtuelles non repliées rougissent le témoin du repli.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SidebarV2 from '../../components/v2/Sidebar.svelte';
import PageSourceV2 from '../../components/v2/PageSourceV2.svelte';
import { tuneWS } from '../websocket';
import { activeView } from '../stores/navigation';
import { currentZoneId, zones } from '../stores/zones';
import { sources, sourceCourante, type Source } from '../sources';
import { cdPlugin } from '../lectureCd';
import { locale } from '../i18n';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

const CD: Source = {
  id: 'cd', type: 'cd', greffon: 'cd', nom: 'Genesis — A Trick of the Tail', etat: 'disque',
  detail: { album: 'A Trick of the Tail', artiste: 'Genesis', pistes: 8, pochette: null },
};
const YETI: Source = {
  id: 'entree:yeti-x', type: 'entree', greffon: 'entree-audio', nom: 'Yeti X', etat: 'signal',
  detail: { frequence: 48000, canaux: 2, niveau_db: -18.2, virtuelle: false },
};
const BLACKHOLE: Source = {
  id: 'entree:blackhole', type: 'virtuelle', greffon: 'entree-audio', nom: 'BlackHole 2ch', etat: 'silence',
  detail: { frequence: 44100, canaux: 2, niveau_db: null, virtuelle: true },
};

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 3000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await respirer();
  }
}

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];
/** Ce que répond `GET /sources` ; `404` = serveur antérieur. */
let listeServeur: Source[] | 404 = [];
let hote: HTMLElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  appels = [];
  listeServeur = [];
  locale.set('fr');
  activeView.set('home');
  sources.set(null);
  sourceCourante.set(null);
  cdPlugin.set(null);
  currentZoneId.set(3);
  zones.set([{ id: 3, name: 'Salon', state: 'stopped' } as any]);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    appels.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (/\/sources$/.test(u)) {
      return listeServeur === 404 ? reponse(404, { error: 'not_found' }) : reponse(200, listeServeur);
    }
    if (/\/sources\/[^/]+\/jouer$/.test(u)) return reponse(200, { ok: true });
    if (/\/zones\/3$/.test(u)) return reponse(200, { id: 3, name: 'Salon', state: 'playing' });
    if (/\/system\/scan\/status/.test(u)) return reponse(200, { scanning: false });
    return reponse(200, []);
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  activeView.set('home');
  sources.set(null);
  sourceCourante.set(null);
  vi.unstubAllGlobals();
});

function monter(Vue: any = SidebarV2) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Vue, { target: hote });
  flushSync();
}
/** Le serveur parle : on passe par les abonnés réels de `tuneWS`. */
function emettre(type: string, data?: unknown) {
  ((tuneWS as any).handlers as ((e: unknown) => void)[]).slice().forEach((h) => h({ type, data }));
  flushSync();
}
const rubrique = () => hote?.querySelector<HTMLElement>('nav.sources-barre') ?? null;
const entrees = () => [...(hote?.querySelectorAll<HTMLButtonElement>('nav.sources-barre button.src') ?? [])];
const entree = (id: string) => hote?.querySelector<HTMLButtonElement>(`nav.sources-barre button.src[data-source="${id}"]`) ?? null;
const appelsSources = () => appels.filter((a) => /\/sources$/.test(a.url));

describe('#5065 — rubrique « Sources » : visible seulement avec au moins une source', () => {
  it('aucune source : la rubrique n’existe pas', async () => {
    listeServeur = [];
    monter();
    await jusqua(() => appelsSources().length > 0 && get(sources) !== null);
    expect(appelsSources().length, 'la barre n’a pas lu /sources').toBeGreaterThan(0);
    expect(rubrique()).toBeNull();
  });

  it('serveur antérieur (404 sur /sources) : rubrique absente, sans erreur ni bandeau', async () => {
    listeServeur = 404;
    monter();
    await jusqua(() => get(sources) !== null);
    expect(get(sources)).toEqual([]);
    expect(rubrique()).toBeNull();
    expect(document.body.textContent ?? '').not.toContain('Server error');
  });

  it('avec des sources : une entrée par source, icône, nom, pastille d’état ; le CD par son album', async () => {
    listeServeur = [CD, YETI];
    monter();
    await jusqua(() => rubrique() !== null);
    expect(rubrique(), 'des sources existent et la rubrique manque').not.toBeNull();
    expect(rubrique()!.querySelector('.grp-label')?.textContent).toBe(fr['v2.sources.title']);
    expect(entrees().map((b) => b.dataset.source)).toEqual(['cd', 'entree:yeti-x']);
    expect(entree('cd')!.querySelector('.src-nom')?.textContent).toBe('A Trick of the Tail');
    expect(entree('entree:yeti-x')!.querySelector('.src-nom')?.textContent).toBe('Yeti X');
    expect(entree('cd')!.querySelector('svg path')?.getAttribute('d')).not.toBe(
      entree('entree:yeti-x')!.querySelector('svg path')?.getAttribute('d'),
    );
    const pastilleCd = entree('cd')!.querySelector('.pastille-src')!;
    expect(pastilleCd.classList.contains('e-disque')).toBe(true);
    expect(pastilleCd.getAttribute('aria-label')).toBe(fr['v2.sources.etat.disque']);
    expect(entree('entree:yeti-x')!.querySelector('.pastille-src')!.getAttribute('aria-label'))
      .toBe(fr['v2.sources.etat.signal']);
  });
});

describe('#5065 — mise à jour en direct par sources.changed', () => {
  it('🔴 CD inséré puis éjecté : la rubrique apparaît puis disparaît', async () => {
    listeServeur = [];
    monter();
    await jusqua(() => get(sources) !== null);
    expect(rubrique()).toBeNull();

    emettre('sources.changed', [CD]);
    expect(rubrique(), 'CD inséré : la rubrique ne l’a pas vu').not.toBeNull();
    expect(entree('cd')!.querySelector('.src-nom')?.textContent).toBe('A Trick of the Tail');

    emettre('sources.changed', []);
    expect(rubrique(), 'CD éjecté (lecteur retiré) : la rubrique reste').toBeNull();
  });

  it('🔴 disque retiré (lecteur toujours là) : la pastille passe à « lecteur vide »', async () => {
    listeServeur = [CD];
    monter();
    await jusqua(() => entree('cd') !== null);
    emettre('sources.changed', [{ ...CD, nom: 'CD', etat: 'vide', detail: {} }]);
    const p = entree('cd')!.querySelector('.pastille-src')!;
    expect(p.classList.contains('e-vide')).toBe(true);
    expect(p.getAttribute('aria-label')).toBe(fr['v2.sources.etat.vide']);
  });

  it('🔴 entrée branchée : elle s’ajoute sans relire la route', async () => {
    listeServeur = [CD];
    monter();
    await jusqua(() => entree('cd') !== null);
    const lectures = appelsSources().length;
    emettre('sources.changed', { sources: [CD, YETI] });
    expect(entree('entree:yeti-x'), 'l’entrée branchée n’est pas apparue').not.toBeNull();
    expect(appelsSources().length).toBe(lectures);
  });

  it('reconnexion du flux : la liste est relue', async () => {
    listeServeur = [];
    monter();
    await jusqua(() => get(sources) !== null);
    listeServeur = [YETI];
    emettre('_connected');
    await jusqua(() => entree('entree:yeti-x') !== null);
    expect(entree('entree:yeti-x')).not.toBeNull();
  });
});

describe('#5065 — entrées virtuelles repliées', () => {
  it('🔴 les virtuelles sont REPLIÉES sous « Entrées virtuelles », et se déplient', async () => {
    listeServeur = [YETI, BLACKHOLE];
    monter();
    await jusqua(() => rubrique() !== null);
    const pli = rubrique()!.querySelector<HTMLButtonElement>('button.pli-virtuelles');
    expect(pli, 'pas de groupe « Entrées virtuelles »').not.toBeNull();
    expect(pli!.textContent).toContain(fr['v2.sources.virtualGroup']);
    expect(pli!.getAttribute('aria-expanded')).toBe('false');
    expect(entree('entree:blackhole'), 'une virtuelle est visible sans dépliage').toBeNull();
    expect(entree('entree:yeti-x')).not.toBeNull();

    pli!.click();
    flushSync();
    expect(pli!.getAttribute('aria-expanded')).toBe('true');
    expect(entree('entree:blackhole')).not.toBeNull();
  });
});

describe('#5065 — ouvrir une source', () => {
  it('le CD mène à l’écran Lecture CD, celui des Extensions', async () => {
    listeServeur = [CD, YETI];
    monter();
    await jusqua(() => entree('cd') !== null);
    entree('cd')!.click();
    flushSync();
    expect(get(activeView)).toBe('lecturecd');
    expect(entree('cd')!.classList.contains('active')).toBe(true);
  });

  it('une entrée mène à sa page', async () => {
    listeServeur = [CD, YETI];
    monter();
    await jusqua(() => entree('entree:yeti-x') !== null);
    entree('entree:yeti-x')!.click();
    flushSync();
    expect(get(activeView)).toBe('source');
    expect(get(sourceCourante)).toBe('entree:yeti-x');
    expect(entree('entree:yeti-x')!.classList.contains('active')).toBe(true);
  });
});

describe('#5065 — page d’une entrée', () => {
  it('nom, type, fréquence, canaux, niveau, état', () => {
    sources.set([YETI]);
    sourceCourante.set(YETI.id);
    monter(PageSourceV2);
    const el = hote!;
    expect(el.querySelector('h1')?.textContent).toBe('Yeti X');
    expect(el.querySelector('dd.type')?.textContent).toBe(fr['v2.sources.type.entree']);
    expect(el.querySelector('dd.frequence')?.textContent).toBe('48 kHz');
    expect(el.querySelector('dd.canaux')?.textContent).toBe('2');
    expect(el.querySelector('dd.etat')?.textContent).toBe(fr['v2.sources.etat.signal']);
    expect(el.querySelector('.db')?.textContent).toBe('-18.2 dB');
    expect((el.querySelector('.rempli') as HTMLElement).style.width).toBe('70%');
    // Le niveau suit le bus, sans relecture.
    sources.set([{ ...YETI, detail: { ...YETI.detail, niveau_db: -6 } }]);
    flushSync();
    expect(el.querySelector('.db')?.textContent).toBe('-6.0 dB');
  });

  it('🔴 « Écouter sur Salon » appelle POST /sources/{id}/jouer, puis relit la zone', async () => {
    sources.set([YETI]);
    sourceCourante.set(YETI.id);
    monter(PageSourceV2);
    const bouton = hote!.querySelector<HTMLButtonElement>('button.ecouter')!;
    expect(bouton.textContent?.trim()).toBe(fr['v2.sources.listenOn'].replace('{zone}', 'Salon'));
    expect(bouton.disabled).toBe(false);
    bouton.click();
    await jusqua(() => appels.some((a) => /\/zones\/3$/.test(a.url)));
    const jouer = appels.filter((a) => a.url.includes('/jouer'));
    expect(jouer).toHaveLength(1);
    expect(jouer[0].method).toBe('POST');
    expect(jouer[0].url).toMatch(/\/api\/v1\/sources\/entree%3Ayeti-x\/jouer$/);
    expect(jouer[0].body).toEqual({ zone_id: 3 });
    expect(appels.some((a) => /\/zones\/3$/.test(a.url)), 'la zone n’a pas été relue').toBe(true);
  });

  it('🔴 autorisation refusée : message lisible, où l’accorder dans macOS, bouton éteint', () => {
    sources.set([{ ...YETI, etat: 'autorisation_refusee', detail: { ...YETI.detail, niveau_db: null } }]);
    sourceCourante.set(YETI.id);
    monter(PageSourceV2);
    const refus = hote!.querySelector('.refus');
    expect(refus, 'le refus n’est pas dit').not.toBeNull();
    expect(refus!.textContent).toContain(fr['v2.sources.permissionDenied']);
    expect(refus!.textContent).toContain('Réglages Système → Confidentialité et sécurité → Microphone');
    expect(hote!.querySelector('dd.autorisation')?.textContent).toBe(fr['v2.sources.permissionRefused']);
    expect(hote!.querySelector<HTMLButtonElement>('button.ecouter')!.disabled).toBe(true);
  });

  it('source débranchée pendant que sa page est ouverte : la page le dit', () => {
    sources.set([YETI]);
    sourceCourante.set(YETI.id);
    monter(PageSourceV2);
    sources.set([]);
    flushSync();
    expect(hote!.querySelector('.disparue')?.textContent).toBe(fr['v2.sources.gone']);
    expect(hote!.querySelector('button.ecouter')).toBeNull();
  });

  it('page d’un CD : l’écran LectureCdV2 réemployé, pas un double', () => {
    sources.set([CD]);
    sourceCourante.set('cd');
    monter(PageSourceV2);
    expect(hote!.querySelector('section.v2-cd'), 'LectureCdV2 n’est pas monté').not.toBeNull();
    expect(hote!.querySelector('section.v2-source')).toBeNull();
  });
});
