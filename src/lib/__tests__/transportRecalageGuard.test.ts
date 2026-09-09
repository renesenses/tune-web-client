import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Garde de branchement : toute charge utile qui PORTE le transport doit le
 * recaler (#2092).
 *
 * ## Ce qui s'est passé
 *
 * L'aléatoire appartient à la zone et survit aux redémarrages : le serveur
 * l'enregistre avec la file (`tune-core/src/queue_persistence.rs:34`) et le
 * restaure au démarrage (`tune-server/src/startup.rs`). Le client, lui, naît à
 * `shuffleEnabled = false` (`stores/nowPlaying.ts`). Tant que rien ne le
 * recale, l'écran ment — sans limite de durée. Tades a ouvert deux fils
 * (« lecture aléatoire non demandée », « suivant choisit une piste au
 * hasard ») en écrivant « je ne pense pas avoir paramétré cela » : il avait
 * raison de ne pas s'en souvenir, rien ne le lui montrait.
 *
 * Le contrat serveur a été réparé le 22/08 (renesenses/tune-server-rust#2153,
 * livré à partir de v0.9.100) : `GET /zones` et `GET /zones/{id}` portent
 * désormais `shuffle` et `repeat`, comme l'instantané WebSocket les portait
 * déjà. Le client, lui, ne lisait que l'instantané.
 *
 * ## Pourquoi une garde de SOURCE et pas un test de rendu
 *
 * Il n'y a ni `@testing-library/svelte` ni test de rendu dans ce dépôt : la
 * logique testable vit dans `lib/`, le branchement dans `App.svelte`. Or c'est
 * le branchement qui manquait — `mergeTransport` marchait parfaitement, il
 * n'était simplement appelé qu'à un seul endroit sur quatre. Tester la
 * fonction sans tester ses appelants aurait laissé le défaut vert.
 *
 * Même idiome que `dspAppliedLiveGuard` ici, et que le verrou
 * `les_retours_anticipes_passent_par_le_contrat` de `routes/zones.rs`
 * côté serveur : vérifier qu'on APPELLE le contrat, pas seulement qu'il marche.
 */
describe('garde : chaque source d’état de zone recale le transport', () => {
  const app = readFileSync(resolve(__dirname, '../../App.svelte'), 'utf-8');
  const sync = readFileSync(resolve(__dirname, '../transportSync.ts'), 'utf-8');

  /**
   * ⚠️ Les COMMENTAIRES sont retirés avant toute recherche de code.
   *
   * Première version de cette garde : elle cherchait le nom
   * `syncTransportFromZone` dans un bloc de source brut — et le trouvait dans
   * le commentaire qui explique pourquoi l'appel est là. Supprimer l'appel la
   * laissait VERTE. Un garde-fou qui se lit lui-même ne garde rien ; c'est le
   * même piège que `charge_utile_zone_guard` a rencontré côté serveur (#2082),
   * où `include_str!` faisait trouver au test ses propres motifs.
   */
  function sansCommentaires(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  const code = sansCommentaires(app);

  /**
   * Les quatre entrées par lesquelles l'état d'une zone arrive dans l'écran,
   * et le cas d'usage que chacune couvre. Une seule manquante, et l'écran
   * ment dans ce cas-là.
   *
   * Chaque bloc est borné par l'entrée SUIVANTE — pas par un nombre d'octets
   * arbitraire, qui déborderait sur le bloc d'à côté et rendrait la garde
   * verte grâce à l'appel du voisin.
   */
  const SOURCES = [
    {
      nom: 'instantané WebSocket (ouverture / reprise de connexion)',
      debut: "type === 'snapshot'",
      // L'accolade qui referme la branche, et rien de plus loin : borné au
      // bloc suivant, ce test restait VERT après suppression de son propre
      // appel — il trouvait celui du voisin. Constaté par mutation.
      fin: '\n      }',
    },
    {
      nom: 'liste REST /zones (chargement de page, repli par sondage)',
      debut: 'async function fetchZones',
      fin: 'async function fetchDevices',
    },
    {
      nom: 'zone REST /zones/{id} (après chaque événement de lecture)',
      debut: 'async function syncZoneState',
      fin: 'async function checkOnboarding',
    },
    {
      nom: 'sondage bulk zone.updated',
      debut: "type === 'zone.updated'",
      fin: "type === 'playback.queue_changed'",
    },
  ];

  function bloc(debut: string, fin: string): string {
    const i = code.indexOf(debut);
    expect(
      i,
      `borne de début introuvable dans App.svelte : « ${debut} » — la garde ne garde plus rien`,
    ).toBeGreaterThanOrEqual(0);
    const j = code.indexOf(fin, i + debut.length);
    expect(
      j,
      `borne de fin introuvable après « ${debut} » : « ${fin} » — la garde ne garde plus rien`,
    ).toBeGreaterThan(i);
    return code.slice(i, j);
  }

  it.each(SOURCES)('$nom appelle syncTransportFromZone', ({ debut, fin }) => {
    // `syncTransportFromZone(` avec sa parenthèse : un APPEL, pas une mention.
    expect(bloc(debut, fin)).toContain('syncTransportFromZone(');
  });

  it('l’annonce en direct d’une autre télécommande est lue', () => {
    // `playback.shuffle` / `playback.repeat` : c'est le SEUL chemin par lequel
    // une bascule faite ailleurs (mobile, seconde fenêtre, Siri, widget)
    // atteint cet écran sans rechargement. Le traducteur vit dans `lib/`
    // (testable), l'appel dans `App.svelte` (branchement) — il faut les deux.
    const traducteur = sansCommentaires(sync);
    expect(traducteur).toContain("'playback.shuffle'");
    expect(traducteur).toContain("'playback.repeat'");
    expect(code).toContain('transportDeLEvenement(');

    // Et il doit être branché AVANT le bloc générique `playback.*`, qui
    // renvoie sur certains types seulement : placé après, il ne serait jamais
    // atteint pour les deux événements qui nous intéressent.
    const iDirect = code.indexOf('transportDeLEvenement(type');
    const iGenerique = code.indexOf("type.startsWith('playback.')");
    expect(iDirect, 'appel à transportDeLEvenement(type, …) introuvable').toBeGreaterThanOrEqual(0);
    expect(iGenerique, 'bloc générique playback.* introuvable').toBeGreaterThanOrEqual(0);
    expect(iDirect).toBeLessThan(iGenerique);
  });

  it('le commentaire périmé « ni /zones ni /zones/{id} ne les portent » a disparu', () => {
    // Ce commentaire décrivait le contrat d'AVANT
    // renesenses/tune-server-rust#2153. Le laisser en place, c'est réarmer le
    // raisonnement qui a produit le défaut : « inutile de lire /zones, il ne
    // porte pas le transport ».
    for (const [fichier, source] of [
      ['App.svelte', app],
      ['lib/transportSync.ts', sync],
    ] as const) {
      for (const perime of ['ni /zones ni', 'ni `/zones` ni']) {
        expect(
          source.includes(perime),
          `${fichier} : commentaire périmé encore présent — « ${perime} »`,
        ).toBe(false);
      }
    }
  });
});
