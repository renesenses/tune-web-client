// @vitest-environment jsdom
//
// LA FICHE D'UN ARTISTE DE BIBLIOTHÈQUE, ALIGNÉE SUR CELLE DE STREAMING — #1356.
//
// Bertrand, 20/09/2026, deux captures à l'appui (Adèle Viret côté
// bibliothèque, Agnes Obel côté streaming) : « Je voudrais que la fiche
// LibraryArtist soit semblable à StreamingArtist. Possible ? »
//
// Les deux fiches montraient DÉJÀ le même contenu : `BioEtTitresPhares` est
// monté par les deux depuis la page artiste commune
// (renesenses/tune-server-rust#4330). C'est l'HABILLAGE qui divergeait, et il
// coûtait des colonnes à l'écran.
//
// 🔴 LA CAUSE, MESURÉE SUR LE SOURCE AVANT D'ÊTRE CORRIGÉE.
//
// `LibraryV2.svelte` pose `.body{display:flex}`. `ArtistesV2` rendait
// `<header class="fiche">` et `<div class="corps">` en FRÈRES DIRECTS dans ce
// conteneur : le navigateur en faisait deux COLONNES. L'en-tête prenait la
// gauche ; le corps — donc les titres phares — était réduit à ce qui restait,
// et ses colonnes Canaux / BPM / Genre / Qualité passaient derrière une barre
// de défilement horizontale. `ArtisteServiceV2`, lui, enveloppe tout dans sa
// `<section class="v2-fas">` et n'a jamais eu ce défaut.
//
// 🟢 DEPUIS #1501, IL N'Y A PLUS QU'UNE FICHE. « Semblable à StreamingArtist »
// est devenu « EST StreamingArtist » : la fiche de la Bibliothèque est retirée,
// et le clic sur un artiste de la grille ouvre la page commune sur un artiste
// LOCAL (`service: null`, #1485). Ce que ce fichier garde n'a pas changé de
// sens — un seul conteneur, l'en-tête partagé, la provenance sous le nom,
// l'enrichissement dans le bloc de la biographie, l'union des gestes — mais
// il le mesure sur la page commune, ouverte comme la grille l'ouvre.
//
// ⚠️ CE QUE CE TÉMOIN PEUT PROUVER, ET CE QU'IL NE PEUT PAS.
//
// jsdom ne met pas en page : aucune largeur calculée n'y veut dire quoi que ce
// soit, et mesurer un `getBoundingClientRect` ici rendrait un vert qui ne garde
// rien. Ce témoin porte donc sur la STRUCTURE — l'arbre réellement monté, et
// les règles que les composants déclarent. La garde est sur la cause, pas sur
// un pixel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ArtisteServiceV2 from '../../components/v2/ArtisteServiceV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService, streamingServices } from '../stores/streaming';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ARTISTE = { id: 7, name: 'Adèle Viret', album_count: 11, image_path: null, musicbrainz_id: null };
/** L'artiste tel qu'un service le rend : c'est lui qui débloque les titres phares. */
const ARTISTE_SERVICE = { source_id: 'q-1', name: 'Adèle Viret', source: 'qobuz' };
const ALBUMS_SERVICE = [{ id: null, title: 'Le Songe de Lug', source_id: 'a-1', year: 2024, cover_path: null }];
const TOP = [
  { source_id: 't1', title: 'Onyx', artist_name: 'Adèle Viret', album_title: 'Le Songe de Lug', duration_ms: 240000 },
];
const BIO = 'Violoncelliste et compositrice, Adèle Viret publie son premier disque en 2024.';

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

/**
 * Le serveur de ce témoin : une bibliothèque qui connaît l'artiste, et UN
 * service connecté qui le résout — sans quoi il n'y aurait ni titres phares,
 * ni les deux gestes portés de la fiche de service.
 */
