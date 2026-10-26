// tune-server-rust#6122 — forum 2217 (Gros Bidon) : « la règle "Date d'ajout"
// ne prend qu'une date fixe ; il faudrait une durée glissante ("N derniers
// jours") ».
//
// Le serveur lit l'opérateur `in_last` sur `added_at` et `last_played_at`, aux
// deux niveaux, avec N pour valeur ; il calcule « il y a N jours » à chaque
// requête (`regles_sql::seuil_de`). L'éditeur doit le proposer pour les deux
// dates, saisir un entier (pas une date), refuser 0, et parler les onze langues.
import { describe, expect, it } from 'vitest';
import {
  JOURS_PAR_DEFAUT,
  operateursDe,
  regleComplete,
  saisieEnJours,
  sansValeur,
  valeurInitiale,
} from '../smartRegles';
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

const ops = (o: readonly { value: string }[]) => o.map((x) => x.value);

describe('#6122 — règle « dans les N derniers jours »', () => {
  for (const champ of ['added_at', 'last_played_at']) {
    it(`est proposée pour « ${champ} » dans les deux éditeurs`, () => {
      expect(ops(operateursDe(champ))).toContain('in_last');
      expect(ops(operateursDe(champ, 'playlist'))).toContain('in_last');
      expect(ops(operateursPlaylist(champ))).toContain('in_last');
    });
  }

  it('garde les opérateurs existants, dans le même ordre (règles enregistrées intactes)', () => {
    expect(ops(operateursDe('added_at'))).toEqual(['>', '<', 'between', 'in_last', 'is_null']);
  });

  it('n’est pas proposée pour un champ qui n’est pas une date', () => {
    expect(ops(operateursDe('year'))).not.toContain('in_last');
    expect(ops(operateursDe('genre'))).not.toContain('in_last');
  });

  it('saisit un nombre de jours, 30 par défaut', () => {
    expect(saisieEnJours('in_last')).toBe(true);
    expect(saisieEnJours('>')).toBe(false);
    expect(sansValeur('in_last')).toBe(false);
    expect(valeurInitiale('in_last', 'timestamp')).toBe(JOURS_PAR_DEFAUT);
    expect(JOURS_PAR_DEFAUT).toBe(30);
    // « après » garde sa date à saisir.
    expect(valeurInitiale('>', 'timestamp')).toBe('');
  });

  it('n’accepte qu’un entier strictement positif', () => {
    const r = (value: any) => regleComplete({ field: 'added_at', op: 'in_last', value });
    expect(r(30)).toBe(true);
    expect(r('7')).toBe(true);
    expect(r(0)).toBe(false);
    expect(r(-3)).toBe(false);
    expect(r(2.5)).toBe(false);
    expect(r('')).toBe(false);
    expect(r(null)).toBe(false);
    expect(r('abc')).toBe(false);
  });

  it('est traduite dans les onze langues', () => {
    const langues = { de, en, es, fr, hu, vi: viLocale, el: elLocale, pl: plLocale, it: it_, ja, ko, ro, sv, zh } as Record<
      string,
      Record<string, string>
    >;
    for (const [code, l] of Object.entries(langues)) {
      for (const cle of ['smartCollection.opInLast', 'smartCollection.unitDays']) {
        expect(l[cle], `${code} : ${cle}`).toBeTruthy();
      }
      expect(l['smartCollection.opInLast'], `${code} : distinct de « après »`).not.toBe(
        l['smartCollection.opAfter'],
      );
    }
    expect(fr['smartCollection.opInLast']).toBe('dans les derniers');
    expect(fr['smartCollection.unitDays']).toBe('jours');
    expect(en['smartCollection.opInLast']).toBe('in the last');
  });
});
