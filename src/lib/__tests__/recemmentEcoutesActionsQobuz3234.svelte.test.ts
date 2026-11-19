// @vitest-environment jsdom
//
// web#3234 (FabienM, fil 2864, point 15, rc12) — Accueil › « Récemment
// écoutés » : au survol, une vignette QOBUZ n'avait ni cœur, ni « … », ni
// étiquette, là où une vignette LOCALE les a.
//
// Cause : la ligne d'historique d'un service désigne la PISTE (`source_id`),
// et `ficheDe` refusait à juste titre d'en faire un album (05/09/2026). Mais
// le serveur sert l'album du service sous `album_id_service` depuis
// tune-server-rust#7778 (rc11), et `context_id` le porte quand l'écoute était
// celle d'un album : la vignette n'en lisait aucun, donc pas de fiche, donc
// aucun des trois gestes.
//
// Le témoin MONTE `PageWidgets` : ce sont les boutons de la vignette qui
// manquaient, pas une valeur de la fabrique.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { widgetParId } from '../accueilWidgets';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

/** Une écoute locale : `album_id` entier, comme le rend `/library/history`. */
const LOCALE = {
  id: 700, track_id: 55, title: "A Hero's Death", artist_name: 'Fontaines D.C.',
  album_title: "A Hero's Death", album_id: 12, source: 'local', source_id: null,
  context_type: 'album', context_id: '12',
};
/** Une écoute Qobuz d'une piste, avec l'album servi par rc11+. */
const QOBUZ = {
  id: 701, track_id: null, title: 'Boys in the Better Land', artist_name: 'Fontaines D.C.',
  album_title: 'Dogrel', album_id: null, source: 'qobuz', source_id: '64870512',
  context_type: 'track', context_id: null, album_id_service: '0886447540346',
  cover_url: 'https://static.qobuz.example/dogrel.jpg',
};

let lignes: any[] = [];
let envois: { url: string; corps: string }[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poserLeServeur() {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  envois = [];
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const u = new URL(String(input), 'http://localhost');
    if ((init?.method ?? 'GET') !== 'GET') envois.push({ url: u.pathname, corps: String(init?.body ?? '') });
    let corps: unknown = [];
    if (u.pathname === '/api/v1/library/history') corps = { items: lignes, total: lignes.length };
    else if (u.pathname.includes('/favorites')) corps = [];
    else if (u.pathname.includes('/tags')) corps = [];
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
}

async function cartes() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue: [widgetParId('recemment-ecoutes')!], dispositionDefaut: ['recemment-ecoutes'], cle: 'accueil_3234_test' },
  });
  await vi.waitFor(() => {
    flushSync();
    expect(hote!.querySelectorAll('.carte').length).toBe(lignes.length);
  });
  return [...hote.querySelectorAll('.carte')] as HTMLElement[];
}

const gestes = (c: HTMLElement) => ({
  coeur: !!c.querySelector('.pa > button.coin.tl'),
  menu: !!c.querySelector('.pa > button.coin.bl'),
  etiquette: !!c.querySelector('.pa > button.coin.br'),
  ouvrir: !!c.querySelector('.pa > button.ouvrir'),
});

describe('« Récemment écoutés » — les gestes d’une vignette de service', () => {
  beforeEach(() => {
    locale.set('fr');
    poserLeServeur();
    currentProfileId.set(1);
    currentZoneId.set(1);
    activeView.set('home' as any);
  });
  afterEach(() => {
    if (monte) { unmount(monte); monte = null; }
    hote?.remove(); hote = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('épreuve : la vignette Qobuz porte cœur, « … » et étiquette, comme la locale', async () => {
    lignes = [LOCALE, QOBUZ];
    const [loc, qob] = await cartes();
    expect(gestes(loc)).toEqual({ coeur: true, menu: true, etiquette: true, ouvrir: true });
    expect(gestes(qob)).toEqual({ coeur: true, menu: true, etiquette: true, ouvrir: true });
    // Le cœur met en favori l'ALBUM du service, sous son titre d'album.
    (qob.querySelector('.pa > button.coin.tl') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(envois.some((e) => /favorites/.test(e.url))).toBe(true));
    const fav = envois.find((e) => /favorites/.test(e.url))!;
    expect(fav.corps).toContain('0886447540346');
    expect(fav.corps).toContain('Dogrel');
    expect(fav.corps).not.toContain('Boys in the Better Land');
  });

  it('épreuve : un ALBUM écouté sur Qobuz (context_id) a les mêmes gestes', async () => {
    lignes = [{ ...QOBUZ, album_id_service: undefined, context_type: 'album', context_id: '0886447540346' }];
    const [qob] = await cartes();
    expect(gestes(qob)).toEqual({ coeur: true, menu: true, etiquette: true, ouvrir: true });
  });

  it('contre-épreuve : une piste Qobuz SANS album connu reste sans fiche (on ne devine pas)', async () => {
    lignes = [{ ...QOBUZ, album_id_service: null }];
    const [qob] = await cartes();
    const g = gestes(qob);
    expect(g.ouvrir).toBe(false);
    expect(g.etiquette).toBe(false);
    // La lecture, elle, reste : elle passe la paire service + piste.
    expect(qob.querySelector('.pa > button.centre')).not.toBeNull();
  });
});