function corpsPour(url: string) {
  if (/\/streaming\/services(\?|$)/.test(url)) return { qobuz: { authenticated: true } };
  if (/\/streaming\/qobuz\/artists\/q-1\/top-tracks/.test(url)) return TOP;
  if (/\/streaming\/qobuz\/artists\/q-1\/albums/.test(url)) return ALBUMS_SERVICE;
  // L'artiste tel que le service le rend, biographie comprise (Qobuz la publie) :
  // sans elle le bloc de la biographie ne serait pas monte, et le temoin de la
  // fiche de service ne mesurerait rien.
  if (/\/streaming\/qobuz\/artists\/q-1(\?|$)/.test(url)) return { ...ARTISTE_SERVICE, bio: BIO };
  if (/\/search\?/.test(url)) return { services: { qobuz: { artists: [ARTISTE_SERVICE] } } };
  // L'ORDRE compte : `/library/artists/7/albums` matcherait aussi COLLECTIONS.
  if (/\/library\/artists\/\d+\/albums/.test(url)) return [];
  if (/\/library\/artists\/\d+\/bio/.test(url)) return { bio: BIO };
  if (/\/library\/artists\/\d+\/metadata/.test(url)) return {};
  if (/\/library\/artists\/\d+\/credits/.test(url)) return [];
  // #1501 — la page commune demande l'artiste par son IDENTIFIANT (`getArtist`).
  if (/\/library\/artists\/\d+(\?|$)/.test(url)) return ARTISTE;
  if (/\/library\/artists(\?|$)/.test(url)) return [ARTISTE];
  return COLLECTIONS.test(url) ? [] : {};
}

function reponsePour(url: string) {
  const corps = corpsPour(url);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const attendre = (ms = 80) => new Promise((r) => setTimeout(r, ms));

/**
 * La page commune, ouverte sur l'artiste LOCAL — la forme que pose la grille
 * de la Bibliothèque par `ouvrirArtisteDepuis` (#1501) : `service: null`,
 * l'identifiant de bibliothèque en texte.
 */
async function ficheOuverte(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  ficheArtisteService.set({ service: null, id: String(ARTISTE.id), nom: ARTISTE.name });
  activeView.set('streamingartist');
  monte = mount(ArtisteServiceV2, { target: hote });
  flushSync();
  // La chaîne de la fiche est longue : l'artiste et ses albums, les statuts
  // des services, la résolution de l'artiste chez Qobuz, ses albums, PUIS ses
  // titres phares.
  await attendre(300);
  flushSync();
  expect(hote.querySelector('header.tete'), 'la page commune ne s’est pas montée : le témoin ne mesure plus rien').not.toBeNull();
  return hote;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponsePour(String(url))));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  // `ClampedText` — le replieur de la biographie — observe son nœud. jsdom
  // n'a pas `ResizeObserver` ; sans ce repli, monter la fiche lève.
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  activeView.set('home');
  vueDeRetour.set(null);
  streamingServices.set({} as any);
  ficheArtisteService.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  ficheArtisteService.set(null);
  activeView.set('home');
  vi.unstubAllGlobals();
});

