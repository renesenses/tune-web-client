/**
 * #989 — « l’ordre chronologique n’est pas respecté ».
 *
 * FabienM, fil « v0.9.147 : v1 divers bugs », 13/09/2026, point 12 :
 *
 *   « Menu historique : l’ordre chronologique n’est pas respecté. J’ai en
 *     premier des titres qui ont été joués il y a plusieurs jours alors qu’une
 *     playlist plus récente et d’autres titres ont été joués plus récemment. »
 *
 * ## La cause
 *
 * `fusionnerHistorique` CONCATÉNAIT `[...local, ...serveur]` et ne triait
 * jamais. Les deux listes sont chacune récente-en-tête, mais elles n’étaient
 * pas ENTRELACÉES : tout le magasin local — jusqu’à deux cents entrées — passait
 * devant tout ce que le serveur venait de servir.
 *
 * Et `slice(0, 200)` s’appliquait à cette liste non triée : un magasin local
 * garni pouvait ÉVINCER des écoutes serveur plus récentes.
 *
 * ## Ce que cette garde tient, et ce qu’elle protège
 *
 * Le tri, le plafond appliqué APRÈS lui, et — tout aussi important — la
 * priorité du LOCAL à la déduplication, qui est un choix délibéré : une écoute
 * présente des deux côtés est mieux décrite par le magasin local, qui porte les
 * titres de radio et le vrai nom de zone.
 */
import { describe, it, expect } from 'vitest';
import { fusionnerHistorique } from '../historiqueLecture';
import type { HistoryEntry } from '../stores/history';

/** Une entrée minimale : ce que la fusion regarde, et rien d’autre. */
function e(titre: string, quand: string, zone = 'Salon'): HistoryEntry {
  return {
    track: { id: null, title: titre, artist_name: 'A', source: 'radio' } as any,
    playedAt: quand,
    zoneName: zone,
  } as HistoryEntry;
}

const titres = (l: HistoryEntry[]) => l.map((x) => x.track.title);

describe('#989 — l’historique est rendu du plus récent au plus ancien', () => {
  /** 🔴 LE CAS DE FABIEN, réduit à quatre lignes. */
  it('une écoute serveur RÉCENTE passe devant une écoute locale ANCIENNE', () => {
    const local = [e('vieux-local', '2026-09-09T10:00:00Z')];
    const serveur = [e('recent-serveur', '2026-09-13T10:00:00Z')];
    expect(titres(fusionnerHistorique(local, serveur))).toEqual([
      'recent-serveur', 'vieux-local',
    ]);
  });

  it('les deux listes sont ENTRELACÉES, pas mises bout à bout', () => {
    const local = [e('L1', '2026-09-13T12:00:00Z'), e('L2', '2026-09-13T08:00:00Z')];
    const serveur = [e('S1', '2026-09-13T11:00:00Z'), e('S2', '2026-09-13T09:00:00Z')];
    expect(titres(fusionnerHistorique(local, serveur))).toEqual(['L1', 'S1', 'S2', 'L2']);
  });

  /**
   * 🔴 La conséquence la plus grave d’avant : le plafond mordait sur une liste
   * non triée, et faisait DISPARAÎTRE des écoutes récentes.
   */
  it('le plafond garde les plus RÉCENTES, pas les premières arrivées', () => {
    // 200 écoutes locales anciennes — de quoi remplir le plafond à elles seules.
    const local = Array.from({ length: 200 }, (_, i) =>
      e(`vieux${i}`, `2026-09-0${(i % 9) + 1}T10:00:00Z`));
    const serveur = [e('tout-frais', '2026-09-13T23:00:00Z')];
    const rendu = fusionnerHistorique(local, serveur);
    expect(rendu).toHaveLength(200);
    expect(rendu[0].track.title).toBe('tout-frais');
    expect(titres(rendu)).toContain('tout-frais');
  });

  /**
   * 🔴 CE QU’IL NE FAUT PAS CASSER. Le local devant, c’est la priorité de
   * DÉDUPLICATION : il porte les titres de radio et le vrai nom de zone.
   */
  it('à instant ÉGAL, la version locale l’emporte — le tri est stable', () => {
    const quand = '2026-09-13T10:00:00Z';
    const local = [e('meme', quand, 'Salon')];
    const serveur = [e('meme', quand, 'zone-inconnue')];
    const rendu = fusionnerHistorique(local, serveur);
    expect(rendu).toHaveLength(1);
    expect(rendu[0].zoneName).toBe('Salon');
  });

  it('une liste vide d’un côté ne change rien à l’autre', () => {
    const l = [e('a', '2026-09-13T10:00:00Z'), e('b', '2026-09-13T09:00:00Z')];
    expect(titres(fusionnerHistorique(l, []))).toEqual(['a', 'b']);
    expect(titres(fusionnerHistorique([], l))).toEqual(['a', 'b']);
  });

  it('une liste déjà dans le désordre est remise en ordre', () => {
    const l = [e('vieux', '2026-09-01T10:00:00Z'), e('neuf', '2026-09-13T10:00:00Z')];
    expect(titres(fusionnerHistorique(l, []))).toEqual(['neuf', 'vieux']);
  });

  /**
   * Les dates illisibles ne doivent ni remonter en tête ni désordonner le reste.
   *
   * ⚠️ Honnêteté sur la portée de ce cas : la contre-épreuve associée — remplacer
   * le comparateur par une soustraction, qui rend `NaN` sur deux dates
   * illisibles — est restée VERTE. Mesuré sur node v22.23.2, et conforme à
   * ECMA-262 : `SortCompare` fait `If v is NaN, return +0`, donc un `NaN` vaut
   * « égaux » et la soustraction rendait déjà le bon ordre.
   *
   * Ce test garde donc l’INVARIANT (les dates valides ordonnées, les illisibles
   * en queue), pas la forme du comparateur. Il aurait été malhonnête de laisser
   * croire qu’il attrape la seconde.
   */
  it('des dates illisibles ne désordonnent pas les autres, et finissent en queue', () => {
    const local = [
      e('cassee1', 'pas-une-date'),
      e('milieu', '2026-09-10T10:00:00Z'),
      e('cassee2', ''),
      e('recente', '2026-09-13T10:00:00Z'),
      e('ancienne', '2026-09-01T10:00:00Z'),
    ];
    const rendu = titres(fusionnerHistorique(local, []));
    expect(rendu.slice(0, 3)).toEqual(['recente', 'milieu', 'ancienne']);
    expect(rendu.slice(3).sort()).toEqual(['cassee1', 'cassee2']);
  });

  it('aucune entrée n’est perdue ni dupliquée par le tri', () => {
    const local = Array.from({ length: 25 }, (_, i) => e(`L${i}`, `2026-09-1${i % 3}T0${i % 9}:00:00Z`));
    const serveur = Array.from({ length: 25 }, (_, i) => e(`S${i}`, `2026-09-1${i % 3}T1${i % 9}:00:00Z`));
    const rendu = fusionnerHistorique(local, serveur);
    expect(rendu).toHaveLength(50);
    expect(new Set(titres(rendu)).size).toBe(50);
  });
});
