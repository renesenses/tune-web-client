// @vitest-environment jsdom
//
// renesenses/tune-server-rust#5065, étape 3 — sources GRISÉES et une case
// « Afficher dans la barre » par type (Bertrand, 27/09/2026).
//
// Rouge sur main : la barre montrait toute la liste et masquait la rubrique
// sans source ; aucune préférence de types, aucun grisé. Contre-épreuves par
// mutation, documentées dans la PR : `sourceGrisee` qui rend toujours faux
// rougit les témoins du grisé ; `sourcesDeLaBarre` qui ne filtre plus rougit
// celui du type décoché ; `typesParDefaut` qui compte les `indisponible`
// rougit celui des cases par défaut.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SidebarV2 from '../../components/v2/Sidebar.svelte';
import PageSourceV2 from '../../components/v2/PageSourceV2.svelte';
import { tuneWS } from '../websocket';
import { activeView } from '../stores/navigation';
import { currentZoneId, zones } from '../stores/zones';
import { sources, sourceCourante, typesSourcesBarre, type Source } from '../sources';
import { typesParDefaut } from '../typesSourcesBarre';
import { cdPlugin } from '../lectureCd';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
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
  // Étape 3 : les types de la barre suivent la présence tant que rien n'est
  // décidé — chaque témoin repart indécis.
  preferences.update((p) => ({ ...p, sourcesBarre: null }));
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


const CD_ABSENT: Source = {
  id: 'cd', type: 'cd', greffon: 'cd', nom: 'Lecteur CD', etat: 'indisponible',
  detail: { raison: 'aucun_lecteur' },
};
const YETI_LIBRE: Source = { ...YETI, etat: 'disponible', detail: { ...YETI.detail, niveau_db: null, autorisation: 'accordee' } };
const HDMI_REFUSEE: Source = {
  id: 'entree:usb3-hdmi-capture', type: 'hdmi', greffon: 'entree-audio', nom: 'USB3 HDMI Capture',
  etat: 'autorisation_refusee', detail: {},
};

describe('#5065 étape 3 — les cases par défaut', () => {
  it('🔴 cochées pour les seuls types présents et non indisponibles', () => {
    expect(typesParDefaut([CD_ABSENT, YETI_LIBRE, BLACKHOLE, HDMI_REFUSEE])).toEqual({
      cd: false, entree: true, virtuelle: true, hdmi: true,
    });
    // Une entrée que le système dit virtuelle compte comme virtuelle.
    expect(typesParDefaut([{ ...YETI, detail: { virtuelle: true } }])).toEqual({
      cd: false, entree: false, virtuelle: true, hdmi: false,
    });
    expect(typesParDefaut([])).toEqual({ cd: false, entree: false, virtuelle: false, hdmi: false });
  });

  it('🔴 les cases des Réglages suivent ce défaut tant que rien n’est décidé', () => {
    preferences.update((p) => ({ ...p, sourcesBarre: null }));
    sources.set([CD_ABSENT, YETI_LIBRE]);
    expect(get(typesSourcesBarre)).toEqual({ cd: false, entree: true, virtuelle: false, hdmi: false });
    // Un choix fait type par type l’emporte, les autres suivent la présence.
    preferences.update((p) => ({ ...p, sourcesBarre: { cd: true, entree: false } }));
    expect(get(typesSourcesBarre)).toEqual({ cd: true, entree: false, virtuelle: false, hdmi: false });
  });

  it('🔴 un type vu présent est figé coché dans les préférences', async () => {
    listeServeur = [CD_ABSENT, YETI_LIBRE];
    monter();
    await jusqua(() => entree('entree:yeti-x') !== null);
    expect(entree('cd'), 'CD sans lecteur et non coché : absent').toBeNull();
    expect(get(preferences).sourcesBarre).toEqual({ entree: true });
    // Débranchée ensuite : le type reste coché, sa place grisée.
    emettre('sources.changed', [CD_ABSENT]);
    expect(entree('absente:entree')?.classList.contains('grisee')).toBe(true);
  });
});

