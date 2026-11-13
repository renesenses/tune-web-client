/**
 * tune-server-rust#8625 (fil 2787, Pierre M) — décision de Bertrand du
 * 13/11 : des totaux cohérents. Statistiques, la barre d'état d'Oxygen et le
 * compte provisoire de Titres lisent `library_totals` (le total des listes),
 * plus le compte des tables ; l'écart restant est expliqué en infobulle.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireTotaux, infobulleTotaux } from '../totauxBibliotheque';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
import fr from '../locales/fr';

const lire = (chemin: string) => readFileSync(resolve(process.cwd(), chemin), 'utf-8');

// Les nombres de Pierre M (fil 2787).
const STATS = {
  tracks: 156008,
  albums: 10403,
  artists: 3000,
  library_totals: {
    tracks: 155539,
    albums: 9494,
    stored_tracks: 156008,
    stored_albums: 10403,
    hidden_or_duplicate_tracks: 469,
    hidden_or_duplicate_albums: 909,
  },
};

describe('#8625 — un seul total pour tous les écrans', () => {
  it('🔴 les totaux affichés sont ceux des listes, pas des tables', () => {
    const t = lireTotaux(STATS);
    expect(t.tracks).toBe(155539);
    expect(t.albums).toBe(9494);
    expect(t.hidden_or_duplicate_tracks).toBe(469);
  });

  it('un serveur d’avant #8625 : repli sur le compte des tables, sans écart', () => {
    const t = lireTotaux({ tracks: 12, albums: 3 });
    expect(t).toMatchObject({ tracks: 12, albums: 3, hidden_or_duplicate_tracks: 0, hidden_or_duplicate_albums: 0 });
    expect(lireTotaux(null).tracks).toBe(0);
  });

  it('l’infobulle explique l’écart avec les nombres des tables', () => {
    const tr = (c: string) => (fr as Record<string, string>)[c] ?? c;
    const texte = infobulleTotaux(lireTotaux(STATS), tr, (n) => String(n));
    expect(texte).toContain('156008');
    expect(texte).toContain('469');
    expect(texte).toContain('909');
    expect(texte).not.toContain('{');
    // Sans écart : la phrase de base seule.
    expect(infobulleTotaux(lireTotaux({ tracks: 1, albums: 1 }), tr, String)).toBe(fr['bibliotheque.totaux.infobulle']);
  });

  it('les quatre phrases existent dans les quinze langues, paramètres compris', () => {
    for (const langue of ONZE_LANGUES) {
      const d = dictionnaire(langue);
      expect(d['bibliotheque.totaux.infobulle'], langue).toBeTruthy();
      expect(d['bibliotheque.totaux.infobulleEcart'], langue).toMatch(/\{storedTracks\}[\s\S]*\{hiddenAlbums\}|\{hiddenAlbums\}[\s\S]*\{storedTracks\}/);
      expect(d['bibliotheque.albums.infobulleCartes'], langue).toContain('{shown}');
      expect(d['bibliotheque.albums.infobulleCartes'], langue).toContain('{total}');
      expect(d['bibliotheque.dossiers.infobulle'], langue).toBeTruthy();
    }
  });

  it('🔴 Statistiques, Oxygen et Titres lisent library_totals', () => {
    expect(lire('src/components/v2/StatsBibliothequeV2.svelte')).toContain('totauxListes = lireTotaux(s);');
    expect(lire('src/components/v2-heritage/OxygenView.svelte')).toContain('const tot = lireTotaux(st);');
    const bib = lire('src/components/v2/LibraryV2.svelte');
    expect(bib).toContain('nbPistesServeur = lireTotaux(st).tracks;');
    expect(bib).not.toContain('nbPistesServeur = st?.tracks');
    expect(bib).toContain('title={infobulleTout}');
    // « Tout », liste entière et sans filtre : le total du serveur, pas les cartes.
    expect(bib).toContain('nu ? ($albumsPagines.total ?? 0) : !depot && toutActif ? $albums.length : affiches.length');
    // « Tout », liste entière et sans filtre : le total du serveur, pas les cartes.
    expect(bib).toMatch(/nu \? \(\$albumsPagines\.total \?\? 0\) : !depot && toutActif \? \$albums\.length : affiches\.length/);
    expect(lire('src/components/partages/OxygenFolderFacet.svelte')).toContain("$t('bibliotheque.dossiers.infobulle' as any)");
  });
});
