import { describe, it, expect } from 'vitest';
import {
  libelleBanniereEnrichissement,
  enrichissementImagesTermine,
  type TacheDeFond,
} from '../tachesDeFond';

/**
 * #2227 — Jean Valjean : « il s'affiche bien en haut de la page avec sa
 * progression mais à la fin, la fenêtre se ferme ».
 *
 * Le serveur publie bel et bien l'avancement : `routes/library/artwork.rs`
 * recopie toutes les 3 s le réglage `artist_artwork_enrich_result` dans le
 * registre des tâches de fond (`bg_tasks.update_progress("artist_artwork", …)`),
 * qui émet l'événement WebSocket `system.background_tasks`.
 *
 * Ce que le client en faisait — bandeau de progression ET bilan de fin — a été
 * perdu dans la fusion `f14553f6` (« Merge branch 'prep/v0.9.0-ui' into
 * web-main-090 », 23/07/2026), la même qui avait emporté les correctifs de
 * défilement restaurés ensuite par `c2b8b392`. Celui-ci ne l'a jamais été :
 * `git show origin/main:src/App.svelte | grep -c system.background_tasks` → 0.
 *
 * Ces deux fonctions portent la logique restaurée, hors composant pour être
 * jouable.
 */

const IMAGES_ARTISTES: TacheDeFond = {
  id: 'artist_artwork',
  label: "Récupération des images d'artistes…",
  kind: 'enrichment',
};

const SECOURS = 'Enrichissement en cours…';

describe('libelleBanniereEnrichissement', () => {
  it('greffe la progression fine publiée par le serveur sur le libellé', () => {
    const libelle = libelleBanniereEnrichissement(
      [{ ...IMAGES_ARTISTES, progress: { processed: 340, total: 1183, detail: 'MusicBrainz' } }],
      SECOURS,
    );
    expect(libelle).toBe("Récupération des images d'artistes… — MusicBrainz 340/1183");
  });

  it('suit le changement de phase annoncé par le serveur', () => {
    const libelle = libelleBanniereEnrichissement(
      [{ ...IMAGES_ARTISTES, progress: { processed: 12, total: 47, detail: 'Images' } }],
      SECOURS,
    );
    expect(libelle).toBe("Récupération des images d'artistes… — Images 12/47");
  });

  it("n'affiche aucune fraction tant que le serveur n'a pas de total", () => {
    // La phase « communauté » de tune-core tourne avant tout write_progress :
    // le registre rend alors total=0. Afficher « 0/0 » ferait croire à un arrêt.
    const libelle = libelleBanniereEnrichissement(
      [{ ...IMAGES_ARTISTES, progress: { processed: 0, total: 0, detail: 'MusicBrainz' } }],
      SECOURS,
    );
    expect(libelle).toBe("Récupération des images d'artistes…");
  });

  it('signale les tâches surnuméraires sans les empiler', () => {
    const libelle = libelleBanniereEnrichissement(
      [
        { ...IMAGES_ARTISTES, progress: { processed: 5, total: 10, detail: 'Images' } },
        { id: 'artwork', label: 'Pochettes…', kind: 'enrichment' },
        { id: 'bios', label: 'Biographies…', kind: 'enrichment' },
      ],
      SECOURS,
    );
    expect(libelle).toBe("Récupération des images d'artistes… — Images 5/10 (+2)");
  });

  it('retombe sur le libellé de secours quand le serveur ne nomme pas la tâche', () => {
    expect(libelleBanniereEnrichissement([{ id: 'artist_artwork', label: '', kind: 'enrichment' }], SECOURS))
      .toBe(SECOURS);
  });

  it('rend null quand plus rien ne tourne — c’est ce qui referme le bandeau', () => {
    expect(libelleBanniereEnrichissement([], SECOURS)).toBeNull();
  });
});

describe('enrichissementImagesTermine', () => {
  it('détecte la disparition de artist_artwork — le moment du bilan', () => {
    // C'est exactement l'instant que Jean Valjean décrit : « à la fin, la
    // fenêtre se ferme ». Elle doit se fermer SUR un bilan, pas sur du vide.
    expect(enrichissementImagesTermine([IMAGES_ARTISTES], [])).toBe(true);
  });

  it('reste muet tant que la tâche tourne', () => {
    expect(enrichissementImagesTermine([IMAGES_ARTISTES], [IMAGES_ARTISTES])).toBe(false);
  });

  it('reste muet au démarrage de la tâche', () => {
    expect(enrichissementImagesTermine([], [IMAGES_ARTISTES])).toBe(false);
  });

  it("ne confond pas la fin d'une AUTRE tâche avec la sienne", () => {
    // Le scan de pochettes utilise le même événement ; un bilan « 0 image
    // d'artiste ajoutée » affiché à la fin des pochettes serait un mensonge.
    const pochettes: TacheDeFond = { id: 'artwork', label: 'Pochettes…', kind: 'enrichment' };
    expect(enrichissementImagesTermine([IMAGES_ARTISTES, pochettes], [IMAGES_ARTISTES])).toBe(false);
  });

  it('ne rejoue pas le bilan une fois la tâche déjà partie', () => {
    expect(enrichissementImagesTermine([], [])).toBe(false);
  });
});