describe('#1356 — l’en-tête n’est plus une colonne, le corps est pleine largeur', () => {
  it('🔴 l’en-tête et le corps sont DANS UN MÊME conteneur, pas frères dans le flex de la Bibliothèque', async () => {
    const el = await ficheOuverte();

    const entete = el.querySelector<HTMLElement>('header.tete');
    const corps = el.querySelector<HTMLElement>('.bio-bloc');
    expect(
      entete,
      'pas de `header.tete` : l’en-tête partagé n’est pas monté',
    ).not.toBeNull();
    expect(corps, 'la fiche n’a pas de corps : ni biographie ni titres phares').not.toBeNull();

    // #1501 — le conteneur est celui de la page commune, une VUE à part
    // entière : plus rien n'est monté dans `.body{display:flex}` de LibraryV2.
    const conteneur = el.querySelector<HTMLElement>('section.v2-fas');
    expect(conteneur, 'la page commune n’a pas de conteneur').not.toBeNull();
    expect(conteneur!.contains(entete!), 'l’en-tête n’est pas dans le conteneur de la fiche').toBe(true);
    expect(conteneur!.contains(corps!), 'le corps n’est pas dans le conteneur de la fiche').toBe(true);

    // Et l'en-tête est AVANT le corps : pleine largeur en haut.
    expect(
      entete!.compareDocumentPosition(corps!) & Node.DOCUMENT_POSITION_FOLLOWING,
      'le corps ne suit pas l’en-tête',
    ).toBeTruthy();
  });

  it('🔴 la Bibliothèque ne monte plus AUCUNE fiche dans son flex — #1501', () => {
    // jsdom ne met pas en page : on lit ce que le composant déclare. La cause
    // du défaut — deux frères dans `.body{display:flex}` — n'a plus de porteur.
    const src = lire('../../components/v2/ArtistesV2.svelte');
    expect(src, 'ArtistesV2 rend de nouveau une fiche').not.toContain('.fiche-pleine');
    expect(src, 'ArtistesV2 rend de nouveau un corps de fiche').not.toContain('class="corps"');
    expect(src, 'ArtistesV2 rend de nouveau un en-tête de fiche').not.toContain('<header');
    // La page commune, elle, défile d'UN SEUL bloc.
    const svc = lire('../../components/v2/ArtisteServiceV2.svelte');
    expect(/\.v2-fas\{[^}]*overflow-y:\s*auto/.test(svc), 'la page commune ne défile plus d’un bloc').toBe(true);
  });

  it('les titres phares sont DANS le corps pleine largeur, pas à côté de l’en-tête', async () => {
    const el = await ficheOuverte();
    const conteneur = el.querySelector<HTMLElement>('section.v2-fas');
    const titres = el.querySelector<HTMLElement>('.bloc');
    expect(titres, 'ni biographie ni titres phares dans le corps').not.toBeNull();
    expect(el.textContent, 'les titres phares du service ne sont pas rendus').toContain('Onyx');
    expect(
      conteneur!.contains(titres!),
      'les titres phares ont quitté le conteneur de la fiche',
    ).toBe(true);
  });
});

describe('#1356 — le portrait est rond et la provenance se lit sous le nom', () => {
  it('l’en-tête est le composant PARTAGÉ — et il n’a plus qu’un porteur', () => {
    const src = lire('../../components/v2/ArtistesV2.svelte');
    const svc = lire('../../components/v2/ArtisteServiceV2.svelte');
    expect(svc, 'la page commune n’emploie pas l’en-tête partagé').toContain('<EnTeteArtiste');
    // 🔴 Deux habillages concurrents divergent au premier correctif : c'est
    // exactement ce que #4330 cherchait à éviter, et ce qui a produit #1356.
    // Depuis #1501 la grille n'a plus d'en-tête du tout.
    expect(src, 'un second en-tête a été réécrit côté bibliothèque').not.toContain('<header class="fiche">');
    expect(src, 'la grille de la Bibliothèque monte de nouveau une fiche').not.toContain('<EnTeteArtiste');
    expect(svc, 'un second en-tête a été réécrit côté service').not.toContain('<header class="tete">');
  });

  it('🔴 le portrait de l’en-tête est ROND', () => {
    const entete = lire('../../components/v2/EnTeteArtiste.svelte');
    expect(
      /\.portrait\{[^}]*border-radius:\s*50%/.test(entete),
      'le portrait de l’en-tête n’est pas rond — c’est le carré de 84 px de l’ancienne fiche',
    ).toBe(true);
    // La vignette de GRILLE, elle, reste carrée : sa décision (03/09/2026) n'a
    // pas été rouverte. `pochetteActions.test.ts` la garde.
  });

  it('🔴 la PROVENANCE se lit sous le nom, et le compte d’albums reste', async () => {
    const el = await ficheOuverte();
    const ident = el.querySelector<HTMLElement>('header.tete .ident');
    expect(ident, 'pas de bloc d’identité dans un `header.tete` : l’en-tête partagé n’est pas monté').not.toBeNull();

    const h1 = ident!.querySelector('h1');
    expect(h1?.textContent).toContain('Adèle Viret');

    const provenance = ident!.querySelector<HTMLElement>('.prov');
    expect(
      provenance,
      'rien sous le nom ne dit d’où vient cette fiche — le streaming affiche QOBUZ, la bibliothèque n’affichait rien',
    ).not.toBeNull();
    expect(provenance!.textContent?.trim().length, 'la provenance est vide').toBeGreaterThan(0);

    // Le compte d'albums RESTE, et reste propre à la bibliothèque : un service
    // ne le rend pas.
    const compte = ident!.querySelector<HTMLElement>('.cpt');
    expect(compte, 'le compte d’albums a disparu de la fiche de bibliothèque').not.toBeNull();
    expect(compte!.textContent).toMatch(/\d/);
  });
});

