import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GRILLE_PREREGLAGES,
  PREREGLAGES_EQ,
  Q_PREREGLAGES,
  bandesDuPrereglage,
  libellePrereglage,
  prereglageDesBandes,
} from '../eqPrereglages';
import { ISO_OCTAVE_HZ } from '../spectrumScale';

/**
 * Les sept préréglages de « En écoute » doivent AGIR — #532.
 *
 * Le panneau envoyait un nom : `POST /zones/{id}/eq {"preset":"bass_boost"}`.
 * Ce que le serveur en faisait a changé, et les deux états condamnent ce
 * chemin :
 *
 *  - avant `tune-core/src/audio/eq_presets.rs`, `set_eq` n'appliquait que
 *    `bands` et `enabled` ; `body.preset` était seulement recopié dans la
 *    réponse. 200, `"preset":"bass_boost"`, aucune bande modifiée, aucun son ;
 *  - depuis, `set_eq` résout le nom (`playback.rs:2423`) et refuse en 400 un
 *    nom inconnu.
 *
 * Et le panneau envoyait `vocal`, absent des deux : inerte hier, refusé
 * aujourd'hui. Les sept noms du serveur sont `flat`, `bass_boost`,
 * `treble_boost`, `loudness`, `rock`, `jazz`, `classical`.
 *
 * Les bandes explicites, elles, sont prioritaires sur TOUTES les versions —
 * `prereglage_a_appliquer(preset, bandes_fournies)` vaut
 * `preset.filter(|nom| !bandes_fournies && *nom != "custom")`. Envoyer la
 * courbe est donc le seul chemin qui agisse partout, et c'est déjà celui de
 * l'écran Égaliseur complet.
 *
 * Reste en environnement `node` : fonctions pures et lecture de texte.
 */

/**
 * Les sept noms de `eq_presets::noms()`, dans l'ordre de `PREREGLAGES`
 * (`tune-core/src/audio/eq_presets.rs`).
 */
const NOMS_SERVEUR = [
  'flat',
  'bass_boost',
  'treble_boost',
  'loudness',
  'rock',
  'jazz',
  'classical',
];

/** Les gains que le serveur porte, repris de `PREREGLAGES` dans `eq_presets.rs`. */
const GAINS_SERVEUR: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass_boost: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  treble_boost: [0, 0, 0, 0, 0, 1, 3, 5, 7, 8],
  loudness: [6, 4, 0, -2, -1, 0, 2, 4, 5, 6],
  rock: [5, 3, 0, -2, -1, 2, 4, 5, 5, 4],
  jazz: [3, 2, 0, 2, -1, -1, 0, 2, 4, 5],
  classical: [0, 0, 0, 0, 0, 0, -2, -3, -2, -1],
};

/** `GRILLE_10` de `eq_presets.rs`. */
const GRILLE_SERVEUR = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

describe('la table partagée est celle du serveur', () => {
  it('porte exactement les sept noms que le serveur sait résoudre', () => {
    expect(PREREGLAGES_EQ.map((p) => p.cle)).toEqual(NOMS_SERVEUR);
  });

  it('« vocal » n’est plus proposé nulle part', () => {
    expect(PREREGLAGES_EQ.some((p) => p.cle === 'vocal')).toBe(false);
    expect(bandesDuPrereglage('vocal')).toBeNull();
  });

  it('pose les préréglages sur la grille du serveur, au même Q', () => {
    expect([...GRILLE_PREREGLAGES]).toEqual(GRILLE_SERVEUR);
    // La grille est celle de l'analyseur de spectre et du mode Expert à dix
    // bandes : une seule définition, pas une copie qui dériverait.
    expect([...GRILLE_PREREGLAGES]).toEqual(ISO_OCTAVE_HZ);
    expect(Q_PREREGLAGES).toBe(1.0);
  });

  it('les gains sont ceux du serveur, gain pour gain', () => {
    for (const p of PREREGLAGES_EQ) {
      expect([...p.gains], `courbe divergente : ${p.cle}`).toEqual(GAINS_SERVEUR[p.cle]);
    }
  });
});

describe('bandesDuPrereglage', () => {
  it('rend dix bandes prêtes pour POST /zones/{id}/eq', () => {
    const bandes = bandesDuPrereglage('rock');
    expect(bandes).not.toBeNull();
    expect(bandes).toHaveLength(10);
    expect(bandes!.map((b) => b.freq)).toEqual(GRILLE_SERVEUR);
    expect(bandes!.map((b) => b.gain)).toEqual(GAINS_SERVEUR.rock);
    expect(bandes!.every((b) => b.q === 1.0)).toBe(true);
  });

  /**
   * Un préréglage graphique ne vise aucun canal. En nommer un ferait taire
   * l'autre — c'est la règle que le serveur applique aussi
   * (`aucun_prereglage_ne_vise_un_canal`).
   */
  it('ne vise aucun canal', () => {
    for (const nom of NOMS_SERVEUR) {
      for (const b of bandesDuPrereglage(nom)!) {
        expect(b.channel, `« ${nom} » vise un canal`).toBeUndefined();
      }
    }
  });

  /**
   * Le `null` compte : il empêche d'envoyer une courbe vide, qui remettrait
   * l'égaliseur à plat en croyant appliquer un préréglage. « custom » n'est
   * pas un préréglage — c'est le nom que la réponse porte quand l'utilisateur
   * a réglé ses bandes à la main.
   */
  it('rend null sur un nom inconnu, y compris « custom »', () => {
    expect(bandesDuPrereglage('custom')).toBeNull();
    expect(bandesDuPrereglage('rockk')).toBeNull();
    expect(bandesDuPrereglage('ROCK'), 'la casse n’est pas normalisée').toBeNull();
    expect(bandesDuPrereglage('')).toBeNull();
  });
});

