// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { fr } from './onzeDictionnaires';
import MediaServersV2 from '../../components/v2/MediaServersV2.svelte';

/**
 * Serveurs multimédia : la navigation « bloquée » au dossier Freebox
 * (renesenses/tune-server-rust#4895, fil 1909, ticket 160).
 *
 * ## Le défaut, côté client
 *
 * Trois silences s'additionnaient à celui du serveur :
 *
 *  1. Un clic sur un sous-dossier ne montrait AUCUN chargement dès que le
 *     dossier affiché était rempli : la condition était
 *     `busy && !vue.containers.length && !vue.items.length`. Sur un Browse
 *     lent, l'écran restait figé sur le dossier précédent — « bloqué ».
 *  2. Un refus du serveur (502 `media_server_browse_failed`, #4914) finissait
 *     sur « Ce dossier n'a pas répondu », sans le motif que le serveur avait
 *     écrit. Pour la recherche (502 `media_server_search_failed`, #4943), rien
 *     du tout : le `catch` basculait en filtrage local et annonçait que le
 *     serveur « ne sait pas chercher » — l'inverse de la vérité.
 *  3. Une liste coupée en cours de pagination (`complet: false`) s'affichait
 *     comme une liste entière.
 *
 * Un serveur antérieur à #4914 ne rend pas `complet` : il ne doit rien voir
 * changer.
 *
 * ## Pourquoi on MONTE l'écran
 *
 * Le défaut est un affichage conditionnel ; seule une lecture du DOM rendu le
 * garde. Même patron que `sortieMonoZone.test.ts` : `mount` de Svelte 5 dans
 * jsdom, `fetch` remplacé, le module `api` RÉEL — c'est lui qui transforme la
 * réponse 502 en erreur, et c'est son motif qu'on veut voir à l'écran.
 */
const DELAI_MONTAGE = 60_000;

const FREEBOX = {
  id: 'uuid:freebox', name: 'Freebox Server', host: '192.168.1.254', port: 8200,
  manufacturer: 'Freebox SAS', model: 'Freebox Server',
};

const RACINE = {
  object_id: '0',
  containers: [
    { id: 'musique', title: 'Musique', child_count: 3 },
    { id: 'videos', title: 'Vidéos', child_count: 2 },
  ],
  items: [],
  total_matches: 2,
  number_returned: 2,
};

type Repondeur = (url: string) => Response | Promise<Response>;

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

let browse: Repondeur;
let search: Repondeur;

beforeEach(() => {
  browse = () => json(RACINE);
  search = () => json({ container: '0', query: '', supported: true, reason: '', containers: [], items: [], total_matches: 0, number_returned: 0 });
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL) => {
    const url = String(entree);
    if (/\/network\/media-servers\/[^/]+\/browse/.test(url)) return browse(url);
    if (/\/network\/media-servers\/[^/]+\/search/.test(url)) return search(url);
    if (/\/network\/media-servers(\?|$)/.test(url)) return json([FREEBOX]);
    // `{ items: [] }` : la forme des listes (sources UPnP abonnées) ; un objet
    // sans `items` faisait tomber `UpnpLibrarySourcesV2` au montage.
    return json({ items: [] });
  }));
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

let cible: HTMLElement;
let monte: Record<string, any> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible.remove();
  vi.unstubAllGlobals();
});

async function ouvrir(): Promise<HTMLElement> {
  monte = mount(MediaServersV2, { target: cible, props: {} });
  flushSync();
  await vi.waitFor(() => {
    if (!cible.querySelector('.folders .folder')) throw new Error('racine pas encore affichée');
  });
  return cible;
}

function dossier(racine: HTMLElement, titre: string): HTMLButtonElement {
  const b = [...racine.querySelectorAll<HTMLButtonElement>('.folders .folder')]
    .find((x) => x.textContent?.includes(titre));
  if (!b) throw new Error(`aucun dossier « ${titre} » à l'écran`);
  return b;
}

const texte = (r: HTMLElement) => r.textContent ?? '';