describe('#1356 — « Enrichir la biographie » agit sur la biographie, et se lit avec elle', () => {
  it('🔴 le bouton est DANS le bloc de la biographie, plus au milieu de la page', async () => {
    const el = await ficheOuverte();

    const bloc = el.querySelector<HTMLElement>('.bio-bloc');
    expect(bloc, 'le bloc de la biographie n’existe pas').not.toBeNull();

    const bouton = bloc!.querySelector<HTMLButtonElement>('.bio-actions button');
    expect(
      bouton,
      '« Enrichir la biographie » n’est pas dans le bloc de la biographie — il flotte encore au milieu de la fiche',
    ).not.toBeNull();

    // Et il n'est PAS resté dans `À propos`, qui ne liste que les artistes
    // proches, les membres et les instruments.
    const apropos = el.querySelector<HTMLElement>('.apropos');
    if (apropos) {
      expect(
        apropos.querySelector('button'),
        '« Enrichir la biographie » est encore dans la section « À propos »',
      ).toBeNull();
    }
  });

  it('il s’affiche MÊME SANS biographie — c’est le cas où il sert le plus', () => {
    const src = lire('../../components/v2/BioEtTitresPhares.svelte');
    expect(
      src,
      'le bloc ne s’ouvre que sur une biographie existante : l’artiste sans bio ne pourrait pas l’enrichir',
    ).toContain('{#if bioPropre || actionsBio}');
  });

  it('la fiche de SERVICE ne montre pas ce bouton : elle n’a pas d’enregistrement local à enrichir', async () => {
    // 🔴 MONTÉE, PLUS LUE — #1232, étape 2.
    //
    // Ce témoin cherchait la chaîne `actionsBio` dans le source
    // d’`ArtisteServiceV2`. Depuis que cette fiche est AUSSI celle d’un artiste
    // de la bibliothèque, elle passe légitimement `actionsBio` — mais pour lui
    // seul. La garde de texte rougissait donc à tort, sur un correctif qui ne
    // touche pas à ce qu’elle protège. On mesure l’arbre RÉELLEMENT monté sur
    // un artiste de SERVICE : plus fort, et insensible à la forme du source.
    hote = document.createElement('div');
    document.body.appendChild(hote);
    ficheArtisteService.set({ service: 'qobuz' as any, id: 'q-1', nom: 'Adèle Viret' });
    monte = mount(ArtisteServiceV2, { target: hote });
    flushSync();
    await attendre(300);
    flushSync();

    const bloc = hote.querySelector<HTMLElement>('.bio-bloc');
    expect(
      bloc,
      'le bloc de la biographie n’est pas monté : le témoin ne mesure plus rien',
    ).not.toBeNull();
    expect(
      bloc!.querySelector('.bio-actions button'),
      'la fiche de service offre un geste d’enrichissement sur un artiste distant',
    ).toBeNull();
  });
});

