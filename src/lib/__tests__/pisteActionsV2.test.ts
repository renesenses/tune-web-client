import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { corpsDeFile, corpsDeLecture, estPisteLocale } from '../pisteFile';
import type { Track } from '../types';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const p = (o: Partial<Track>) => o as Track;

describe('Actions sur une piste, au survol (Bertrand, 05/09/2026)', () => {
  const src = sansCommentaires(lire('src/components/v2/PisteActions.svelte'));

  it('les cinq boutons de la palette sont là', () => {
    for (const cle of ['v2.pa.play', 'v2.pa.next', 'v2.pa.queue', 'v2.pa.playlist', 'v2.pa.fav']) {
      expect(src).toContain(cle);
    }
  });

  it('les icônes sont VISIBLES, elles ne se cachent plus', () => {
    // Bertrand a d'abord voulu le survol seul, puis a demandé de coloriser les
    // icônes — et n'a rien vu, deux fois. Coloriser ce qu'on ne voit pas n'a
    // pas de sens : la barre reste affichée.
    expect(src).not.toMatch(/\.pactions\{[^}]*opacity:0/);
    expect(src).not.toContain(':global(.trk:hover) .pactions');
  });

  it('les icônes portent la couleur du THÈME, pas le gris de texte', () => {
    expect(src).toMatch(/\.pa\{[^}]*color:var\(--v2-acc1\)/);
    expect(src).not.toMatch(/\.pa\{[^}]*color:var\(--v2-txt3\)/);
    // Le cœur ACTIF fait exception : c'est un état, et il reste rouge.
    expect(src).toContain('.coeur.on{color:var(--v2-danger)}');
  });

  it('le survol RENFORCE le bouton visé, il ne le révèle plus', () => {
    expect(src).toContain('.pa:hover:not(:disabled){color:var(--v2-acc-tint)');
  });

  it("« lire ensuite » insère APRÈS la piste en cours, pas à la fin", () => {
    expect(src).toContain('get(queuePosition) + 1');
    // Et « ajouter à la file » n'a pas de rang : c'est ce qui les distingue.
    expect(src).toContain("await enfiler(undefined, 'v2.pa.queued')");
  });

  it('les quatre listes de titres passent par la ligne PARTAGEE', () => {
    for (const f of ['AlbumDetailV2', 'PlaylistDetailV2', 'LibraryV2', 'SearchV2']) {
      const ecran = sansCommentaires(lire(`src/components/v2/${f}.svelte`));
      expect(ecran, f).toContain("import LignePisteV2 from './LignePisteV2.svelte'");
      expect(ecran, f).toContain('<LignePisteV2 piste=');
      // Et aucun n'a garde sa propre ligne : quatre copies auraient diverge.
      expect(ecran, f).not.toContain('<button class="trk"');
      expect(ecran, f).not.toContain('<PisteActions piste=');
    }
  });

  it('la ligne partagee porte la richesse du client actuel', () => {
    const ligne = sansCommentaires(lire('src/components/v2/LignePisteV2.svelte'));
    // Ce que Bertrand a demande le 05/09/2026 : la v0 PLUS le survol.
    expect(ligne).toContain("import AlbumArt from '../AlbumArt.svelte'");
    expect(ligne).toContain("import MetadataChips from '../MetadataChips.svelte'");
    expect(ligne).toContain("import QualityBadge from '../QualityBadge.svelte'");
    expect(ligne).toContain("import PisteActions from './PisteActions.svelte'");
    // Les puces suivent le REGLAGE du profil, la ligne n'en decide pas.
    expect(ligne).toContain('$displayFields');
    expect(ligne).toContain('<button class="tclick"');
  });

  it('une piste locale se désigne par son identifiant, et rien de plus', () => {
    expect(estPisteLocale(p({ id: 4 }))).toBe(true);
    expect(corpsDeFile(p({ id: 4, title: 'A' }))).toEqual({ track_id: 4 });
    expect(corpsDeLecture(p({ id: 4, title: 'A' }))).toEqual({ track_id: 4 });
  });

  it('une piste de service emporte ses métadonnées, sinon la file affiche une ligne anonyme', () => {
    const t = p({ source: 'qobuz', source_id: '99', title: 'A', artist_name: 'B', album_title: 'C', duration_ms: 1000 });
    const corps = corpsDeFile(t);
    expect(corps?.tracks?.[0]).toMatchObject({ source: 'qobuz', source_id: '99', title: 'A', artist_name: 'B' });
    expect(corps).not.toHaveProperty('track_id');
  });

  it("une piste locale porteuse d'un identifiant de service reste locale", () => {
    expect(estPisteLocale(p({ id: 4, source: 'local' }))).toBe(true);
    expect(estPisteLocale(p({ id: 4, source: 'qobuz' }))).toBe(false);
  });

  it('le rang distingue « lire ensuite » de « ajouter à la file »', () => {
    expect(corpsDeFile(p({ id: 4 }), 7)).toEqual({ track_id: 4, position: 7 });
    expect(corpsDeFile(p({ id: 4 }))).not.toHaveProperty('position');
  });

  it('une piste qu’on ne sait pas désigner ne donne aucun corps', () => {
    expect(corpsDeFile(p({ title: 'orpheline' }))).toBeNull();
    expect(corpsDeLecture(p({ title: 'orpheline' }))).toBeNull();
    // …et l'écran ne lui pose alors aucun bouton de lecture.
    expect(src).toContain('const jouable = $derived(corpsDeLecture(piste) != null)');
  });
});
