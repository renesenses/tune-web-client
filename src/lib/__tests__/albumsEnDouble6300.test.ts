/**
 * renesenses/tune-server-rust#6300 (Lulu, fil 2205) — regrouper les paires de
 * pistes en double par COUPLE d'albums, pour « garder cet album, retirer
 * l'autre » en un seul geste ; et le texte de la confirmation.
 */
import { describe, expect, it } from 'vitest';
import { grouperParAlbums, questionDeRetrait } from '../albumsEnDouble';
import type { PaireDoublonNommee, CopieDoublon } from '../api';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import hu from '../locales/hu';
import viLocale from '../locales/vi';
import elLocale from '../locales/el';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const copie = (id: number, album_id: number | null, album_title = `Album ${album_id}`): CopieDoublon => ({ id, album_id, album_title });
const paire = (a: CopieDoublon, b: CopieDoublon): PaireDoublonNommee => ({
  critere: 'etiquettes_identiques', suppression_sure: false, a, b, recommandation: { garder: null, raison: '' },
});

describe('Albums en double (#6300)', () => {
  it('regroupe les paires par couple d’albums, quel que soit le sens', () => {
    const couples = grouperParAlbums([
      paire(copie(1, 10, 'Blue'), copie(3, 20, 'Blue (copie)')),
      paire(copie(4, 20, 'Blue (copie)'), copie(2, 10, 'Blue')),
      paire(copie(5, 30), copie(6, 40)),
    ]);
    expect(couples.map((c) => [c.a.album_id, c.b.album_id, c.paires])).toEqual([[10, 20, 2], [30, 40, 1]]);
    expect(couples[0].a.title).toBe('Blue');
    expect(couples[0].b.title).toBe('Blue (copie)');
  });

  it('ignore les paires d’un même album ou sans album connu', () => {
    expect(grouperParAlbums([
      paire(copie(1, 10), copie(2, 10)),
      paire(copie(3, null), copie(4, 20)),
    ])).toEqual([]);
  });

  it('la confirmation nomme les deux albums, les pistes et celles sans équivalent', () => {
    const q = questionDeRetrait(fr['v2.meta.removeAlbumAsk'], {
      garde: { title: 'Blue' },
      retire: { title: 'Blue (copie)', pistes: 3, pistes_sans_equivalent: 1 },
    });
    expect(q).toContain('« Blue (copie) »');
    expect(q).toContain('« Blue »');
    expect(q).toContain('3 pistes');
    expect(q).toContain('1 sans équivalent');
    expect(q).toMatch(/Aucun fichier n'est supprimé/);
  });

  it('les sept libellés existent dans les 13 langues, avec leurs jetons', () => {
    const tables: Record<string, Record<string, string>> = { fr, en, de, es, it: it_, hu, vi: viLocale, el: elLocale, ja, ko, ro, sv, zh };
    const jetons: Record<string, string[]> = {
      'v2.meta.dupAlbumsWhole': [],
      'v2.meta.dupAlbumsPairs': ['{n}'],
      'v2.meta.keepAlbumRemoveOther': ['{keep}'],
      'v2.meta.removeAlbumAsk': ['{keep}', '{remove}', '{n}', '{sans}'],
      'v2.meta.albumRemoved': [],
      'v2.meta.removedAlbums': [],
      'v2.meta.restoreAlbum': [],
    };
    for (const [l, table] of Object.entries(tables)) {
      for (const [cle, attendus] of Object.entries(jetons)) {
        expect(table[cle], `${l} : ${cle}`).toBeTruthy();
        for (const j of attendus) expect(table[cle], `${l} : ${cle} ${j}`).toContain(j);
      }
    }
  });
});
