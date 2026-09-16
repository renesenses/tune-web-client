/**
 * #956 — « impossible d'ouvrir la fiche artiste. Lorsque je clique sur le nom
 * de l'artiste depuis un album Qobuz, cela me renvoie systématiquement sur la
 * liste des albums » (Sandro, v0.9.150). Fabien, fil 1774, point 15 : « cela
 * renvoie à la page d'accueil ».
 *
 * La cause, mesurée sur la .18 : l'album Qobuz porte `artist_id: "610403"`,
 * et trois gestes « Aller à l'artiste » lisaient `artist_id != null` comme
 * « artiste de bibliothèque » → `pendingLibraryArtist.set("610403")` +
 * `activeView.set('library')`. Le routage est désormais tranché par
 * `destinationArtiste`, et la coquille ouvre la fiche de service DIRECTEMENT
 * quand l'identifiant est là — sans résoudre le nom par une recherche.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

const SITES = [
  'src/components/v2/AlbumDetailV2.svelte',
  'src/components/v2/PisteActions.svelte',
  'src/components/partages/MenuPisteV1.svelte',
];

describe('#956 — les trois gestes « Aller à l’artiste » passent par le routage', () => {
  for (const f of SITES) {
    it(`${f.split('/').pop()} : \`destinationArtiste\` tranche, et \`artist_id != null\` ne décide plus`, () => {
      const src = sansCommentaires(lire(f));
      expect(src).toContain('destinationArtiste({');
      expect(src).toContain("destination?.type === 'artiste'");
      expect(src).toContain("destination.type === 'artiste-service'");
      // Le piège d'origine : un identifiant non nul envoyé dans la Bibliothèque.
      expect(src).not.toMatch(/artist_id != null\s*\)\s*\{?\s*\n?\s*pendingLibraryArtist/);
      expect(src).not.toMatch(/pendingLibraryArtist\.set\((piste|album)\.artist_id/);
    });
  }
  it('AlbumDetailV2 route avec le SERVICE de la fiche, car `album.source` est nul chez Qobuz', () => {
    const src = sansCommentaires(lire(SITES[0]));
    expect(src).toContain("source: service ?? (album as any).source ?? null");
  });
  it('🔴 la coquille ouvre la fiche directement quand l’identifiant est là', () => {
    const src = sansCommentaires(lire('src/components/v2/ShellV2.svelte'));
    const fn = src.slice(src.indexOf('async function ouvrirArtisteServiceParNom'), src.indexOf('resoudreArtisteDeService(c'));
    expect(fn).toContain("c.id != null");
    expect(fn).toContain("ficheArtisteService.set({ service: c.service as any, id: String(c.id).trim(), nom: c.nom })");
    expect(fn).toContain("activeView.set('streamingartist')");
    expect(lire('src/lib/stores/navigation.ts')).toContain('ouvrirArtiste: (cible: { service: string; nom: string; id?: string | null }) => void;');
  });
  it('la lecture en cours traite aussi le nouveau cas', () => {
    const src = sansCommentaires(lire('src/components/partages/NowPlaying.svelte'));
    expect(src).toContain("if (dest.type === 'artiste-service')");
    expect(src).toContain('gestesService.ouvrirArtiste({ service: dest.service, nom: dest.nom, id: dest.id })');
  });
});
