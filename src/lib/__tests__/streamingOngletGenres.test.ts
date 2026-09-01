/**
 * La navigation par genre est un ONGLET, pas une section de fin de page.
 *
 * Elle existait — le client appelait déjà `getStreamingGenres(service)` de façon
 * générique — mais elle vivait tout EN BAS de l'onglet Éditorial, après les
 * playlists mises en avant et les nouveautés. Il fallait dérouler la page
 * entière pour tomber dessus. Bertrand, 01/09/2026 : « ajoute une navigation
 * par genre pour chaque service », puis « dans un 4ᵉ onglet pour Qobuz et
 * Tidal ».
 *
 * ## Pourquoi ces deux services, et pas tous
 *
 * Mesuré contre un serveur réel (192.168.1.18, v0.9.130) AVANT d'écrire :
 *
 *   qobuz    13 genres, albums d'un genre : OK
 *   tidal    20 genres, albums d'un genre : OK
 *   deezer   26 genres, albums : ZÉRO
 *   youtube  aucun genre
 *
 * Un onglet pour Deezer ou YouTube se serait ouvert sur du vide. La liste est
 * donc explicite et documentée, pas devinée — et le jour où le serveur les
 * sert, un nom à ajouter suffit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ECRAN = fileURLToPath(
  new URL('../../components/v2/StreamingV2.svelte', import.meta.url),
);
const source = () => readFileSync(ECRAN, 'utf8');

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
  });

  it('il arrive en QUATRIÈME position', () => {
    const src = source();
    const bloc = src.slice(src.indexOf('const SUBS'), src.indexOf('const label'));
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
    expect(
      /const GENRES_SERVIS = \['qobuz', 'tidal'\]/.test(src),
      'la liste des services a changé : vérifier au préalable que le serveur rend bien ' +
        'des genres ET les albums de ces genres — sinon l’onglet s’ouvre sur du vide.',
    ).toBe(true);
    expect(
      src.includes("GENRES_SERVIS.includes(active ?? '')"),
      'l’onglet n’est plus conditionné : il apparaîtrait sur Deezer (0 album) et YouTube (0 genre).',
    ).toBe(true);
  });

  it('le volet charge ses genres, et le dit quand il n’y en a pas', () => {
    const src = source();
    expect(
      src.includes("if (view === 'editorial' || view === 'genres')"),
      'le volet Genres ne déclenche plus le chargement : il s’ouvrirait toujours vide.',
    ).toBe(true);
    expect(src.includes('v2.stream.noGenre'), 'l’absence de genre n’est plus dite').toBe(true);
    expect(src.includes('v2.stream.pickGenre'), 'l’invite à choisir un genre a disparu').toBe(true);
  });

  it('Bandcamp garde sa propre découverte', () => {
    // Il a ses genres à lui (`bcGenres`, avec sous-genres) et deux onglets
    // seulement. Lui greffer celui-ci en ferait un troisième, vide.
    const src = source();
    const bloc = src.slice(src.indexOf('const SUBS'), src.indexOf('const label'));
    const bc = bloc.slice(0, bloc.indexOf(':'));
    expect(bc.includes("'genres'"), 'l’onglet Genres a été ajouté à Bandcamp').toBe(false);
  });
});
