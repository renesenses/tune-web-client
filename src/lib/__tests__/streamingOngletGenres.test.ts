/**
 * La navigation par genre est un ONGLET, pas une section de fin de page.
 *
 * Elle existait — le client appelait déjà `getStreamingGenres(service)` de façon
 * générique — mais elle vivait tout EN BAS de l'onglet Éditorial, après les
 * playlists mises en avant et les nouveautés. Il fallait dérouler la page
 * entière pour tomber dessus. Bertrand, 01/09/2026 : « ajoute une navigation
 * par genre pour chaque service », puis « dans un 4ᵉ onglet pour Qobuz et
 * Tidal », puis, le 04/09 : « ajoute un onglet Genres à bandcamp ! ».
 *
 * ## Ce que ce fichier garde, et ce qu'il ne garde plus
 *
 * Il affirmait jusqu'au 04/09/2026 une liste de services EN DUR
 * (`GENRES_SERVIS = ['qobuz', 'tidal']`), établie par mesure contre le .18 :
 * Deezer rendait 26 genres et zéro album, YouTube aucun genre. La mesure était
 * juste, la forme non — elle figeait dans l'écran une propriété du serveur.
 * L'écran interroge désormais la DONNÉE (`aUnOngletGenres`), ce qui couvre les
 * mêmes services aujourd'hui et suit le serveur demain.
 *
 * Ce que ce fichier garde encore, et que `streamingGenresEcran.test.ts` (venu
 * de #709) ne couvre pas : la PLACE de l'onglet — quatrième chez les services
 * de streaming, deuxième chez Bandcamp — et le fait que la section de fin de
 * page ne revienne pas doubler la navigation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ECRAN = fileURLToPath(
  new URL('../../components/v2/StreamingV2.svelte', import.meta.url),
);
const source = () => readFileSync(ECRAN, 'utf8');

/**
 * Les deux branches du ternaire `isBc ? […] : […]`.
 *
 * Découper sur le PREMIER `:` serait faux : les littéraux d'objet en
 * contiennent (`{ id: 'editorial' }`). La version précédente le faisait, et
 * son test « Bandcamp n'a pas d'onglet Genres » passait donc sur une tranche
 * de quelques caractères — vrai pour une mauvaise raison.
 */
function branchesSubs(): { bandcamp: string; autres: string } {
  const src = source();
  const bloc = src.slice(src.indexOf('const SUBS'), src.indexOf('const label'));
  const separateur = "      : [{ id: 'editorial', label: 'Éditorial' }";
  const i = bloc.indexOf(separateur);
  if (i < 0) throw new Error('la forme de SUBS a changé : le découpage des deux branches est à revoir');
  return { bandcamp: bloc.slice(0, i), autres: bloc.slice(i) };
}

