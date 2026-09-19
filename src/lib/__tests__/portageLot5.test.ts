import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ajouterLaBoutique } from '../catalogueGreffons';

/**
 * Lot 5 du portage (phase 5) — les manques révélés par la REMESURE sur main
 * après les lots 1 à 4. Une première vérification les avait crus couverts :
 * la boucle zsh ne découpait pas la liste, et `grep` avait tout déclaré trouvé.
 */
const lire = (f: string) => readFileSync(f, 'utf8');
const corps = (src: string, nom: string) => {
  const i = src.indexOf(`async function ${nom}(`);
  expect(i, `fonction introuvable : ${nom}`).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('\n  }\n', i));
};
const avant = (c: string, a: string, b: string) => {
  const i = c.indexOf(a);
  expect(i, `absent : ${a}`).toBeGreaterThan(-1);
  expect(i, `${a} doit précéder ${b}`).toBeLessThan(c.indexOf(b));
};

describe('radios : supprimer, importer, exporter', () => {
  const M = lire('src/components/v2/RadioEditModale.svelte');
  const R = lire('src/components/v2/RadiosV2.svelte');
  it('🔴 supprimer une station demande confirmation, dangereuse, AVANT l’appel', () => {
    const c = corps(M, 'supprimer');
    avant(c, 'dialogs.confirm(', 'api.deleteRadio(');
    expect(c).toContain('{ danger: true }');
    expect(R).toContain('onDeleted={(id) => { radios = radios.filter((x) => x.id !== id);');
  });
  it('import M3U et export sont offerts', () => {
    expect(R).toContain('onchange={importerM3u}');
    expect(corps(R, 'importerM3u')).toContain('api.importRadios(f)');
    expect(R).toContain('href={api.exportRadiosUrl()}');
  });
});

describe('Radio France avec clé : stations, recherche, épisodes', () => {
  const P = lire('src/components/v2/PodcastsV2.svelte');
  it('🔴 la clé est DEMANDÉE au serveur, pas déduite d’un refus (#1026)', () => {
    expect(P).toContain('etatSourceRadioFrance(config)');
    expect(P).toContain('if (etat.interrogerLesEmissions) void chargerEmissionsRf(rfStation);');
  });
  it('recherche et épisodes passent par leurs routes ; un flux s’ouvre comme un podcast', () => {
    expect(corps(P, 'chercherRf')).toContain('api.searchRadioFranceShows(rfRecherche)');
    const c = corps(P, 'ouvrirEmissionRf');
    expect(c).toContain('if (show.rss_url) { void openPodcast(');
    expect(c).toContain('api.getRadioFranceEpisodes(show.url, 30)');
  });
});

describe('greffons : boutique, mise à jour, désinstallation', () => {
  const G = lire('src/components/v2/PluginsV2.svelte');
  it('🔴 la désinstallation suit l’ORIGINE du greffon', () => {
    expect(G).toContain('p.marketplace ? api.uninstallMarketplacePlugin(p.slug ?? p.name) : api.uninstallPlugin(p.name)');
  });
  it('la mise à jour annoncée a enfin son geste', () => {
    expect(G).toMatch(/\{#if p\.update_available\}\s*<button class="lnk"[^>]*onclick=\{\(\) => mettreAJour\(p\)\}/);
    expect(G).toContain('api.updatePlugin(p.name)');
  });
  it('ajouterLaBoutique : ne double pas un greffon connu, marque le non-wasm incompatible', () => {
    const locaux = [{ name: 'eq', slug: 'eq' }] as any;
    const r = ajouterLaBoutique(locaux, [
      { slug: 'eq', platforms: 'wasm' }, { slug: 'x', platforms: 'wasm' }, { slug: 'y', platforms: 'python' },
      { slug: 'z', installed: true, platforms: 'wasm' },
    ]);
    expect(r.map((p: any) => p.slug)).toEqual(['eq', 'x', 'y']);
    expect((r[1] as any).compatible).toBe(true);
    expect((r[2] as any).compatible).toBe(false);
    expect((r[1] as any).marketplace).toBe(true);
  });
});

describe('Bandcamp : collection manquante, discographie d’un artiste', () => {
  const S = lire('src/components/v2/StreamingV2.svelte');
  const B = lire('src/components/v2/BandcampManquantsV2.svelte');
  it('toute la collection, face à toute la bibliothèque, trois verdicts', () => {
    expect(corps(B, 'analyser')).toContain('api.bandcampAllCollection(), api.getAllAlbums()');
    expect(B).toContain("rapprocher(collection.filter((c) => c.type === 'album')");
    expect(S).toContain('<BandcampManquantsV2 />');
  });
  it('🔴 les artistes de la recherche ne sont plus jetés, et ouvrent leur discographie', () => {
    expect(S).toContain('{#each bcSearch.artistes as a (a.url)}');
    expect(corps(S, 'ouvrirArtisteBc')).toContain('api.bandcampArtist(url)');
  });
});

describe('Bibliothèque, Zones, fiche album', () => {
  it('la tranche DR filtre, et ne paraît que si des albums portent un DR', () => {
    const L = lire('src/components/v2/LibraryV2.svelte');
    expect(L).toMatch(/if \(dr == null\) return false;\s*if \(fDrMin != null && dr < fDrMin\) return false;\s*if \(fDrMax != null && dr > fDrMax\) return false;/);
    expect(L).toMatch(/\{#if hasDr\}\s*<span class="chip dr"/);
  });
  it('🔴 supprimer toutes les zones exige une confirmation dangereuse AVANT l’appel', () => {
    const c = corps(lire('src/components/v2/ZonesV2.svelte'), 'supprimerToutesLesZones');
    avant(c, 'dialogs.confirm(', 'api.deleteAllZones()');
    expect(c).toContain('{ danger: true }');
  });
  it('une piste lancée seule reçoit SA proposition de qualité', () => {
    const A = lire('src/components/v2/AlbumDetailV2.svelte');
    expect(A).toContain('if (piste?.id != null) void proposerMeilleureQualitePiste(piste.id);');
    expect(corps(A, 'proposerMeilleureQualitePiste')).toContain('api.trackBetterQuality(trackId)');
  });
});
