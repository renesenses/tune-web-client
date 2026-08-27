import { describe, expect, it } from 'vitest';
import {
  GLOBALES,
  analyser,
  classesDe,
  infobullesCreuses,
  sansInfobulle,
  type Analyse,
} from './infobullesTronquees';

/** Les composants du lot 1. `LibraryView` et `StreamingView` en sont
 *  volontairement absents : d'autres sessions écrivent dedans, et le chantier
 *  les traite à part. */
const COMPOSANTS = ['NowPlaying', 'TransportBar', 'MiniPlayer', 'QueueView'] as const;

const ANALYSES: Analyse[] = COMPOSANTS.map(analyser);

const analyse = (nom: string) => ANALYSES.find((a) => a.nom === nom)!;

describe('Lecteur — infobulle sur les textes tronqués (#2411, lot 1)', () => {
  it('la feuille globale définit bien une classe de troncature', () => {
    // Contre-épreuve du test lui-même : si la lecture du CSS retournait un
    // ensemble vide, tous les cas suivants passeraient sans rien vérifier.
    expect(
      [...GLOBALES],
      "aucune règle de troncature lue dans tune-theme.css — le lecteur de CSS est cassé, pas l'écran",
    ).toContain('truncate');
  });

  it('la règle propre de NowPlaying est vue elle aussi', () => {
    // `.inline-credits` tronque en `line-clamp` sans jamais employer le mot
    // « truncate » : c'est précisément le angle mort qui a fait sous-estimer
    // le chantier (BandcampView, #2404).
    expect(
      [...analyse('NowPlaying').locales],
      'la règle line-clamp de .inline-credits n’est plus lue',
    ).toContain('inline-credits');
  });

  it('chaque composant du lot tronque bien du texte', () => {
    for (const a of ANALYSES) {
      expect(
        a.coupables.length,
        `${a.nom}.svelte : plus aucun élément tronqué — le test ne garde plus rien`,
      ).toBeGreaterThan(0);
    }
  });

  it('chaque élément tronqué peut se lire au survol', () => {
    // Un `title=` sur un ancêtre suffit : le navigateur remonte jusqu'à lui.
    // C'est le cas de la pastille de zone, dont le bouton porte déjà
    // `title={zoneFullLabel(zone)}`.
    const nus = sansInfobulle(ANALYSES);
    expect(
      nus,
      `Le lecteur coupe du texte sans donner de recours au survol :\n  ${nus.join('\n  ')}`,
    ).toEqual([]);
  });

  it("l'infobulle porte la donnée, pas un libellé d'interface", () => {
    // Une bulle « Titre » sur un titre coupé ne sert à rien : ce qu'on veut
    // lire, c'est le texte entier. On refuse donc le littéral statique et le
    // `$t()` seul, sur l'élément comme sur l'ancêtre dont il hérite. Un `$t()`
    // employé en REPLI dans une expression plus large
    // (`{piste.title || $t('queue.unknownTrack')}`) reste légitime.
    const creux = infobullesCreuses(ANALYSES);
    expect(creux, `Infobulles creuses :\n  ${creux.join('\n  ')}`).toEqual([]);
  });

  it('la pastille de zone reste couverte par son bouton', () => {
    // Cas limite explicite : si quelqu'un retire le `title=` du bouton, la
    // pastille redevient un texte coupé sans recours et le cas précédent doit
    // le voir. On verrouille ici la raison pour laquelle elle est exemptée,
    // afin que l'exemption ne devienne pas silencieuse.
    const chip = analyse('TransportBar').coupables.find((x) =>
      x.classes.includes('truncate') && classesDe(x.b.attrs).includes('zone-chip-label'),
    );
    expect(chip, 'la pastille de zone a disparu de TransportBar').toBeDefined();
    expect(
      chip!.b.titreHerite,
      'le bouton de sélection de zone ne porte plus de title= : la pastille n’est plus lisible au survol',
    ).toBe(true);
  });
});
