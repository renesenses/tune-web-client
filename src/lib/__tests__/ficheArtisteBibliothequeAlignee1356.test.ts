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
// ⚠️ CE QUE CE TÉMOIN PEUT PROUVER, ET CE QU'IL NE PEUT PAS.
//
// jsdom ne met pas en page : aucune largeur calculée n'y veut dire quoi que ce
// soit, et mesurer un `getBoundingClientRect` ici rendrait un vert qui ne garde
// rien. Ce témoin porte donc sur la STRUCTURE — l'arbre réellement monté, et
// les règles que les composants déclarent. C'est exactement ce qui a changé :
// deux frères dans un flex sont deux colonnes, un conteneur en `column` n'en
// fait qu'une. La garde est sur la cause, pas sur un pixel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ArtistesV2 from '../../components/v2/ArtistesV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { streamingServices } from '../stores/streaming';

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
  if (/\/search\?/.test(url)) return { services: { qobuz: { artists: [ARTISTE_SERVICE] } } };
  // L'ORDRE compte : `/library/artists/7/albums` matcherait aussi COLLECTIONS.
  if (/\/library\/artists\/\d+\/albums/.test(url)) return [];
  if (/\/library\/artists\/\d+\/bio/.test(url)) return { bio: BIO };
  if (/\/library\/artists\/\d+\/metadata/.test(url)) return {};
  if (/\/library\/artists\/\d+\/credits/.test(url)) return [];
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

/** Monte l'écran Artistes et OUVRE la fiche, par le geste de la grille. */
async function ficheOuverte(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ArtistesV2, { target: hote, props: { q: '' } });
  flushSync();
  await attendre();
  flushSync();
  const carte = hote.querySelector<HTMLButtonElement>('.grille.artistes .carte button.meta');
  expect(carte, 'la grille d’artistes n’a rien affiché : le témoin ne mesure plus rien').not.toBeNull();
  carte!.click();
  flushSync();
  // La chaîne de la fiche est longue : statuts des services, résolution de
  // l'artiste chez Qobuz, ses albums, PUIS ses titres phares.
  await attendre(300);
  flushSync();
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
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#1356 — l’en-tête n’est plus une colonne, le corps est pleine largeur', () => {
  it('🔴 l’en-tête et le corps sont DANS UN MÊME conteneur, pas frères dans le flex de la Bibliothèque', async () => {
    const el = await ficheOuverte();

    const entete = el.querySelector<HTMLElement>('header.tete');
    const corps = el.querySelector<HTMLElement>('.corps');
    expect(
      entete,
      'pas de `header.tete` : l’en-tête partagé n’est pas monté, la fiche a gardé son ancien en-tête de colonne',
    ).not.toBeNull();
    expect(corps, 'la fiche n’a pas de corps : elle ne s’est pas ouverte').not.toBeNull();

    const conteneur = el.querySelector<HTMLElement>('.fiche-pleine');
    expect(
      conteneur,
      'la fiche n’a pas de conteneur : l’en-tête et le corps retombent frères dans `.body{display:flex}` de LibraryV2, donc en DEUX COLONNES — c’est le défaut #1356',
    ).not.toBeNull();

    expect(
      entete!.parentElement,
      'l’en-tête n’est pas dans le conteneur de la fiche : il redevient une colonne de gauche',
    ).toBe(conteneur);
    expect(
      corps!.parentElement,
      'le corps n’est pas dans le conteneur de la fiche : les titres phares reprennent la moitié droite',
    ).toBe(conteneur);

    // Et l'en-tête est AVANT le corps : pleine largeur en haut, comme la fiche
    // de service. Un conteneur en colonne avec l'ordre inverse ne serait pas
    // « semblable à StreamingArtist ».
    expect(
      entete!.compareDocumentPosition(corps!) & Node.DOCUMENT_POSITION_FOLLOWING,
      'le corps ne suit pas l’en-tête',
    ).toBeTruthy();
  });

  it('🔴 le conteneur empile en COLONNE — sans quoi il ferait deux colonnes de plus', () => {
    // jsdom ne met pas en page : on lit la règle que le composant déclare.
    // C'est elle qui décide, et c'est elle qui manquait.
    const src = lire('../../components/v2/ArtistesV2.svelte');
    const i = src.indexOf('.fiche-pleine {');
    expect(i, 'la règle `.fiche-pleine` n’existe pas').toBeGreaterThan(-1);
    const regle = src.slice(i, src.indexOf('}', i));
    expect(regle, 'le conteneur de la fiche n’empile pas en colonne').toContain('flex-direction: column');
    expect(regle, 'sans `min-width: 0`, un tableau large repousse la colonne au lieu de défiler').toContain('min-width: 0');
  });

  it('les titres phares sont DANS le corps pleine largeur, pas à côté de l’en-tête', async () => {
    const el = await ficheOuverte();
    const conteneur = el.querySelector<HTMLElement>('.fiche-pleine');
    const titres = el.querySelector<HTMLElement>('.corps .bloc');
    expect(titres, 'ni biographie ni titres phares dans le corps').not.toBeNull();
    expect(el.textContent, 'les titres phares du service ne sont pas rendus').toContain('Onyx');
    expect(
      conteneur!.contains(titres!),
      'les titres phares ont quitté le conteneur de la fiche',
    ).toBe(true);
  });
});

