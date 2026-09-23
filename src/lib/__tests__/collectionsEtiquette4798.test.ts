import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * #4798, second volet — un DOSSIER et une collection INTELLIGENTE portent des
 * étiquettes, et l'écran Étiquettes sait les relire.
 *
 * Relevé pendant #4798 : `CollectionsV2` montait déjà `PochetteActions` avec
 * `itemType: 'collection' | 'smart_collection'`, et le serveur répondait 400
 * (« types admis : … »). Il les sert depuis renesenses/tune-server-rust#4798
 * (second volet), avec deux routes de lecture à part.
 *
 * ## Le piège que ces gardes ferment
 *
 * Un dossier (réglage JSON `collections`) et une collection intelligente
 * (table `smart_collections`) partagent leurs identifiants : l'id 1 est à la
 * fois « favorites » et « Audiophile » sur le serveur de Bertrand. La sorte
 * doit donc rester distincte PARTOUT — `item_type`, route de lecture, clé de
 * liste, clé de raccourci — et venir de la ROUTE qui a rendu la ligne, jamais
 * du numéro.
 *
 * ⚠️ Ces tests lisent la SOURCE : ils empêchent des régressions précises, ils
 * ne prouvent pas que l'onglet s'affiche à l'écran.
 */
const lire = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf-8');

describe('Collections — l’écran pose déjà les DEUX types distincts', () => {
  it('la pochette envoie collection / smart_collection, jamais un type unique', () => {
    const vue = lire('components/v2/CollectionsV2.svelte');
    expect(vue).toContain("itemType: e.sorte === 'smart' ? 'smart_collection' : 'collection'");
  });
});

describe('Collections — la lecture par étiquette a DEUX routes', () => {
  const api = lire('lib/api.ts');

  it.each([
    ['getTagCollections', 'collections'],
    ['getTagSmartCollections', 'smart-collections'],
  ])('%s vise /tags/{id}/%s', (fn, chemin) => {
    expect(api).toContain(`export function ${fn}(tagId: number)`);
    const i = api.indexOf(`export function ${fn}(`);
    expect(api.slice(i, i + 400)).toContain(`/tags/\${tagId}/${chemin}`);
  });
});

describe('Écran Étiquettes — un onglet Collections, cliquable vers le détail', () => {
  const etiquettes = lire('components/v2/EtiquettesV2.svelte');

  it('lit les deux routes et marque les intelligentes par leur ROUTE', () => {
    expect(etiquettes).toContain('api.getTagCollections(tag.id!)');
    expect(etiquettes).toContain('api.getTagSmartCollections(tag.id!)');
    expect(etiquettes).toContain("(sc?.smart_collections ?? []).map((x: any) => ({ ...x, smart: true }))");
    // Les dossiers ne sont PAS marqués : la sorte est celle de la route.
    expect(etiquettes).toContain('...(co?.collections ?? []),');
  });

  it('a son onglet, son compteur et son message de vide', () => {
    expect(etiquettes).toContain("{ id: 'dossiers', cle: 'v2.nav.collections' }");
    expect(etiquettes).toContain('dossiers: dossiers.length');
    expect(etiquettes).toContain("$t('v2.tags.noCollectionWithTag' as any)");
  });

  it('la clé de liste porte la sorte : deux ids égaux ne se disputent pas la ligne', () => {
    expect(etiquettes).toContain('{#each dossiers as c (c.smart ? `sc-${c.id}` : `c-${c.id}`)}');
  });

  it('ouvrir mène à l’écran Collections, sous SA clé de raccourci', () => {
    expect(etiquettes).toContain('ouvrirCollection({ id: c.id, name: nom, smart: !!c.smart })');
    const brique = lire('lib/ouvrirParRaccourci.ts');
    expect(brique).toContain('export function ouvrirCollection(');
    // `smartcollections:` pour l'intelligente, `collections:` pour le dossier
    // — les deux préfixes que `CollectionsV2` apparie avec la sorte.
    expect(brique).toContain("`${c.smart ? 'smartcollections' : 'collections'}:${c.id}`");
    const collections = lire('components/v2/CollectionsV2.svelte');
    expect(collections).toContain("(x.sorte === 'smart') === smart");
  });

  it('le nom d’une collection du semis passe par le libellé traduit', () => {
    // Les seize collections livrées sont nommées en français en base ; le
    // serveur joint `name_key`, et c'est le même helper que l'écran
    // Collections qui la rend dans la langue du client.
    expect(etiquettes).toContain('collectionNomAffiche(c, (k) => $t(k as any))');
  });
});

describe('La clé i18n existe dans les onze langues', () => {
  it.each(['fr', 'en', 'de', 'es', 'it', 'ro', 'sv', 'hu', 'ja', 'ko', 'zh'])('%s', (l) => {
    expect(lire(`lib/locales/${l}.ts`)).toContain('"v2.tags.noCollectionWithTag":');
  });
});
