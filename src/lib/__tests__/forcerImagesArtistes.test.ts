import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { doitSArreterFauteDImagesManquantes } from '../enrichissementImagesArtistes';

import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';
import hu from '../locales/hu';

/**
 * Deux réglages avalés par la fusion `f14553f` (« Merge branch
 * 'prep/v0.9.0-ui' into web-main-090 », 23/07/2026) — la même qui avait emporté
 * le bandeau d'avancement des images d'artistes, restauré depuis par `#617`.
 *
 * 1. `dfd3c93` — le bouton « Forcer la récupération », frère de « Enrichir les
 *    images d'artistes », qui appelle `POST /library/artwork/enrich-artists/force`.
 * 2. `ac0a01f` — l'infobulle du « Scan complet », qui devait dire qu'il
 *    ré-extrait aussi les pochettes embarquées.
 *
 * ⚠️ Une ligne absente ne prouve pas une fonctionnalité absente. Le manque a
 * donc été établi par le COMPORTEMENT du code, pas par un grep :
 *
 * - `startEnrichArtistImages` s'arrête net quand le serveur répond
 *   `artists_without_image === 0` (« aucune image manquante ») et ne lance
 *   rien. Un artiste dont `image_path` pointe une entrée périmée qui ne
 *   s'affiche pas COMPTE comme ayant une image : le passage normal le saute
 *   toujours, et plus AUCUN chemin de l'interface ne permettait de le
 *   re-télécharger. C'est exactement la plainte de Fabien (scan complet, puis
 *   toujours pas d'images d'artistes).
 * - La route serveur, elle, existe bel et bien :
 *   `tune-server/src/routes/library/mod.rs` monte
 *   `POST /artwork/enrich-artists/force` sur
 *   `artwork::force_refetch_artist_artwork`. Ce n'est donc pas une route
 *   fantôme — c'est le bouton qui manquait, pas le serveur.
 *
 * En revanche l'infobulle « Rechercher les covers manquantes » du même
 * `ac0a01f` a bien été RÉIMPLÉMENTÉE autrement, via `use:tip={'tip.rescanArtwork'}` :
 * on n'y touche pas, et aucun test ici ne la redemande.
 */

const SETTINGS = readFileSync(
  resolve(__dirname, '../../components/SettingsView.svelte'),
  'utf8',
);
const API = readFileSync(resolve(__dirname, '../api.ts'), 'utf8');

const LOCALES = { fr, en, de, es, it: it_, ja, ko, ro, sv, zh, hu } as Record<
  string,
  Record<string, string>
>;

describe('les 11 langues sont bien toutes chargées', () => {
  // Garde-fou contre le piège vécu : un échantillon vide rend « présent »
  // partout. Si cette liste rétrécit, les boucles ci-dessous ne prouvent rien.
  it('compte 11 locales', () => {
    expect(Object.keys(LOCALES)).toHaveLength(11);
  });
});

describe("bouton « Forcer la récupération » des images d'artistes (dfd3c93)", () => {
  it('api.ts expose forceRefetchArtistImages sur la route /force', () => {
    expect(API).toContain('export function forceRefetchArtistImages');
    expect(API).toContain('/library/artwork/enrich-artists/force');
  });

  it('le bouton existe dans les réglages et appelle cette fonction', () => {
    expect(SETTINGS).toContain('forceRefetchArtistImages');
    expect(SETTINGS).toContain('settings.forceRefetchArtistImages');
  });

  it('les 11 langues ont le libellé et son infobulle', () => {
    for (const [code, dict] of Object.entries(LOCALES)) {
      expect(dict['settings.forceRefetchArtistImages'], `libellé manquant en ${code}`)
        .toBeTruthy();
      expect(dict['settings.forceRefetchArtistImagesHint'], `infobulle manquante en ${code}`)
        .toBeTruthy();
    }
  });
});

describe('la récupération forcée ne doit JAMAIS être court-circuitée', () => {
  // Le défaut de fond : le passage « manquantes » s'arrête quand le serveur
  // annonce 0 artiste sans image. Appliquer cette même garde au passage forcé
  // le rendrait inopérant précisément dans le cas qu'il existe pour traiter —
  // une bibliothèque où tout le monde « a » une image, mais périmée.
  it("s'arrête pour le passage « manquantes » quand plus rien ne manque", () => {
    expect(doitSArreterFauteDImagesManquantes('manquantes', 0)).toBe(true);
  });

  it('ne s\'arrête pas pour « manquantes » tant qu\'il reste des artistes', () => {
    expect(doitSArreterFauteDImagesManquantes('manquantes', 7)).toBe(false);
  });

  it('ne s\'arrête JAMAIS pour le passage forcé, même à 0 manquante', () => {
    expect(doitSArreterFauteDImagesManquantes('forcé', 0)).toBe(false);
    expect(doitSArreterFauteDImagesManquantes('forcé', 42)).toBe(false);
  });
});

describe('infobulle du « Scan complet » (ac0a01f)', () => {
  it('le bouton porte toujours son title', () => {
    expect(SETTINGS).toContain("title={$t('settings.fullScanTitle')}");
  });

  it('les 11 langues annoncent la ré-extraction des pochettes embarquées', () => {
    // Le texte perdu ne disait plus que « relit tous les tags audio » : Thibaud
    // ne pouvait pas deviner qu'un scan complet ré-extrait aussi les pochettes.
    // `coper` couvre l'italien « copertine » ET le roumain « coperțile » — le
    // ț roumain n'est pas un t, un motif `copert` ne l'attraperait pas.
    const POCHETTE = /pochette|cover|carátula|coper|ジャケット|커버|封面|omslag|borító/i;
    for (const [code, dict] of Object.entries(LOCALES)) {
      const v = dict['settings.fullScanTitle'];
      expect(v, `settings.fullScanTitle manquant en ${code}`).toBeTruthy();
      expect(v, `${code} : « ${v} » ne parle pas des pochettes`).toMatch(POCHETTE);
    }
  });
});
