import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * L'écran Streaming applique-t-il les décisions de `streamingGenres.ts` ?
 *
 * Ce fichier n'importe RIEN du module : sans cela, avant le lot, l'échec
 * d'import l'aurait emporté d'un bloc et la contre-épreuve n'aurait montré
 * qu'un fichier manquant. Ici chaque assertion échoue sur ce qu'elle affirme —
 * l'onglet absent, la profondeur non pilotée, la liste rangée au mauvais
 * endroit — ce qui est précisément le manque qu'on comble.
 *
 * Un module juste et jamais appelé est le défaut dominant de ce projet
 * (« écrit mais pas branché ») : c'est cette moitié-là qui est gardée ici.
 */
describe('l’écran Streaming branche bien la décision sur les genres', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/v2/StreamingV2.svelte'),
    'utf-8',
  );

  it('l’onglet Genres existe, et n’apparaît que si le service en sert', () => {
    expect(source).toContain('aUnOngletGenres(svcGenres)');
    expect(source).toMatch(/ongletGenres \? \[\{ id: 'genres'/);
    expect(source).toMatch(/type Sub = .*'genres'/);
  });

  it('la profondeur est pilotée par ouvertureGenre, pas par un nom de service', () => {
    expect(source).toContain("ouvertureGenre(g) === 'albums'");
    const nav = source.slice(source.indexOf('async function ouvrirGenre'));
    const corps = nav.slice(0, nav.indexOf('function retourGenres'));
    expect(corps.length).toBeGreaterThan(200);
    expect(corps).not.toMatch(/'qobuz'|'tidal'|'deezer'|'spotify'|'youtube'/);
  });

  it('la racine re-servie par Tidal est filtrée avant d’être affichée', () => {
    expect(source).toContain('sousGenresUtiles(g, svcGenres, rendus)');
  });

  it('la liste des genres est chargée hors de l’effet du volet', () => {
    // Rangée dans l'effet du volet, elle repartait à zéro à chaque changement
    // de vue : l'onglet aurait clignoté puis disparu en passant sur Playlists.
    const debut = source.indexOf('/** Charge la vue courante');
    const fin = source.indexOf('/** Albums d', debut);
    expect(debut).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(debut);
    const volet = source.slice(debut, fin);
    expect(volet).not.toContain('api.getStreamingGenres');
    expect(source).toContain('svcGenres = normaliserGenres(g)');
  });

  it('Bandcamp n’est pas envoyé sur la route /streaming/{service}/genres', () => {
    // Mesuré côté serveur : bandcamp n'est pas un service `StreamingService`,
    // la route rendrait 404 « unknown service ». Son parcours par genre passe
    // par /ext/bandcamp/tags, déjà branché sur l'onglet « Découvrir ».
    const chargeur = source.slice(source.indexOf('/** Liste des genres du service'));
    expect(chargeur.slice(0, 900)).toContain('svc === BANDCAMP');
    expect(source).toContain('!isBc && aUnOngletGenres(svcGenres)');
  });

  it('les libellés neufs passent par la traduction', () => {
    for (const cle of ['streaming.allGenres', 'streaming.pickGenre', 'streaming.genreNoAlbums', 'streaming.genresEmpty']) {
      expect(source).toContain(`$t('${cle}')`);
    }
  });
});