describe('prereglageDesBandes — nommer ce que la zone joue déjà', () => {
  it('retrouve le nom d’une courbe qu’on vient d’écrire', () => {
    for (const nom of NOMS_SERVEUR) {
      expect(prereglageDesBandes(bandesDuPrereglage(nom)!)).toBe(nom);
    }
  });

  /**
   * La contre-épreuve. Un reconnaisseur qui dirait « flat » à tout ferait
   * passer le test précédent pour `flat` et afficherait un nom faux sur toute
   * courbe réglée à la main — exactement le défaut qu'on répare.
   */
  it('rend null plutôt que d’inventer un nom', () => {
    expect(prereglageDesBandes(null)).toBeNull();
    expect(prereglageDesBandes([])).toBeNull();
    // Une courbe libre, sur la bonne grille : aucun préréglage ne la produit.
    const libre = GRILLE_SERVEUR.map((freq, i) => ({ freq, gain: i % 2 ? 3 : -3, q: 1 }));
    expect(prereglageDesBandes(libre)).toBeNull();
    // Les bons gains sur d'autres fréquences ne sont pas la même correction.
    const decalee = GRILLE_SERVEUR.map((freq, i) => ({
      freq: freq * 2,
      gain: GAINS_SERVEUR.rock[i],
      q: 1,
    }));
    expect(prereglageDesBandes(decalee)).toBeNull();
    // Une courbe par canal n'est pas un préréglage graphique.
    const parCanal = bandesDuPrereglage('rock')!.map((b) => ({ ...b, channel: 0 }));
    expect(prereglageDesBandes(parCanal)).toBeNull();
  });
});

describe('libellePrereglage', () => {
  it('rend le libellé connu, et la clé brute sinon', () => {
    expect(libellePrereglage('bass_boost')).toBe('Bass Boost');
    expect(libellePrereglage('inconnu')).toBe('inconnu');
  });
});

describe('les deux écrans lisent la MÊME table', () => {
  const NOW_PLAYING = readFileSync(
    resolve(process.cwd(), 'src/components/NowPlaying.svelte'),
    'utf-8',
  );
  const PANNEAU = readFileSync(
    resolve(process.cwd(), 'src/components/NowPlayingEqPanel.svelte'),
    'utf-8',
  );
  const EQUALIZER = readFileSync(
    resolve(process.cwd(), 'src/components/EqualizerView.svelte'),
    'utf-8',
  );
  const API = readFileSync(resolve(process.cwd(), 'src/lib/api.ts'), 'utf-8');

  it('le panneau ne tient plus sa propre liste de libellés', () => {
    expect(PANNEAU).toContain("from '../lib/eqPrereglages'");
    expect(PANNEAU, '« Vocal » est revenu dans le panneau').not.toContain("'vocal'");
  });

  it('l’écran Égaliseur non plus', () => {
    expect(EQUALIZER).toContain("from '../lib/eqPrereglages'");
    expect(EQUALIZER, 'la table en dur est revenue').not.toMatch(
      /bass_boost:\s*\{\s*label/,
    );
  });

  /** Le cœur du ticket : le panneau écrit des BANDES, pas un nom. */
  it('le panneau applique le préréglage par le même chemin que l’écran complet', () => {
    const debut = NOW_PLAYING.indexOf('async function setEqPreset');
    expect(debut).toBeGreaterThan(-1);
    const corps = NOW_PLAYING.slice(debut, NOW_PLAYING.indexOf('\n  }', debut));
    expect(corps).toContain('bandesDuPrereglage');
    expect(corps, 'le panneau envoie encore un nom seul').toMatch(
      /api\.setEq\(zone\.id,\s*\{\s*bands/,
    );
  });

  /**
   * Laisser en place une fonction qui n'envoie qu'un nom, c'est laisser le
   * piège armé pour le prochain appelant.
   */
  it('la route « un nom seul » n’existe plus dans la couche API', () => {
    expect(API, 'setEqualizer est revenue').not.toMatch(/export function setEqualizer\b/);
    expect(API, 'setEq a disparu').toMatch(/export function setEq\b/);
  });
});
