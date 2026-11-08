// tune-server-rust#7933 — l'artiste de la piste (balise ARTIST) portait deux
// noms : « Artiste de la piste {n} » dans l'écran d'édition, « Interprète de
// la piste » dans les règles des collections et playlists intelligentes.
// C'est la même valeur : un seul mot, dans chaque langue. Les vrais crédits
// d'interprètes (« Compositeurs et interprètes ») ne sont pas concernés.
import { describe, expect, it } from 'vitest';
import de from '../locales/de';
import el from '../locales/el';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import nb from '../locales/nb';
import pl from '../locales/pl';
import ro from '../locales/ro';
import sv from '../locales/sv';
import vi from '../locales/vi';
import zh from '../locales/zh';

const REGLE = 'smartCollection.fieldTrackArtist';
const EDITION = 'v2.edition.trackArtist';

// Le mot « artiste » de chaque langue, tel que l'écran d'édition l'emploie.
const MOT: Record<string, [Record<string, string>, string]> = {
  de: [de as Record<string, string>, 'interpret'],
  el: [el as Record<string, string>, 'καλλιτέχνης'],
  en: [en as Record<string, string>, 'artist'],
  es: [es as Record<string, string>, 'artista'],
  fr: [fr as Record<string, string>, 'artiste'],
  hu: [hu as Record<string, string>, 'előadója'],
  it: [it_ as Record<string, string>, 'artista'],
  ja: [ja as Record<string, string>, 'アーティスト'],
  ko: [ko as Record<string, string>, '아티스트'],
  nb: [nb as Record<string, string>, 'artist'],
  pl: [pl as Record<string, string>, 'wykonawca'],
  ro: [ro as Record<string, string>, 'artistul'],
  sv: [sv as Record<string, string>, 'artist'],
  vi: [vi as Record<string, string>, 'nghệ sĩ'],
  zh: [zh as Record<string, string>, '艺人'],
};

describe('#7933 — un seul libellé pour l’artiste de la piste', () => {
  it('couvre les quinze langues du client', () => {
    expect(Object.keys(MOT)).toHaveLength(15);
  });

  for (const [code, [l, mot]] of Object.entries(MOT)) {
    it(`${code} : la règle et l’écran d’édition emploient le même mot`, () => {
      expect(l[EDITION]?.toLowerCase(), `${code} : ${EDITION}`).toContain(mot);
      expect(
        l[REGLE]?.toLowerCase(),
        `${code} : « ${l[REGLE]} » doit employer le mot « ${mot} » de « ${l[EDITION]} »`,
      ).toContain(mot);
    });
  }

  it('fr, es, it, ro : la règle ne dit plus « interprète »', () => {
    expect(fr[REGLE]).toBe('Artiste de la piste');
    expect(es[REGLE]).toBe('Artista de la pista');
    expect(it_[REGLE]).toBe('Artista del brano');
    expect(ro[REGLE]).toBe('Artistul piesei');
  });

  it('les vrais crédits d’interprètes gardent leur nom', () => {
    expect(fr['credits.block.interpretes']).toBe('Compositeurs et interprètes');
  });
});