describe('#5065 étape 3 — barre latérale : grisé et types décochés', () => {
  it('🔴 une source indisponible est grisée, garde son nom, et ouvre sa page', async () => {
    preferences.update((p) => ({ ...p, sourcesBarre: { cd: true, entree: true, virtuelle: true, hdmi: true } }));
    listeServeur = [CD_ABSENT, YETI_LIBRE, HDMI_REFUSEE];
    monter();
    await jusqua(() => entree('cd') !== null);
    const cd = entree('cd')!;
    expect(cd.classList.contains('grisee'), 'le CD sans lecteur doit être grisé').toBe(true);
    expect(cd.querySelector('.src-nom')?.textContent).toBe('Lecteur CD');
    expect(entree('entree:usb3-hdmi-capture')!.classList.contains('grisee'), 'autorisation refusée : grisée').toBe(true);
    expect(entree('entree:yeti-x')!.classList.contains('grisee'), 'une entrée disponible n’est pas grisée').toBe(false);
    cd.click();
    flushSync();
    expect(get(activeView), 'un CD grisé ouvre la page qui explique, pas Lecture CD').toBe('source');
    expect(get(sourceCourante)).toBe('cd');
  });

  it('🔴 un type coché sans aucune source a sa place, grisée', async () => {
    preferences.update((p) => ({ ...p, sourcesBarre: { cd: false, entree: true, virtuelle: false, hdmi: true } }));
    listeServeur = [YETI_LIBRE];
    monter();
    await jusqua(() => entree('entree:yeti-x') !== null);
    const hdmi = entree('absente:hdmi');
    expect(hdmi, 'HDMI coché : il doit figurer').not.toBeNull();
    expect(hdmi!.classList.contains('grisee')).toBe(true);
    expect(hdmi!.querySelector('.src-nom')?.textContent).toBe(fr['v2.sources.type.hdmi']);
  });

  it('🔴 un type décoché est masqué', async () => {
    preferences.update((p) => ({ ...p, sourcesBarre: { cd: true, entree: true, virtuelle: false, hdmi: false } }));
    listeServeur = [CD_ABSENT, YETI_LIBRE, BLACKHOLE];
    monter();
    await jusqua(() => entree('entree:yeti-x') !== null);
    expect(entrees().map((b) => b.dataset.source)).toEqual(['cd', 'entree:yeti-x']);
    expect(hote!.querySelector('.pli-virtuelles'), 'virtuelles décochées : pas de repli').toBeNull();
  });

  it('🔴 aucun type coché : la rubrique disparaît', async () => {
    preferences.update((p) => ({ ...p, sourcesBarre: { cd: false, entree: false, virtuelle: false, hdmi: false } }));
    listeServeur = [CD_ABSENT, YETI_LIBRE, BLACKHOLE];
    monter();
    await jusqua(() => get(sources) !== null);
    await respirer();
    flushSync();
    expect(rubrique()).toBeNull();
  });

  it('serveur antérieur (404) : rien ne change, même avec des types cochés', async () => {
    preferences.update((p) => ({ ...p, sourcesBarre: { cd: true, entree: true, virtuelle: true, hdmi: true } }));
    listeServeur = 404;
    monter();
    await jusqua(() => get(sources) !== null);
    expect(rubrique()).toBeNull();
  });
});

describe('#5065 étape 3 — la page d’une source grisée dit pourquoi', () => {
  it('🔴 CD sans lecteur : « aucun lecteur », pas l’écran Lecture CD, bouton éteint', () => {
    preferences.update((p) => ({ ...p, sourcesBarre: { cd: true } }));
    sources.set([CD_ABSENT]);
    sourceCourante.set('cd');
    monter(PageSourceV2);
    expect(hote!.textContent).toContain(fr['v2.sources.noDrive']);
    expect(hote!.querySelector<HTMLButtonElement>('button.ecouter')!.disabled).toBe(true);
  });

  it('🔴 type coché sans source : la page le dit', () => {
    preferences.update((p) => ({ ...p, sourcesBarre: { hdmi: true } }));
    sources.set([]);
    sourceCourante.set('absente:hdmi');
    monter(PageSourceV2);
    expect(hote!.textContent).toContain(fr['v2.sources.absent']);
    expect(hote!.querySelector('h1')?.textContent).toBe(fr['v2.sources.type.hdmi']);
  });

  it('macOS n’a jamais été interrogé : l’entrée s’écoute, et la page prévient', () => {
    sources.set([{ ...BLACKHOLE, etat: 'disponible', detail: { ...BLACKHOLE.detail, autorisation: 'non_demandee' } }]);
    sourceCourante.set(BLACKHOLE.id);
    monter(PageSourceV2);
    expect(hote!.textContent).toContain(fr['v2.sources.permissionAsk']);
    expect(hote!.querySelector<HTMLButtonElement>('button.ecouter')!.disabled).toBe(false);
  });
});
