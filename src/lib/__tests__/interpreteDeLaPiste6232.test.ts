// tune-server-rust#6232 — forum 2218 (Didier) : « je dois avoir comme
// résultat tous les albums dans lesquels le nom Genesis apparaît et toutes
// les pistes ou albums ayant une piste avec ce même nom ».
//
// Le serveur lit `track_artist` aux deux niveaux : la balise ARTIST de la
// piste, à défaut l'artiste de la piste en base (`criteres.rs`,
// `regles_sql.rs`, `smart_collections.rs`). Dans une collection, un album
// passe dès qu'une de ses pistes passe. L'éditeur doit le proposer, juste
// après « Artiste de l'album », avec les opérateurs d'un texte, et dans les
// douze langues.
import { describe, expect, it } from 'vitest';
import { champsDe, champsSaisissables, operateursDe, typeDuChamp } from '../smartRegles';
import { operateursDe as operateursPlaylist } from '../smartPlaylistChamps';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import vi from '../locales/vi';
import el from '../locales/el';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const CLE = 'smartCollection.fieldTrackArtist';

describe('#6232 — règle « Interprète de la piste »', () => {
  for (const niveau of ['collection', 'playlist'] as const) {
    it(`est proposée dans l’éditeur des ${niveau}s, juste après « Artiste de l’album »`, () => {
      const champs = champsSaisissables(niveau);
      const i = champs.findIndex((c) => c.value === 'track_artist');
      expect(i, 'le critère « Interprète de la piste » manque').toBeGreaterThan(-1);
      expect(champs[i].labelKey).toBe(CLE);
      expect(champs[i].type).toBe('text');
      expect(champs[i - 1].value).toBe('album_artist');
    });
  }

  it('porte le même nom aux deux niveaux (celui que le serveur lit)', () => {
    expect(champsDe('collection').some((c) => c.value === 'track_artist')).toBe(true);
    expect(champsDe('playlist').some((c) => c.value === 'track_artist')).toBe(true);
    expect(typeDuChamp('track_artist', 'collection')).toBe('text');
    expect(typeDuChamp('track_artist', 'playlist')).toBe('text');
  });

  it('a les mêmes opérateurs que « Artiste », « ne contient pas » compris', () => {
    const ops = (o: readonly { value: string }[]) => o.map((x) => x.value);
    expect(ops(operateursDe('track_artist'))).toEqual(ops(operateursDe('artist_name')));
    expect(ops(operateursPlaylist('track_artist'))).toEqual(ops(operateursPlaylist('artist')));
    expect(ops(operateursDe('track_artist'))).toContain('not_contains');
  });

  it('est traduite dans les douze langues, et distincte des deux autres artistes', () => {
    const langues = { de, en, es, fr, hu, vi, el, it: it_, ja, ko, ro, sv, zh } as Record<
      string,
      Record<string, string>
    >;
    for (const [code, l] of Object.entries(langues)) {
      expect(l[CLE], `${code} : ${CLE}`).toBeTruthy();
      expect(l[CLE], `${code} : même libellé que « Artiste »`).not.toBe(l['smartCollection.fieldArtist']);
      expect(l[CLE], `${code} : même libellé que « Artiste de l’album »`).not.toBe(
        l['smartCollection.fieldAlbumArtist'],
      );
    }
    expect(fr[CLE]).toBe('Interprète de la piste');
    expect(en[CLE]).toBe('Track artist');
  });
});