describe('Streaming — onglet Genres', () => {
  it('les genres ont leur propre volet', () => {
    const src = source();
    expect(src.includes("{:else if sub === 'genres'}"), 'le volet Genres a disparu').toBe(true);
    expect(src.includes("type Sub = 'editorial' | 'genres'"), 'le type ne connaît plus l’onglet').toBe(true);
  });

  it('il n’est plus enterré dans l’éditorial', () => {
    // Le laisser aux DEUX endroits ferait deux navigations pour un seul geste,
    // et l'une des deux finirait par diverger.
    expect(
      source().includes('<h2>Explorer par genre</h2>'),
      'la section de fin de page est revenue : les genres seraient à deux endroits.',
    ).toBe(false);
    // Et les albums d'un genre ne se chargent QUE depuis l'onglet : les tirer
    // aussi sous l'éditorial y ramènerait la section par la bande.
    expect(
      /sub !== 'genres' \|\| !gid/.test(source()),
      'le chargement des albums de genre est reparti sur l’éditorial',
    ).toBe(true);
  });

  it('il arrive en QUATRIÈME position sur les services de streaming', () => {
    // Sur la branche NON-Bandcamp : depuis le 04/09/2026, Bandcamp a lui aussi
    // un onglet Genres, et il y vient en deuxième — chercher dans tout le bloc
    // tomberait sur le sien.
    const { autres: bloc } = branchesSubs();
    const rang = ['editorial', 'playlists', 'favorites', 'genres'].map((id) =>
      bloc.indexOf(`'${id}'`),
    );
    expect(Math.min(...rang), 'un onglet a disparu de la liste').toBeGreaterThan(-1);
    expect(
      rang[3] > rang[0] && rang[3] > rang[1] && rang[3] > rang[2],
      'Genres n’est plus le dernier onglet.',
    ).toBe(true);
  });

  it('il n’apparaît que sur les services qui servent vraiment des genres', () => {
    const src = source();
    // La DONNÉE tranche, pas un nom de service : un onglet ouvert sur du vide
    // promet du contenu et livre une page blanche (Deezer : 26 genres, 0 album
    // — mesuré le 01/09/2026 sur le .18).
    expect(
      src.includes('aUnOngletGenres(svcGenres)'),
      'l’onglet n’est plus conditionné à la liste réellement servie.',
    ).toBe(true);
    expect(
      /ongletGenres \? \[\{ id: 'genres'/.test(src),
      'l’onglet n’est plus commandé par `ongletGenres`.',
    ).toBe(true);
    // Le retour en arrière le plus tentant : re-figer une liste de services.
    const { autres } = branchesSubs();
    expect(
      /'qobuz'|'tidal'|'deezer'|'youtube'/.test(autres),
      'une liste de services en dur est revenue commander l’onglet.',
    ).toBe(false);
  });

  it('le volet charge ses genres, et le dit quand il n’y en a pas', () => {
    const src = source();
    expect(
      src.includes('svcGenres = normaliserGenres(g)'),
      'le volet Genres ne charge plus rien : il s’ouvrirait toujours vide.',
    ).toBe(true);
    expect(src.includes("$t('streaming.genresEmpty')"), 'l’absence de genre n’est plus dite').toBe(true);
    expect(src.includes("$t('streaming.pickGenre')"), 'l’invite à choisir un genre a disparu').toBe(true);
  });

  it('Bandcamp a SON onglet Genres, servi par une autre route', () => {
    /*
     * Ce test disait l'inverse jusqu'au 04/09/2026 : « lui greffer celui-ci en
     * ferait un troisième, VIDE ». La prémisse était fausse, et mesurable.
     *
     * Ce qui est vide, c'est `/streaming/bandcamp/genres` — 404 « unknown
     * service » sur le .18. Mais Bandcamp sert ses genres par
     * `/ext/bandcamp/tags`, et il en sert PLUS que les autres : 27 genres et
     * 237 sous-genres, contre 13 pour Qobuz et 20 pour Tidal (mesures du
     * 04/09/2026 sur le .18, v0.9.130). Ils tenaient jusque-là dans une rangée
     * de puces au-dessus des albums.
     *
     * Bertrand, 04/09/2026 : « ajoute un onglet Genres à bandcamp ! »
     */
    const { bandcamp } = branchesSubs();
    expect(
      bandcamp.includes("{ id: 'genres', label: 'Genres' }"),
      'l’onglet Genres a disparu de Bandcamp',
    ).toBe(true);
  });

  it('Bandcamp n’est PAS branché sur la condition des services de streaming', () => {
    // `ongletGenres` commande l'appel à `/streaming/{svc}/genres`, qui répond
    // 404 pour Bandcamp. L'y brancher remplacerait un onglet qui marche par un
    // onglet en erreur — la confusion la plus facile à commettre ici.
    const { bandcamp, autres } = branchesSubs();
    expect(
      bandcamp.includes('ongletGenres ?'),
      'Bandcamp passerait par la route qui le refuse',
    ).toBe(false);
    expect(
      autres.includes('ongletGenres ?'),
      'la condition a quitté la branche des services de streaming',
    ).toBe(true);
    expect(
      source().includes('!isBc && aUnOngletGenres(svcGenres)'),
      'la garde qui tient Bandcamp hors de cette route a sauté',
    ).toBe(true);
  });

  it('les deux volets Genres restent distincts', () => {
    // Un seul `{:else if sub === 'genres'}` couvrirait les deux services avec
    // la même route : celui de Bandcamp est gardé par `isBc` et vient AVANT.
    const src = source();
    const bc = src.indexOf("{:else if sub === 'genres' && isBc}");
    const autres = src.indexOf("{:else if sub === 'genres'}");
    expect(bc, 'le volet Genres de Bandcamp a disparu').toBeGreaterThan(-1);
    expect(autres, 'le volet Genres des services de streaming a disparu').toBeGreaterThan(-1);
    expect(bc < autres, 'le volet générique passe avant celui de Bandcamp : il l’avalerait').toBe(true);
  });
});
