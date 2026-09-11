// @vitest-environment jsdom
//
// #2568 — « Radio d'artistes Qobuz », Sandro, fil forum 1579 (27/08/2026) :
//
//   « serait-il possible d'ajouter un bouton pour écouter une sélection de ses
//     meilleurs titres (ou un mix automatique basé sur son catalogue) […] une
//     fonction "Radio Artiste" ou "Best of" dédiée »
//
// et la moitié ARTISTE de #3626 — FabienM, fil 1749 point 5 : « quand je clique
// sur un artiste Qobuz ça me renvoie à la page recherche alors que je devrais
// arriver sur la page de l'artiste Qobuz ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { planDeLecture } from '../lectureEnMasse';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import { currentZoneId } from '../stores/zones';

/** Ce que `top-tracks` rend VRAIMENT : pas de champ `source`. */
const TOP_BRUT = [
  { source_id: 't1', title: 'The Price', artist_name: 'Leprous', album_title: 'Malina', duration_ms: 321000 },
  { source_id: 't2', title: 'Below', artist_name: 'Leprous', album_title: 'Pitfalls', duration_ms: 280000 },
];

describe("#2568 — le piège de la source, tenu par la décision de lecture", () => {
  it("SANS `source`, aucune de ces pistes n'est désignable : le best of partirait VIDE", () => {
    // C'est la contre-épreuve de l'estampille. La charge de `top-tracks` ne
    // porte pas le service — il est dans l'URL. Oublier de le poser ne casse
    // rien de visible : le bouton répond, et rien ne part.
    expect(planDeLecture(TOP_BRUT as any)).toEqual({ voie: 'rien' });
  });

  it('AVEC `source`, le plan part en tête-et-reste — une lecture, puis une file', () => {
    const estampillees = TOP_BRUT.map((p) => ({ ...p, source: 'qobuz' }));
    const plan = planDeLecture(estampillees as any);
    expect(plan.voie).toBe('tete-et-reste');
    if (plan.voie !== 'tete-et-reste') return;
    expect(plan.pistes).toBe(2);
    expect(plan.tete).toMatchObject({ source: 'qobuz', source_id: 't1' });
  });
});

// ---------------------------------------------------------------------------
const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

let urls: string[] = [];
let corpsEnvoyes: any[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  urls = [];
  corpsEnvoyes = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
    urls.push(String(url));
    if (init?.body) { try { corpsEnvoyes.push(JSON.parse(init.body)); } catch { /* pas du JSON */ } }
    let corps: unknown = COLLECTIONS.test(String(url)) ? [] : {};
    if (String(url).includes('/artists/q-42/top-tracks')) corps = TOP_BRUT;
    else if (String(url).includes('/artists/q-42/albums')) corps = [];
    else if (String(url).includes('/streaming/qobuz/artists/q-42')) {
      corps = { id: null, name: 'Leprous', source: 'qobuz', source_id: 'q-42' };
    }
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('home');
  vueDeRetour.set(null);
  ficheArtisteService.set(null);
  currentZoneId.set(1);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe("#2568 — la fiche porte les DEUX gestes que Sandro demande", () => {
  it('« best of » et « radio » sont là, et le best of envoie vraiment la lecture', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ShellV2, { target: hote });
    flushSync();
    ficheArtisteService.set({ service: 'qobuz', id: 'q-42', nom: 'Leprous' });
    activeView.set('streamingartist');
    flushSync();
    await new Promise((r) => setTimeout(r, 80));
    flushSync();

    const boutons = Array.from(hote.querySelectorAll<HTMLButtonElement>('.v2-fas .gestes button'));
    expect(boutons.length, 'deux gestes, pas un — le best of ET le mix').toBe(2);

    corpsEnvoyes = [];
    boutons[0].click();
    await new Promise((r) => setTimeout(r, 80));

    // La tête part avec sa source : c'est tout l'enjeu de l'estampille.
    const lecture = corpsEnvoyes.find((c) => c?.source === 'qobuz' && c?.source_id);
    expect(lecture, `aucune lecture envoyée ; corps vus : ${JSON.stringify(corpsEnvoyes)}`).toBeTruthy();
  });
});

describe('#3626 — le lien artiste de « Lecture en cours » ne mène plus à une recherche', () => {
  it('NowPlaying ne détourne QUE si la coquille sait recevoir le geste', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const np = readFileSync(resolve(process.cwd(), 'src/components/NowPlaying.svelte'), 'utf-8');
    expect(np).toContain("if (onOuvrirArtisteService && dest.source && dest.source !== 'local') {");
    // Le repli demeure juste après : sans rappel, la recherche d'avant.
    expect(np).toContain('ouvrirRecherche(dest.requete, dest.source);');
    const shell = readFileSync(resolve(process.cwd(), 'src/components/v2/ShellV2.svelte'), 'utf-8');
    expect(shell).toContain('onOuvrirArtisteService={ouvrirArtisteServiceParNom}');
    // Et la résolution retombe sur la recherche quand le service ignore le nom.
    expect(shell).toContain('setSearchCriteria({ q: c.nom, source: c.service });');
  });
});