describe('#1356 — les actions : l’union des deux fiches, mesurée', () => {
  it('🔴 la bibliothèque GARDE ses cinq gestes', async () => {
    const el = await ficheOuverte();
    const gestes = el.querySelector<HTMLElement>('header.tete .gestes');
    expect(gestes, 'pas de rangée d’actions dans un `header.tete` : l’en-tête partagé n’est pas monté').not.toBeNull();
    const texte = gestes!.textContent ?? '';
    expect(texte, '« Toutes les pistes » a été perdu').toContain('Toutes les pistes');
    expect(texte, '« Lecture aléatoire » a été perdu').toContain('Lecture aléatoire');
    expect(texte, '« Modifier » a été perdu').toContain('Modifier');
    // 🔴 « Étiquettes » est arrivé dans `main` (#1357) PENDANT ce chantier, au
    // milieu du bloc déplacé : la fusion l'avait mangé. On le garde nommément.
    expect(texte, '« Étiquettes » (#1357) a été perdu dans le déplacement du bloc').toContain('Étiquettes');
    expect(
      gestes!.querySelector('.report-btn'),
      'les boutons de signalement ont été perdus',
    ).not.toBeNull();
  });

  it('🔴 elle GAGNE « Écouter le best of » et « Radio de l’artiste » quand un service rend des titres phares', async () => {
    const el = await ficheOuverte();
    const texte = el.querySelector<HTMLElement>('header.tete .gestes')!.textContent ?? '';
    expect(texte, '« Écouter le best of » n’a pas été porté').toContain('Écouter le best of');
    // L'apostrophe est celle de la traduction (U+0027), pas la typographique.
    expect(texte, '« Radio de l’artiste » n’a pas été porté').toContain("Radio de l'artiste");
  });

  it('🔴 ces deux gestes ne s’affichent PAS sans titres phares : un bouton mort se lit comme une panne', () => {
    const src = lire('../../components/v2/ArtisteServiceV2.svelte');
    const i = src.indexOf("$tr('v2.fas.bestOf' as any)");
    expect(i, '« Écouter le best of » n’existe pas sur la page commune').toBeGreaterThan(-1);
    // La garde est AU-DESSUS du bouton.
    const avant = src.slice(0, i);
    expect(
      avant.lastIndexOf('{#if titres.length}'),
      '« Écouter le best of » n’est pas gardé par la présence de titres phares',
    ).toBeGreaterThan(avant.lastIndexOf('{#snippet actions()}'));
  });

  it('🔴 la fiche de SERVICE gagne « Toutes les pistes » et « Lecture aléatoire », et seulement si la bibliothèque connaît l’artiste', () => {
    const svc = lire('../../components/v2/ArtisteServiceV2.svelte');
    expect(svc, '« Toutes les pistes » n’a pas été porté côté service').toContain("$tr('library.playAllArtist' as any)");
    expect(svc, '« Lecture aléatoire » n’a pas été porté côté service').toContain("$tr('library.shuffleArtist' as any)");
    const i = svc.indexOf("$tr('library.playAllArtist' as any)");
    const avant = svc.slice(0, i);
    expect(
      avant.lastIndexOf('{#if artisteLocal?.id != null}'),
      'les deux gestes portés ne sont pas gardés par l’artiste local : un service ne rend PAS les pistes d’une discographie, le bouton serait mort',
    ).toBeGreaterThan(avant.lastIndexOf('{#snippet actions()}'));
    // Ils tirent sur la bibliothèque, par les mêmes appels que l'ancienne
    // fiche : rien de promis que le moteur ne sache rendre.
    expect(svc).toContain('api.getArtistTracks(a.id)');
    expect(svc).toContain('api.shuffleAll(zid, { artist_id: a.id })');
  });

  it('la fiche de service GARDE ses deux gestes d’origine', () => {
    const svc = lire('../../components/v2/ArtisteServiceV2.svelte');
    expect(svc, '« Écouter le best of » a été perdu côté service').toContain("$tr('v2.fas.bestOf' as any)");
    expect(svc, '« Radio de l’artiste » a été perdu côté service').toContain("$tr('v2.fas.radio' as any)");
  });
});
