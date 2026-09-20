import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dictionnaire } from './onzeDictionnaires';

const LOCALES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu'];

describe('#3836 — Ambiance doit DIRE qu’elle cherche un son, pas un genre', () => {
  it('l’écran affiche l’avertissement, et ne code plus le français en dur', () => {
    const src = readFileSync('src/components/v2-heritage/AmbianceView.svelte', 'utf8');
    expect(src).toContain("v2.ambiance.promptHint");
    // JeromeQ a tapé un NOM DE GENRE dans une recherche acoustique : c'est
    // cette confusion que la phrase doit lever.
    expect(src).toContain("v2.ambiance.promptPlaceholder");
    expect(src).toContain("v2.ambiance.search");
    expect(src).not.toMatch(/placeholder="ex\. «/);
    expect(src).not.toMatch(/^\s*Rechercher\s*$/m);
  });

  it('les trois clés existent dans les onze langues', async () => {
    for (const code of LOCALES) {
      const dico = dictionnaire(code);
      for (const cle of ['v2.ambiance.promptHint', 'v2.ambiance.promptPlaceholder', 'v2.ambiance.search']) {
        expect(dico[cle], `${code} / ${cle}`).toBeTruthy();
      }
    }
  });

  it('l’avertissement nomme les deux pièges : le genre, et la langue', async () => {
    const fr = dictionnaire('fr');
    const hint = fr['v2.ambiance.promptHint'];
    expect(hint).toMatch(/SON/);
    expect(hint).toMatch(/genre/i);
    expect(hint).toMatch(/anglais/i);
    // La traduction automatique n'est pas promise sans condition : elle demande
    // une clé IA (#1726), et le dire évite une seconde déception.
    expect(hint).toMatch(/cl[ée] IA|Réglages/i);
  });
});
