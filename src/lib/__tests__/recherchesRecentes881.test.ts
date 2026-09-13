// @vitest-environment jsdom
//
// 🔴 `renesenses/tune-web-client#881` — « Recherches récentes : l'historique
// est écrit à chaque état de frappe, pas à la validation — dix entrées pour
// deux recherches, et il est plafonné à dix. »
//
// LE MÉCANISME
// ------------
// `SearchV2` appelle `retenirRecherche` DANS l'effet de frappe, après un
// `setTimeout(240)`. Chaque pause de plus de 240 ms écrit donc une entrée :
// taper « miles davis » laisse « mi », « miles », « miles dav », « miles
// davis » — et ces quatre brouillons chassent les vraies recherches d'avant
// hors du plafond de dix.
//
// POURQUOI PAS « ATTENDRE LA VALIDATION »
// ----------------------------------------
// L'écran n'a pas de bouton « chercher » : il cherche pendant qu'on tape. Il
// n'y a aucune validation à attendre. Ce qu'on PEUT reconnaître, c'est la
// frappe elle-même — une saisie qui prolonge la précédente est la MÊME
// recherche, en cours d'écriture.
//
// CONTRE-ÉPREUVE : le dernier bloc rejoue la règle d'avant sur le cas exact de
// la fiche et compte les entrées qu'elle laissait.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chargerRecherchesRecentes, prolonge, retenirRecherche, viderRecherchesRecentes,
} from '../rechercheClassement';

beforeEach(() => viderRecherchesRecentes());
afterEach(() => viderRecherchesRecentes());

describe('#881 — une frappe qui prolonge la précédente la REMPLACE', () => {
  it('🔴 le cas de la fiche : taper « miles davis » laisse UNE entrée', () => {
    for (const etat of ['mi', 'miles', 'miles dav', 'miles davis']) retenirRecherche(etat);
    expect(chargerRecherchesRecentes().map((e) => e.query)).toEqual(['miles davis']);
  });

  it('effacer compte aussi : « miles davis » → « miles » reste UNE entrée', () => {
    retenirRecherche('miles davis');
    retenirRecherche('miles');
    expect(chargerRecherchesRecentes().map((e) => e.query)).toEqual(['miles']);
  });

  it('🔴 deux recherches VRAIMENT différentes restent deux entrées', () => {
    retenirRecherche('miles');
    retenirRecherche('coltrane');
    expect(chargerRecherchesRecentes().map((e) => e.query)).toEqual(['coltrane', 'miles']);
  });

  it('seule la PLUS RÉCENTE peut être un brouillon', () => {
    // « mile » ancien ne doit pas être effacé parce qu'on tape « miles »
    // aujourd'hui : c'est une vraie recherche d'avant, qui partage un préfixe.
    retenirRecherche('mile');        // une vraie recherche, jadis
    retenirRecherche('coltrane');    // puis autre chose
    retenirRecherche('miles');       // et aujourd'hui, celle-ci
    expect(chargerRecherchesRecentes().map((e) => e.query))
      .toEqual(['miles', 'coltrane', 'mile']);
  });

  it('une recherche IDENTIQUE remonte en tête sans se dupliquer', () => {
    retenirRecherche('miles');
    retenirRecherche('coltrane');
    retenirRecherche('MILES');
    expect(chargerRecherchesRecentes().map((e) => e.query)).toEqual(['MILES', 'coltrane']);
  });
});

describe('#881 — la règle, isolée', () => {
  it('prolonger, dans les deux sens', () => {
    expect(prolonge('mile', 'miles')).toBe(true);
    expect(prolonge('miles', 'mile')).toBe(true);
  });

  it('identique n’est PAS prolonger — sinon on ne remonterait jamais en tête', () => {
    expect(prolonge('miles', 'miles')).toBe(false);
    expect(prolonge('Miles', ' miles ')).toBe(false);
  });

  it('deux mots distincts ne se prolongent pas', () => {
    expect(prolonge('miles', 'coltrane')).toBe(false);
    expect(prolonge('rock', 'pop')).toBe(false);
  });

  it('le vide ne prolonge rien', () => {
    expect(prolonge('', 'miles')).toBe(false);
    expect(prolonge('miles', '')).toBe(false);
    expect(prolonge('  ', ' ')).toBe(false);
  });

  it('la casse et les espaces ne comptent pas', () => {
    expect(prolonge('MI', '  miles  ')).toBe(true);
  });
});

describe('#881 — ce qui ne bouge PAS', () => {
  it('le plafond de dix tient toujours', () => {
    for (let i = 0; i < 15; i++) retenirRecherche(`requete-${String.fromCharCode(97 + i)}`);
    expect(chargerRecherchesRecentes()).toHaveLength(10);
  });

  it('une saisie vide ne retient rien', () => {
    retenirRecherche('miles');
    retenirRecherche('   ');
    expect(chargerRecherchesRecentes().map((e) => e.query)).toEqual(['miles']);
  });
});

describe('#881 — CONTRE-ÉPREUVE', () => {
  it('l’ancienne règle laissait bien QUATRE entrées pour une recherche', () => {
    // Ce que faisait `retenirRecherche` : écarter l'identique, rien d'autre.
    let liste: string[] = [];
    const ancienne = (q: string) => {
      liste = [q, ...liste.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 10);
    };
    for (const etat of ['mi', 'miles', 'miles dav', 'miles davis']) ancienne(etat);
    expect(liste, 'le témoin ne reproduit pas l’empilement').toEqual([
      'miles davis', 'miles dav', 'miles', 'mi',
    ]);

    // La règle actuelle, sur les mêmes frappes, en laisse UNE.
    for (const etat of ['mi', 'miles', 'miles dav', 'miles davis']) retenirRecherche(etat);
    expect(chargerRecherchesRecentes()).toHaveLength(1);
  });

  it('et elle chassait les vraies recherches hors du plafond', () => {
    // Dix vraies recherches, puis une seule frappée en quatre temps : sous
    // l'ancienne règle il n'en restait que six.
    for (let i = 0; i < 10; i++) retenirRecherche(`vraie-${i}`);
    for (const etat of ['mi', 'miles', 'miles dav', 'miles davis']) retenirRecherche(etat);
    const restantes = chargerRecherchesRecentes().filter((e) => e.query.startsWith('vraie-'));
    expect(restantes, 'des recherches réelles ont été chassées par des brouillons')
      .toHaveLength(9);
  });
});
