import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fusionnerHistorique, estRadioEnregistrable, cleFavoriRadio } from '../historiqueLecture';
import type { HistoryEntry } from '../stores/history';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

/** Retire commentaires HTML, blocs et lignes — un garde qui lit une intention
 *  écrite en commentaire passe au vert sans que rien ne soit branché. */
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const piste = (o: Partial<HistoryEntry['track']>) => o as HistoryEntry['track'];
const entree = (t: Partial<HistoryEntry['track']>, playedAt = '2026-09-05T10:00:00Z'): HistoryEntry =>
  ({ track: piste(t), playedAt, zoneName: 'Zone 1' });

describe("Historique dans le nouveau client (Bertrand, 05/09/2026)", () => {
  it('la barre latérale y mène, dans le NOYAU et non derrière un niveau', () => {
    const barre = sansCommentaires(lire('src/components/v2/Sidebar.svelte'));
    const noyau = barre.slice(barre.indexOf('const CORE'), barre.indexOf('const ADVANCED'));
    expect(noyau).toContain("view: 'history'");
    // Et pas ailleurs : le mettre en Avancé le rendrait invisible en Essentiel,
    // ce qui est exactement le défaut signalé.
    const avance = barre.slice(barre.indexOf('const ADVANCED'), barre.indexOf('const RACCOURCIS_BARRE'));
    expect(avance).not.toContain("view: 'history'");
  });

  it("la coquille MONTE l'écran — une entrée qui ne mène nulle part ne vaut rien", () => {
    const shell = sansCommentaires(lire('src/components/v2/ShellV2.svelte'));
    expect(shell).toContain("import HistoriqueV2 from './HistoriqueV2.svelte'");
    expect(shell).toContain("$activeView === 'history'");
    expect(shell).toContain('<HistoriqueV2 />');
  });

  it('la logique est PARTAGÉE avec le client actuel, pas recopiée', () => {
    const v1 = sansCommentaires(lire('src/components/HistoryView.svelte'));
    const v2 = sansCommentaires(lire('src/components/v2/HistoriqueV2.svelte'));
    for (const src of [v1, v2]) {
      expect(src).toContain('historiqueLecture');
      expect(src).toContain('fusionnerHistorique');
      expect(src).toContain('rejouerEntree');
      expect(src).toContain('basculerFavoriRadio');
    }
    // Aucun des deux écrans ne refait le rejeu lui-même.
    expect(v1).not.toContain('playAndSync(');
    expect(v2).not.toContain('playAndSync(');
  });

  it("le temps relatif passe par les traductions, il n'est pas en dur", () => {
    const v2 = sansCommentaires(lire('src/components/v2/HistoriqueV2.svelte'));
    expect(v2).toContain("v2.hist.justNow");
    expect(v2).toContain("v2.hist.minutesAgo");
    expect(v2).toContain(".replace('{n}'");
    expect(v2).not.toContain('il y a ${');
  });

  it('la fusion ne garde que la plus récente écoute de chaque piste', () => {
    const fusion = fusionnerHistorique(
      [entree({ id: 7, title: 'A' }, 'b'), entree({ id: 7, title: 'A' }, 'a')],
      [entree({ id: 9, title: 'B' }, 'c')],
    );
    expect(fusion.map((e) => e.track.id)).toEqual([7, 9]);
  });

  it("une piste sans identifiant est dédupliquée par sa source et son titre", () => {
    const fusion = fusionnerHistorique(
      [entree({ source: 'radio', source_id: 'u', title: 'Ma', artist_name: 'X' }, 'b'),
       entree({ source: 'radio', source_id: 'u', title: 'MA', artist_name: 'x' }, 'a')],
      [],
    );
    expect(fusion).toHaveLength(1);
  });

  it("le local passe devant le serveur : il est plus frais", () => {
    const fusion = fusionnerHistorique(
      [entree({ id: 1, title: 'local' }, 'b')],
      [entree({ id: 2, title: 'serveur' }, 'a')],
    );
    expect(fusion.map((e) => e.track.id)).toEqual([1, 2]);
  });

  it("« Episode » et le nom de station nu ne sont pas des titres enregistrables", () => {
    expect(estRadioEnregistrable(piste({ source: 'radio', title: 'Episode' }))).toBe(false);
    expect(estRadioEnregistrable(piste({ source: 'radio', title: 'FIP', album_title: 'FIP' }))).toBe(false);
    expect(estRadioEnregistrable(piste({ source: 'radio', title: 'Ne me quitte pas', artist_name: 'Brel' }))).toBe(true);
    // Une piste locale n'est jamais un favori de radio.
    expect(estRadioEnregistrable(piste({ source: 'local', title: 'x' }))).toBe(false);
  });

  it('la clé de favori radio distingue deux titres homonymes d’artistes différents', () => {
    expect(cleFavoriRadio('Hallelujah', 'Cohen')).not.toBe(cleFavoriRadio('Hallelujah', 'Buckley'));
  });
});