describe('#4895 — le navigateur de serveur multimédia dit ce qu’il fait', () => {
  it('un chargement est VISIBLE même quand le dossier affiché est rempli', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await ouvrir();
    let livrer!: (r: Response) => void;
    browse = () => new Promise<Response>((ok) => { livrer = ok; });

    dossier(racine, 'Musique').click();
    flushSync();
    await vi.waitFor(() => { if (!livrer) throw new Error('Browse pas encore parti'); });
    flushSync();

    // Le dossier précédent est toujours là…
    expect(racine.querySelectorAll('.folders .folder').length).toBe(2);
    // … et l'écran dit qu'il charge le suivant.
    const statut = racine.querySelector('[role="status"]');
    expect(statut, 'aucun indicateur de chargement sur un dossier déjà rempli').not.toBeNull();
    expect(statut!.textContent).toContain(fr['v2.tool.loading']);

    livrer(json({ object_id: 'musique', containers: [], items: [], total_matches: 0, number_returned: 0 }));
    await vi.waitFor(() => {
      if (racine.querySelector('[role="status"]')) throw new Error('le chargement ne disparaît pas');
    });
  });

  it('un 502 du Browse affiche le bandeau AVEC le motif du serveur', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await ouvrir();
    const motif = 'Freebox Server a rendu une page vide au Browse après 0 des 12 éléments annoncés';
    browse = () => json({ code: 'media_server_browse_failed', error: motif }, 502);

    dossier(racine, 'Musique').click();
    await vi.waitFor(() => { if (!racine.querySelector('.err')) throw new Error('aucun bandeau'); });
    const bandeau = racine.querySelector('.err')!.textContent ?? '';
    expect(bandeau).toContain(fr['v2.ms.folderNoAnswer']);
    expect(bandeau, 'le motif écrit par le serveur est perdu').toContain(motif);
  });

  it('un 502 de la recherche affiche le bandeau avec le motif, sans prétendre que le serveur ne sait pas chercher', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await ouvrir();
    const motif = 'Freebox Server a rendu une page vide au Search après 0 des 12 éléments annoncés';
    search = () => json({ code: 'media_server_search_failed', error: motif }, 502);

    const champ = racine.querySelector<HTMLInputElement>('.v2-rech input')!;
    champ.value = 'miles';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    await vi.waitFor(() => { if (!racine.querySelector('.err')) throw new Error('aucun bandeau'); }, { timeout: 3000 });
    const bandeau = racine.querySelector('.err')!.textContent ?? '';
    expect(bandeau).toContain(fr['v2.ms.searchFailed']);
    expect(bandeau).toContain(motif);
    expect(racine.querySelector('.warn'), "la recherche a échoué : ce n'est pas un serveur sans index").toBeNull();
  });

  it('une liste coupée (`complet: false`) dit « N sur M » et la raison', { timeout: DELAI_MONTAGE }, async () => {
    const raison = 'pagination interrompue (8/13)';
    browse = () => json({ ...RACINE, total_matches: 13, number_returned: 2, complet: false, incomplet: raison });
    const racine = await ouvrir();

    const attendu = fr['v2.ms.listIncomplete'].replace('{n}', '2').replace('{total}', '13');
    await vi.waitFor(() => { if (!texte(racine).includes(attendu)) throw new Error(`« ${attendu} » absent`); });
    expect(texte(racine)).toContain(raison);
  });

  it('un serveur ancien, sans `complet`, n’affiche ni incomplétude ni bandeau', { timeout: DELAI_MONTAGE }, async () => {
    browse = () => json({ ...RACINE, total_matches: 13 });
    const racine = await ouvrir();
    flushSync();
    const debut = fr['v2.ms.listIncomplete'].split('{n}')[0];
    expect(texte(racine)).not.toContain(debut);
    expect(racine.querySelector('.err')).toBeNull();
    expect(racine.querySelector('[role="status"]')).toBeNull();
    expect(racine.querySelectorAll('.folders .folder').length).toBe(2);
  });
});
