// tune-server-rust#6121 — forum 2218 (Didier) : « les règles des collections
// intelligentes ne proposent pas "Artiste de l'album" (ALBUMARTIST) ».
//
// Le serveur lit `album_artist` aux deux niveaux : la balise ALBUMARTIST, et à
// défaut l'artiste de l'album (`criteres.rs`, `regles_sql.rs`,
// `smart_collections.rs`). L'éditeur doit le proposer, à côté de « Artiste »,
// avec les mêmes opérateurs, et dans les onze langues.
import { describe, expect, it } from 'vitest';
import { champsDe, champsSaisissables, operateursDe, typeDuChamp } from '../smartRegles';
import { operateursDe as operateursPlaylist } from '../smartPlaylistChamps';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import viLocale from '../locales/vi';
import elLocale from '../locales/el';
import plLocale from '../locales/pl';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const CLE = 'smartCollection.fieldAlbumArtist';

describe('#6121 — règle « Artiste de l’album »', () => {
  for (const niveau of ['collection', 'playlist'] as const) {
    it(`est proposée dans l’éditeur des ${niveau}s, juste après « Artiste »`, () => {
      const champs = champsSaisissables(niveau);
      const i = champs.findIndex((c) => c.value === 'album_artist');
      expect(i, 'le critère « Artiste de l’album » manque').toBeGreaterThan(-1);
      expect(champs[i].labelKey).toBe(CLE);
      expect(champs[i].type).toBe('text');
      const artiste = niveau === 'playlist' ? 'artist' : 'artist_name';
      expect(champs[i - 1].value).toBe(artiste);
    });
  }

  it('porte le même nom aux deux niveaux (celui que le serveur lit)', () => {
    expect(champsDe('collection').some((c) => c.value === 'album_artist')).toBe(true);
    expect(champsDe('playlist').some((c) => c.value === 'album_artist')).toBe(true);
    expect(typeDuChamp('album_artist', 'collection')).toBe('text');
    expect(typeDuChamp('album_artist', 'playlist')).toBe('text');
  });

  it('a les mêmes opérateurs que « Artiste »', () => {
    const ops = (o: readonly { value: string }[]) => o.map((x) => x.value);
    expect(ops(operateursDe('album_artist'))).toEqual(ops(operateursDe('artist_name')));
    expect(ops(operateursDe('album_artist', 'playlist'))).toEqual(
      ops(operateursDe('artist', 'playlist')),
    );
    expect(ops(operateursPlaylist('album_artist'))).toEqual(ops(operateursPlaylist('artist')));
  });

  it('est traduite dans les onze langues', () => {
    const langues = { de, en, es, fr, hu, vi: viLocale, el: elLocale, pl: plLocale, it: it_, ja, ko, ro, sv, zh } as Record<
      string,
      Record<string, string>
    >;
    for (const [code, l] of Object.entries(langues)) {
      expect(l[CLE], `${code} : ${CLE}`).toBeTruthy();
      expect(l[CLE], `${code} : même libellé que « Artiste »`).not.toBe(
        l['smartCollection.fieldArtist'],
      );
    }
    expect(fr[CLE]).toBe("Artiste de l'album");
    expect(en[CLE]).toBe('Album artist');
  });
});