describe('#1356 — le portrait est rond et la provenance se lit sous le nom', () => {
  it('l’en-tête est le composant PARTAGÉ avec la fiche de service', () => {
    const src = lire('../../components/v2/ArtistesV2.svelte');
    const svc = lire('../../components/v2/ArtisteServiceV2.svelte');
    expect(src, 'la fiche de bibliothèque n’emploie pas l’en-tête partagé').toContain('<EnTeteArtiste');
    expect(svc, 'la fiche de service n’emploie pas l’en-tête partagé').toContain('<EnTeteArtiste');
    // 🔴 Deux habillages concurrents divergent au premier correctif : c'est
    // exactement ce que #4330 cherchait à éviter, et ce qui a produit #1356.
    expect(src, 'un second en-tête a été réécrit côté bibliothèque').not.toContain('<header class="fiche">');
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
        apropos.querySelector('button.fab'),
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

  it('la fiche de SERVICE ne montre pas ce bouton : elle n’a pas d’enregistrement local à enrichir', () => {
    const svc = lire('../../components/v2/ArtisteServiceV2.svelte');
    expect(svc, 'la fiche de service passe un geste d’enrichissement').not.toContain('actionsBio');
  });
});

describe('#1356 — les actions : l’union des deux fiches, mesurée', () => {
  it('🔴 la bibliothèque GARDE ses quatre gestes', async () => {
    const el = await ficheOuverte();
    const gestes = el.querySelector<HTMLElement>('header.tete .gestes');
    expect(gestes, 'pas de rangée d’actions dans un `header.tete` : l’en-tête partagé n’est pas monté').not.toBeNull();
    const texte = gestes!.textContent ?? '';
    expect(texte, '« Toutes les pistes » a été perdu').toContain('Toutes les pistes');
    expect(texte, '« Lecture aléatoire » a été perdu').toContain('Lecture aléatoire');
    expect(texte, '« Modifier » a été perdu').toContain('Modifier');
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
    const src = lire('../../components/v2/ArtistesV2.svelte');
    const i = src.indexOf("$t('v2.fas.bestOf' as any)");
    expect(i, '« Écouter le best of » n’existe pas côté bibliothèque').toBeGreaterThan(-1);
    // La garde est AU-DESSUS du bouton, et c'est la même que côté service.
    const avant = src.slice(0, i);
    expect(
      avant.lastIndexOf('{#if titresPhares.length}'),
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
    // Ils tirent sur la bibliothèque, par les mêmes appels qu'`ArtistesV2` :
    // rien de promis que le moteur ne sache rendre.
    expect(svc).toContain('api.getArtistTracks(a.id)');
    expect(svc).toContain('api.shuffleAll(zid, { artist_id: a.id })');
  });

  it('la fiche de service GARDE ses deux gestes d’origine', () => {
    const svc = lire('../../components/v2/ArtisteServiceV2.svelte');
    expect(svc, '« Écouter le best of » a été perdu côté service').toContain("$tr('v2.fas.bestOf' as any)");
    expect(svc, '« Radio de l’artiste » a été perdu côté service').toContain("$tr('v2.fas.radio' as any)");
  });
});
