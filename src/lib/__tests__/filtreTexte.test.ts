/**
 * Décisions de Bertrand, 14/11/2026 — la zone de recherche d'Historique,
 * Collections, Répertoires, Playlists intelligentes et Titres bannis filtre la
 * liste déjà chargée (`lib/filtreTexte.ts`).
 */
import { describe, it, expect } from 'vitest';
import { champsRepondent, filtrerParTexte, motsDe } from '../filtreTexte';

const LISTE = [
  { nom: 'Jazz modal', desc: 'Miles, Coltrane' },
  { nom: 'Électro', desc: null },
  { nom: 'Bandes originales', desc: 'Cinéma' },
];
const champs = (x: (typeof LISTE)[number]) => [x.nom, x.desc];

describe('filtreTexte', () => {
  it('vide ou blanc : la MÊME liste, sans copie', () => {
    expect(filtrerParTexte(LISTE, '', champs)).toBe(LISTE);
    expect(filtrerParTexte(LISTE, '   ', champs)).toBe(LISTE);
    expect(filtrerParTexte(LISTE, null, champs)).toBe(LISTE);
  });
  it('casse et accents ignorés', () => {
    expect(filtrerParTexte(LISTE, 'electro', champs).map((x) => x.nom)).toEqual(['Électro']);
    expect(filtrerParTexte(LISTE, 'CINEMA', champs).map((x) => x.nom)).toEqual(['Bandes originales']);
  });
  it('plusieurs mots : tous requis, chacun dans n’importe quel champ', () => {
    expect(champsRepondent(['Jazz modal', 'Miles, Coltrane'], 'modal coltrane')).toBe(true);
    expect(champsRepondent(['Jazz modal', 'Miles, Coltrane'], 'modal evans')).toBe(false);
  });
  it('champs absents ou numériques tolérés', () => {
    expect(champsRepondent([null, undefined, 1959, 'Kind of Blue'], '1959')).toBe(true);
    expect(motsDe('  a  b ')).toEqual(['a', 'b']);
  });
  it('l’ordre reçu est gardé', () => {
    expect(filtrerParTexte(LISTE, 'a', champs).map((x) => x.nom)).toEqual(['Jazz modal', 'Bandes originales']);
  });
});
