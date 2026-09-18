/**
 * #1156 — le dossier d'origine au Convertisseur (Tades, fil 1677).
 *
 * 🔴 Ce témoin remplace `dossierDAlbum1156.test.ts`, et le module qu'il
 * gardait a été SUPPRIMÉ. `src/lib/dossierAlbum.ts` existait déjà sur `main`
 * (`ab663b83`, « Localiser un album sur le disque »), exportait les deux
 * mêmes noms — `dossierDuFichier`, `dossierDeLAlbum` — et servait déjà la
 * fiche album. J'en avais écrit un second à une lettre du premier sans le
 * chercher. Deux modules qui divergent valent moins qu'un seul.
 *
 * La mécanique du dossier est donc gardée par `localiserSurLeDisque.test.ts`,
 * là où elle vit. Ici, uniquement ce que le Convertisseur en fait.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const vue = readFileSync('src/components/v2/ConverterV2.svelte', 'utf8');

describe('#1156 — le Convertisseur dit d\'où viennent les albums retenus', () => {
  it('il affiche le dossier, et passe par le module PARTAGÉ', () => {
    expect(vue).toContain('v2.conv.sourceFolder');
    expect(vue).toContain("from '../../lib/dossierAlbum'");
    expect(vue).toContain('dossiersRetenus');
    // 🔴 Contre-épreuve : le doublon ne doit pas revenir. Bornée à
    // l'IMPORT — le commentaire de la vue nomme volontairement l'ancien
    // module pour dire pourquoi il n'existe plus, et une garde sur le mot
    // seul rougirait dessus.
    expect(vue).not.toMatch(/from '[^']*dossierDAlbum'/);
  });

  it('le module en double a bien disparu de l\'arbre', async () => {
    const { existsSync } = await import('node:fs');
    expect(existsSync('src/lib/dossierDAlbum.ts')).toBe(false);
    expect(existsSync('src/lib/dossierAlbum.ts')).toBe(true);
  });

  it('🔴 on ne charge que les albums retenus, pas les deux cents vignettes', () => {
    const i = vue.indexOf('for (const id of picked)');
    expect(i).toBeGreaterThan(0);
    const bloc = vue.slice(i, i + 600);
    expect(bloc).toContain('api.getAlbumTracks(id)');
    expect(bloc).toContain('dossiers.has(id) || dossiersEnCours.has(id)');
  });

  it('🔴 une NOUVELLE Map à chaque écriture — muter un $state ne réveille rien', () => {
    expect(vue).toContain('new Map(dossiers).set(id,');
  });

  it('les PISTES sont passées telles quelles, pas des chemins nus', () => {
    // `dossierAlbum` écarte lui-même les pistes de service : lui donner des
    // chaînes lui retirerait cette garde.
    expect(vue).toContain('dossierDeLAlbum(ts ?? [])');
  });

  it('le format d\'origine, lui, était déjà là', () => {
    expect(vue).toContain('<QualityBadge format={a.format}');
  });

  it('la clé existe dans les ONZE langues', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu']) {
      expect(readFileSync(`src/lib/locales/${l}.ts`, 'utf8'), l).toContain('v2.conv.sourceFolder');
    }
  });
});
