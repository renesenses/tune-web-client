/**
 * Recette rc12 (13/11/2026) — Bertrand : « Harmonise la localisation de la
 * zone de recherche dans tous les écrans. »
 *
 * LA règle : un seul composant (`ChampRecherche`), dans l'en-tête de l'écran,
 * en PREMIER dans sa grappe d'actions (avant onglets et boutons). Sous 780 px,
 * il prend toute la largeur sous le titre (`styles/tune-v2.css`).
 *
 * Cette garde :
 * 1. chaque écran listé importe ET emploie le composant partagé ;
 * 2. plus aucun écran ne recopie le balisage `.v2-rech` (hors exceptions
 *    nommées ci-dessous, chacune avec sa raison) ;
 * 3. dans un en-tête d'écran, le champ vient avant onglets et boutons ;
 * 4. la règle étroite (< 780 px) est dans la feuille partagée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';

const lire = (f: string) => readFileSync(f, 'utf8');
const balisage = (f: string) => { const s = lire(f); const i = s.lastIndexOf('<style'); return i < 0 ? s : s.slice(0, i); };

/** Les écrans à recherche, et où le champ se pose. */
const ECRANS: Record<string, 'entete' | 'barre' | 'panneau' | 'rangee-radios'> = {
  'src/components/v2/LibraryV2.svelte': 'entete',            // Albums, Artistes, Titres, Genres, Compositeurs…
  'src/components/v2/FavoritesV2.svelte': 'entete',
  'src/components/v2/PlaylistsV2.svelte': 'entete',
  'src/components/v2/PodcastsV2.svelte': 'entete',           // Mes abonnements
  'src/components/v2/MediaServersV2.svelte': 'entete',
  'src/components/v2/StreamingV2.svelte': 'entete',          // Qobuz, TIDAL, Bandcamp, YouTube…
  'src/components/v2/PluginsV2.svelte': 'entete',
  'src/components/v2/CollectionPhysiqueV2.svelte': 'entete',
  'src/components/v2-heritage/OxygenView.svelte': 'barre',   // l'en-tête d'Oxygen est sa barre
  'src/components/v2-heritage/PlaylistManagerView.svelte': 'barre',
  'src/components/v2/ConverterV2.svelte': 'panneau',         // filtre du sélecteur d'albums
  'src/components/v2/DeclickV2.svelte': 'panneau',
  'src/components/v2/RadioRecherche.svelte': 'rangee-radios', // Mes radios + Annuaire
  // Décisions de Bertrand, 14/11 : cinq écrans de liste reçoivent la zone.
  'src/components/v2/HistoriqueV2.svelte': 'entete',
  'src/components/v2/CollectionsV2.svelte': 'entete',
  'src/components/v2/TitresBannisV2.svelte': 'entete',
  'src/components/v2-heritage/BrowseView.svelte': 'barre',
  'src/components/v2-heritage/SmartPlaylistsView.svelte': 'barre',
};

describe('un seul champ de recherche, le même partout', () => {
  it('chaque écran listé importe et emploie ChampRecherche', () => {
    const fautifs: string[] = [];
    for (const f of Object.keys(ECRANS)) {
      const s = lire(f);
      if (!/import ChampRecherche from '(\.\/|\.\.\/v2\/)ChampRecherche\.svelte'/.test(s)) fautifs.push(`${f} : import`);
      if (!balisage(f).includes('<ChampRecherche')) fautifs.push(`${f} : balise`);
    }
    expect(fautifs).toEqual([]);
  });

  it('Radios passe par RadioRecherche, donc par le champ partagé', () => {
    expect(lire('src/components/v2/RadiosV2.svelte')).toContain('<RadioRecherche');
    expect(lire('src/components/v2/RadioAnnuaire.svelte')).toContain('<RadioRecherche');
  });

  it('🔴 plus aucun écran ne recopie le balisage `.v2-rech`', () => {
    // Exceptions : le composant lui-même ; la carte de découverte (radios,
    // podcasts), dont le champ LOCALISE un pays sur la carte à Entrée.
    const permis = new Set(['src/components/v2/ChampRecherche.svelte', 'src/components/v2/CarteDecouverte.svelte']);
    const fautifs = [...globSync('src/components/**/*.svelte')]
      .filter((f) => !permis.has(f) && /class="v2-rech[^"]*"[^>]*>\s*<svg/.test(balisage(f)));
    expect(fautifs).toEqual([]);
  });

  it('dans l’en-tête, le champ vient AVANT onglets et boutons', () => {
    const fautifs: string[] = [];
    for (const [f, ou] of Object.entries(ECRANS)) {
      if (ou !== 'entete') continue;
      const blocs = balisage(f).match(/<header class="v2-top[^"]*"[^>]*>[\s\S]*?<\/header>/g) ?? [];
      const bloc = blocs.find((b) => b.includes('<ChampRecherche'));
      if (!bloc) { fautifs.push(`${f} : pas dans header.v2-top`); continue; }
      const actions = bloc.indexOf('class="v2-actions');
      const rech = bloc.indexOf('<ChampRecherche');
      if (actions < 0 || rech < actions) fautifs.push(`${f} : hors de .v2-actions`);
      for (const apres of ['class="v2-btn', 'class="tabs"', '<nav class="tabs', 'class="tab"', 'class="meta"', '<BoutonMenuV2']) {
        const i = bloc.indexOf(apres, actions);
        if (i >= 0 && i < rech) fautifs.push(`${f} : ${apres} avant la recherche`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it('la Bibliothèque n’a plus de champ dans la rangée des filtres', () => {
    const s = balisage('src/components/v2/LibraryV2.svelte');
    const filtres = s.slice(s.indexOf('<div class="filters">'));
    expect(filtres.includes('<ChampRecherche')).toBe(false);
    // Le raccourci « / » et la frappe directe (#1872) gardent leur champ.
    expect(s).toMatch(/<ChampRecherche[^>]*bind:champ=\{champRecherche\}[^>]*raccourci="\/"/);
  });

  it('sous 780 px : toute la largeur, sous le titre — une règle, dans la feuille', () => {
    const css = lire('src/styles/tune-v2.css');
    const bloc = css.slice(css.indexOf('@media (max-width:779px)'));
    expect(bloc).toMatch(/\.v2-top:has\(> \.v2-actions > \.v2-rech\)\{flex-wrap:wrap/);
    expect(bloc).toMatch(/\.v2-actions > \.v2-rech\{flex:1 1 100%/);
  });

  it('l’invite existe dans les quinze langues, avec son {ecran}', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const m = lire(`src/lib/locales/${l}.ts`).match(/"v2\.rech\.dans": "([^"]+)"/);
      expect(m, l).not.toBeNull();
      expect(m![1], l).toContain('{ecran}');
    }
  });
});
