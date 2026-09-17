// Fabien, fil 1780 « 0.9.151 : v1 divers bugs » (16/09/2026) — les sept points
// d'interface traités dans un même lot. Issues ouvertes par le tri :
// #1056 (Tout lire / Aléatoire sur Favoris › Pistes), #1057 (vignettes en
// mode tableau : Favoris › Pistes et playlist Qobuz), #1058 (onglets du
// gestionnaire de playlists en colonne), #1061 (« Lire à partir d'ici »),
// #1062 (favoris Qobuz en liste), #1063 (artiste favori cliquable), et le
// point 3 (bouton logs/diagnostic dans Réglages › Système).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lireListeDepuis } from '../lectureEnMasse';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sans = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('« Lire à partir d’ici » (#1061)', () => {
  it('lance la liste depuis l’index, tête puis reste, sans toucher aux pistes d’avant', async () => {
    const liste = [
      { id: 1, title: 'a', source: 'local' },
      { id: null, title: 'b', source: 'qobuz', source_id: 'q2' },
      { id: null, title: 'c', source: 'qobuz', source_id: 'q3' },
    ] as any[];
    const lus: any[] = []; const enfiles: any[] = [];
    const n = await lireListeDepuis(liste, 1, { lire: async (c) => { lus.push(c); }, enfiler: async (c) => { enfiles.push(c); } });
    expect(n).toBe(2);
    expect(lus).toHaveLength(1);
    expect(lus[0]).toMatchObject({ source: 'qobuz', source_id: 'q2' });
    expect(enfiles).toHaveLength(1);
    expect(JSON.stringify(enfiles[0])).toContain('q3');
    expect(JSON.stringify([lus, enfiles])).not.toContain('"id":1');
  });
  it('un index hors liste ne lance rien', async () => {
    const n = await lireListeDepuis([{ id: 1, source: 'local' }] as any, 5, { lire: async () => {}, enfiler: async () => {} });
    expect(n).toBe(0);
  });
});

describe('les écrans', () => {
  it('Favoris › Pistes : vignettes, Tout lire / Aléatoire, lecture depuis la ligne (#1056, #1057, #1061)', () => {
    const s = sans(lire('src/components/v2/FavoritesV2.svelte'));
    expect(s).toMatch(/<ListePistesV2 pistes=\{vTracks\} numerotation="aucune" pochetteEnTableau/);
    expect(s).toMatch(/onLire=\{\(_p, i\) => lireDepuis\(i\)\}/);
    expect(s).toContain("lireListeAleatoire(vTracks as any, gestes(zid))");
    expect(s).toContain("lireListe(vTracks as any, gestes(zid))");
    expect(s).toMatch(/\{#if tab === 'tracks' && vTracks\.length\}[\s\S]{0,400}collections\.playAll/);
  });
  it('Favoris › Artistes : la pochette ET le nom ouvrent la fiche (#1063)', () => {
    const s = sans(lire('src/components/v2/FavoritesV2.svelte'));
    expect(s).toContain('onOuvrir={() => ouvrirArtisteFavori(a)}');
    expect(s).toMatch(/<button class="an" title=\{a\.name\} onclick=\{\(\) => ouvrirArtisteFavori\(a\)\}>/);
    // Local → fiche locale ; service → fiche du service ; sinon par le nom.
    expect(s).toMatch(/if \(a\?\.id != null\) \{ void ouvrirArtiste\(a\.id\); return; \}/);
    expect(s).toContain("ficheArtisteService.set({ service: a.source, id: String(a.source_id), nom: a.name ?? '' })");
  });
  it('Streaming › favoris : les titres en liste avec actions, lecture depuis la ligne (#1062)', () => {
    const s = sans(lire('src/components/v2/StreamingV2.svelte'));
    expect(s).toMatch(/<ListePistesV2 pistes=\{favTracks as any\} numerotation="aucune" avecAlbum pochetteEnTableau/);
    expect(s).not.toMatch(/\{#each favTracks as tr[^}]*\}\{@render tile\(/);
  });
  it('Playlist ouverte : vignettes en mode tableau (#1057)', () => {
    const s = sans(lire('src/components/v2/PlaylistDetailV2.svelte'));
    expect(s).toMatch(/<ListePistesV2 pistes=\{pistesVues\} pochetteEnTableau/);
  });
  it('Gestionnaire de playlists : UNE racine en colonne (#1058)', () => {
    const s = sans(lire('src/components/v2-heritage/PlaylistManagerView.svelte'));
    const tpl = s.slice(s.indexOf('</script>'), s.indexOf('<style>'));
    expect(tpl.trim().startsWith('</script>')).toBe(true);
    const corps = tpl.replace('</script>', '').trim();
    expect(corps.startsWith('<div class="pm-racine">')).toBe(true);
    expect(corps.endsWith('</div>')).toBe(true);
    expect(s).toMatch(/\.pm-racine \{ display: flex; flex-direction: column;/);
  });
  it('Réglages › Système : logs et diagnostic par les mêmes fonctions que l’ancien écran (point 3)', () => {
    const s = sans(lire('src/components/v2/SettingsV2.svelte'));
    expect(s).toContain("import { telechargerJournaux } from '../../lib/journaux';");
    expect(s).toContain('await api.downloadDiagnosticsBundle()');
    expect(s).toMatch(/onclick=\{telechargerLesJournaux\}[\s\S]{0,120}settings\.downloadLogs/);
    expect(s).toMatch(/onclick=\{telechargerLeDiagnostic\}[\s\S]{0,160}settings\.downloadDiag/);
  });
});
