/**
 * #1059 — « il manque le widget des playlist Qobuz "Humeurs" » (FabienM, fil
 * 1812, point 6, 16/09/2026), puis, du même testeur, quatre-vingts minutes
 * plus tard (réponse 6277) :
 *
 * > « je me suis aperçu que le widget "Humeurs" était DÉJÀ SÉLECTIONNÉ, si je
 * > le retire il apparaît bien dans la liste des widgets disponibles »
 *
 * Rien ne manquait. Ce qui manquait, c'est de pouvoir le SAVOIR : l'écran
 * d'ajout ne montre que ce qui n'est pas déjà posé, et ne dit pas pourquoi un
 * widget n'y figure pas. Déjà placé et inexistant y sont indiscernables.
 *
 * Et le cas voisin, lui, n'est pas résolu par le testeur : un identifiant de
 * la disposition que le catalogue ne rend pas — une catégorie de playlists
 * Qobuz tombée en silence côté serveur — n'est NI affiché, NI proposé.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { repartirWidgets } from '../ajoutWidgets';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const vue = () => lire('../../components/v2/PageWidgets.svelte');

/** Quatre catégories Qobuz, comme `by-tag` les rend. */
const catalogue = [
  { id: 'qobuz-tag-hi-res' },
  { id: 'qobuz-tag-new' },
  { id: 'qobuz-tag-mood' },   // « Humeurs »
  { id: 'qobuz-tag-focus' },
];

describe('#1059 — les trois populations de l’écran d’ajout', () => {
  it('🔴 « Humeurs » déjà posée n’est pas perdue : elle est PLACÉE', () => {
    // Le cas de Fabien, à la lettre : `mood` est dans sa disposition, donc
    // absent des disponibles — mais il doit rester NOMMÉ quelque part.
    const r = repartirWidgets(catalogue, ['qobuz-tag-mood', 'qobuz-tag-new']);
    expect(r.disponibles.map((w) => w.id)).toEqual(['qobuz-tag-hi-res', 'qobuz-tag-focus']);
    expect(r.places.map((w) => w.id)).toEqual(['qobuz-tag-new', 'qobuz-tag-mood']);
    expect(r.inconnus).toEqual([]);
  });

  it('🔴 un identifiant que le catalogue ne nomme pas est un FANTÔME nommé', () => {
    // Ni rendu (`parId` ne le trouve pas), ni proposé (il n'est pas dans le
    // catalogue) : sans cette liste, l'utilisateur n'a plus aucun geste.
    const r = repartirWidgets(catalogue, ['qobuz-tag-mood', 'qobuz-tag-disparu']);
    expect(r.inconnus).toEqual(['qobuz-tag-disparu']);
    expect(r.places.map((w) => w.id)).toEqual(['qobuz-tag-mood']);
  });

  it('les fantômes viennent dans l’ORDRE DE LA DISPOSITION', () => {
    // C'est là que l'utilisateur les cherche : à la place qu'il leur a donnée.
    const r = repartirWidgets(catalogue, ['z-inconnu', 'qobuz-tag-mood', 'a-inconnu']);
    expect(r.inconnus).toEqual(['z-inconnu', 'a-inconnu']);
  });

  it('un doublon de disposition ne fabrique pas deux fantômes', () => {
    // Deux cartes portant la même clé `{#each}` : Svelte refuse.
    const r = repartirWidgets(catalogue, ['x', 'x']);
    expect(r.inconnus).toEqual(['x']);
  });

  it('une page vide propose tout et ne place rien', () => {
    const r = repartirWidgets(catalogue, []);
    expect(r.disponibles).toHaveLength(4);
    expect(r.places).toEqual([]);
    expect(r.inconnus).toEqual([]);
  });

  it('un catalogue vide ne propose rien, et garde les fantômes', () => {
    // C'est l'état d'une page dont le service n'a rien servi ce jour-là.
    const r = repartirWidgets([], ['qobuz-tag-mood']);
    expect(r.disponibles).toEqual([]);
    expect(r.places).toEqual([]);
    expect(r.inconnus).toEqual(['qobuz-tag-mood']);
  });
});

describe('#1059 — l’écran s’en sert vraiment', () => {
  it('🔴 il MONTRE les widgets déjà posés, grisés', () => {
    const src = vue();
    expect(
      src.includes('{#each reparti.places as w (w.id)}'),
      'l’écran d’ajout cache encore ce qui est déjà sur la page : son absence '
        + 'de la liste reste indiscernable d’un widget qui n’existe pas.',
    ).toBe(true);
    expect(src.includes("$t('v2.home.alreadyPlaced' as any)"), 'rien ne dit POURQUOI il est inerte').toBe(true);
    expect(src.includes('.posee{'), 'la pastille posée n’a pas d’habillage').toBe(true);
    // 🔴 Elle n'est PAS une `.puce` : le témoin de #1139 compte les bandes
    // proposées à l'ajout par ce sélecteur, et une pastille inerte n'en est pas.
    expect(src.includes('class="puce posee"'), 'la pastille posée est comptée comme proposée').toBe(false);
  });

  it('🔴 le bouton « Ajouter » ne se verrouille plus quand tout est posé', () => {
    // Fabien n'aurait rien vu de plus : la porte même était close. C'est
    // pourtant l'état où la liste des posés est la seule chose à lire.
    const src = vue();
    expect(
      src.includes('disabled={!catalogueComplet.length}'),
      'le bouton reste désactivé dès que rien n’est « disponible ».',
    ).toBe(true);
    expect(src.includes('disabled={!disponibles.length}')).toBe(false);
  });

  it('🔴 un identifiant inconnu du catalogue cesse d’être invisible', () => {
    const src = vue();
    expect(
      src.includes('{:else if edition}'),
      'un identifiant que le catalogue ne nomme pas n’est toujours ni rendu, '
        + 'ni retirable : `{#if w}` le laisse tomber sans un mot.',
    ).toBe(true);
    expect(src.includes('class="bloc absent"'), 'la carte du fantôme a disparu').toBe(true);
    expect(src.includes('.bloc.absent h2{'), 'la carte du fantôme n’a pas d’habillage').toBe(true);
  });
});

describe('#1059 — la clé nouvelle est dans les ONZE dictionnaires', () => {
  const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];
  it('aucune ne manque, aucune n’est vide', () => {
    expect(LANGUES).toHaveLength(11);
    for (const lg of LANGUES) {
      const src = lire(`../locales/${lg}.ts`);
      const m = src.match(/"v2\.home\.alreadyPlaced":\s*"([^"]*)"/);
      expect(m, `« ${lg} » n’a pas la clé`).not.toBe(null);
      expect((m?.[1] ?? '').trim().length, `« ${lg} » a la clé, vide`).toBeGreaterThan(0);
    }
  });
});
