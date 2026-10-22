/**
 * web#2306 (suite de tune-server-rust#6730, PR #6746) — l'écran montre le
 * motif du fournisseur et nomme la clé Anthropic sans espace de travail.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleDEchec, messageDEchec } from '../assistantIa';
import { fr, ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const tr = (k: string) => (fr as Record<string, string>)[k] ?? k;

describe('web#2306 — le motif du fournisseur', () => {
  it('suit le message traduit quand le serveur l’a gardé', () => {
    const m = messageDEchec(
      { error: 'erreur_fournisseur', motif: 'Invalid model parameter' }, tr,
    );
    expect(m).toBe(`${fr['assistantIa.err.erreur_fournisseur' as keyof typeof fr]} Motif donné par le fournisseur : « Invalid model parameter »`);
  });

  it('sans motif (serveur plus ancien, ou motif vide) : le message seul, comme avant', () => {
    expect(messageDEchec({ error: 'quota' }, tr)).toBe(tr('assistantIa.err.quota'));
    expect(messageDEchec({ error: 'quota', motif: '   ' }, tr)).toBe(tr('assistantIa.err.quota'));
    expect(messageDEchec({ error: 'quota', motif: 42 }, tr)).toBe(tr('assistantIa.err.quota'));
  });

  it('la clé sans espace de travail a son propre message', () => {
    expect(cleDEchec('cle_sans_espace_de_travail')).toBe('assistantIa.err.cle_sans_espace_de_travail');
    expect(messageDEchec({ error: 'cle_sans_espace_de_travail' }, tr))
      .toContain('n’est rattachée à aucun espace de travail');
  });

  it('les écrans de l’assistant passent par messageDEchec', () => {
    for (const f of ['AssistantIaReglagesV2', 'SuggestionsIaAlbumV2', 'SuggestionsIaLotV2', 'PlaylistParPhraseV2']) {
      const src = readFileSync(new URL(`../../components/v2/${f}.svelte`, import.meta.url), 'utf8');
      expect(src, f).toContain('messageDEchec(');
      expect(src, f).not.toMatch(/\$t\(cleDEchec\(\w+\.error\)/);
    }
  });

  it('les deux libellés existent dans les 12 langues', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      expect(d['assistantIa.err.cle_sans_espace_de_travail'], l).toBeTruthy();
      expect(d['assistantIa.err.motif'], l).toContain('{motif}');
    }
  });
});
