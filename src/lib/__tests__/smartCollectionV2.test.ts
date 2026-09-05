import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHAMPS, OPERATEURS, typeDuChamp, operateursDe, sansValeur, regleComplete, valeurInitiale,
} from '../smartRegles';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Grammaire des règles : une seule, partagée', () => {
  it('elle décrit tous les champs que le serveur connaît', () => {
    // Recopier vingt-deux champs dans un second éditeur aurait donné deux
    // vocabulaires qui divergent à la première addition.
    expect(CHAMPS.length).toBe(24);
    for (const c of CHAMPS) {
      expect(OPERATEURS[c.type], `${c.value} : type sans opérateurs`).toBeTruthy();
      expect(OPERATEURS[c.type].length).toBeGreaterThan(0);
    }
  });

  it('un champ inconnu retombe sur le texte, il ne casse pas', () => {
    expect(typeDuChamp('champ_invente')).toBe('text');
    expect(operateursDe('champ_invente')).toBe(OPERATEURS.text);
  });

  it('« est vide » n’attend PAS de valeur', () => {
    // Exiger une saisie pour ceux-là bloquerait une règle parfaitement formée.
    expect(sansValeur('is_null')).toBe(true);
    expect(sansValeur('is_not_null')).toBe(true);
    expect(sansValeur('contains')).toBe(false);
    expect(regleComplete({ field: 'cover_path', op: 'is_null', value: null })).toBe(true);
  });

  it('une règle incomplète est reconnue AVANT l’enregistrement', () => {
    // Le serveur la refuse, mais l'erreur ne remonte qu'après que tout est
    // saisi.
    expect(regleComplete({ field: 'artist_name', op: 'contains', value: '' })).toBe(false);
    expect(regleComplete({ field: '', op: 'contains', value: 'x' })).toBe(false);
    expect(regleComplete({ field: 'artist_name', op: 'contains', value: 'Miles' })).toBe(true);
  });

  it('« entre » exige ses DEUX bornes', () => {
    expect(regleComplete({ field: 'year', op: 'between', value: [1960] })).toBe(false);
    expect(regleComplete({ field: 'year', op: 'between', value: [1960, ''] })).toBe(false);
    expect(regleComplete({ field: 'year', op: 'between', value: [1960, 1969] })).toBe(true);
  });

  it('la valeur de départ suit l’opérateur ET le type', () => {
    expect(valeurInitiale('is_null', 'text')).toBeNull();
    expect(valeurInitiale('between', 'int')).toEqual([0, 0]);
    expect(valeurInitiale('between', 'timestamp')).toEqual(['', '']);
    expect(valeurInitiale('=', 'int')).toBe(0);
    expect(valeurInitiale('contains', 'text')).toBe('');
    expect(valeurInitiale('is', 'favorite')).toBe(true);
  });
});

describe("L'éditeur v2 de collection intelligente", () => {
  const ed = sansCommentaires(lire('src/components/v2/CollectionSmartEditeurV2.svelte'));
  const col = sansCommentaires(lire('src/components/v2/CollectionsV2.svelte'));

  it('il puise dans la grammaire partagée, il ne la recopie pas', () => {
    expect(ed).toContain("from '../../lib/smartRegles'");
    expect(ed, 'un vocabulaire recopié').not.toContain("labelKey: 'smartCollection.fieldArtist'");
  });

  it("il ANNONCE ce que les règles retiennent avant d'enregistrer", () => {
    // Une règle mal posée ne se voit qu'à l'usage : « année > 2020 » sur une
    // discothèque de jazz peut ne rien rendre.
    expect(ed).toContain('api.previewSmartCollection(');
    expect(ed).toContain('v2.smart.previewCount');
    // Débouncé : on tape dans un champ, pas la peine d'interroger à chaque
    // lettre.
    expect(ed).toContain('setTimeout(');
    expect(ed).toContain('clearTimeout(');
  });

  it('il ne descend jamais sous UNE règle', () => {
    // Zéro règle retiendrait toute la bibliothèque, ce que personne ne demande
    // sciemment.
    expect(ed).toContain('if (regles.length <= 1) return;');
  });

  it("il n'offre que les champs qu'il sait saisir correctement", () => {
    // `credit` (rôle + nom) et les références demandent chacun leur sélecteur.
    // Un champ de texte libre y produirait des règles invalides, refusées par
    // le serveur après coup.
    expect(ed).toContain('SAISISSABLES');
    expect(ed).toContain("['text', 'int', 'nullable', 'timestamp', 'count', 'favorite']");
  });

  it('il va CHERCHER la collection à modifier', () => {
    // L'écran ne porte qu'une forme normalisée, sans règles ni mode.
    expect(ed).toContain('api.getSmartCollection(id)');
    expect(col).toContain('editeurSmart = { id: e.id }');
  });

  it("l'écran Collections sait enfin en créer une", () => {
    // « Et comment ajouter une smart collection ? » — on ne pouvait pas.
    expect(col).toContain('editeurSmart = { id: null }');
    expect(col).toContain("import('./CollectionSmartEditeurV2.svelte')");
  });
});
