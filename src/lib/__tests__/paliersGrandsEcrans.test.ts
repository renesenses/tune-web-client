import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  extraireFeuilleDeStyle,
  largeurMaxEffective,
  releverReglesLargeur,
  type Ecran,
  type RegleLargeur,
} from '../nowPlayingPaliers';

/**
 * « Lecture en cours » sur très grands écrans — renesenses/tune-server-rust#2249.
 *
 * Alain Bonnel (forum fil 1077) utilise une TV 4K comme écran de PC musique.
 * Réponse qui lui a été faite le 19/07/2026 :
 *
 *   « Sur les très grands écrans […] l'écran "Lecture en cours" agrandit
 *     désormais nettement la pochette ET la largeur du contenu, la colonne
 *     titres compris — donc une grande pochette sans masquer la tracklist. »
 *
 * Les deux paliers qui tenaient cette promesse (`d0b5d74c`, 18/07/2026) ont
 * disparu de `origin/main` à une résolution de fusion vers la ligne v0.9,
 * alors que le commit en reste ancêtre — donc invisible à un audit par numéro.
 *
 * CE QUE CE TEST PROUVE, ET CE QU'IL NE PROUVE PAS
 * ------------------------------------------------
 * Le sujet est du CSS pur. Aucun test de rendu ne l'atteindrait ici : jsdom
 * n'applique ni les requêtes de média ni la cascade, et un test de rendu
 * serait donc vert quoi qu'il arrive — exactement la fausse preuve à éviter.
 *
 * Ce test résout la cascade À LA MAIN sur la feuille de styles RÉELLE du
 * composant et compare les `max-width` obtenues à des largeurs d'écran
 * réelles. Il prouve donc que **la feuille livrée déclare bien des paliers qui
 * agrandissent les trois grandeurs promises** sur un écran 4K. Il ne prouve
 * pas le rendu pixel d'un navigateur — cela demanderait un test de bout en
 * bout, qui n'existe pas dans ce dépôt.
 *
 * Aucune valeur de palier n'est écrite en dur ci-dessous : tout est lu dans
 * `NowPlaying.svelte`. Retirer les paliers rend ce fichier rouge.
 */

const SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/NowPlaying.svelte'),
  'utf-8',
);

const REGLES: RegleLargeur[] = releverReglesLargeur(extraireFeuilleDeStyle(SOURCE));

/** Écrans réels, en pixels CSS. */
const FULL_HD: Ecran = { largeur: 1920, hauteur: 1080 };
const QHD: Ecran = { largeur: 2560, hauteur: 1440 };
const UHD_4K: Ecran = { largeur: 3840, hauteur: 2160 }; // la TV d'Alain

/**
 * Sélecteurs qui visent réellement l'écran d'Alain : mode large (`isWide`),
 * hors kiosque, file d'attente fermée. Les sélecteurs écartés le sont pour une
 * raison nommée, et le test « exhaustivité » plus bas vérifie qu'aucun autre
 * sélecteur n'est apparu entre-temps sans qu'on l'ait examiné.
 */
const ILOT = ['.content-layout', '.content-layout.wide'];
const POCHETTE = ['.artwork-container', '.content-layout.wide .artwork-container'];
const COLONNE_TITRES = ['.content-layout.wide .info-column'];

/** Sélecteurs délibérément hors périmètre, avec leur motif. */
const HORS_PERIMETRE: Record<string, string> = {
  ':global([data-kiosk]) .content-layout': 'mode kiosque',
  ':global([data-kiosk]) .artwork-container': 'mode kiosque',
  ':global([data-kiosk]) .info-column': 'mode kiosque',
  '.now-playing.queue-open .content-layout.wide': "file d'attente ouverte",
  '.now-playing.queue-open .artwork-container': "file d'attente ouverte",
};

/** `max-width` effective, en px, ou échec explicite si la règle a disparu. */
function largeur(selecteurs: readonly string[], ecran: Ecran): number {
  const valeur = largeurMaxEffective(REGLES, selecteurs, ecran);
  expect(
    valeur,
    `aucune max-width en px résolue pour ${selecteurs.join(' / ')} à ${ecran.largeur}px`,
  ).not.toBeNull();
  return valeur as number;
}

describe('Le résolveur de cascade sait distinguer (contre-épreuve)', () => {
  // Sans ceci, un résolveur qui rendrait toujours la même valeur — ou toujours
  // `null` — laisserait tous les tests suivants au vert par accident.
  const feuilleAvecPalier = `
    .boite { max-width: 100px; }
    @media (min-width: 2400px) { .boite { max-width: 900px; } }
  `;
  const feuilleSansPalier = `
    .boite { max-width: 100px; }
  `;

  it('applique le palier quand l’écran l’atteint', () => {
    const regles = releverReglesLargeur(feuilleAvecPalier);
    expect(largeurMaxEffective(regles, ['.boite'], UHD_4K)).toBe(900);
  });

  it('ignore le palier quand l’écran ne l’atteint pas', () => {
    const regles = releverReglesLargeur(feuilleAvecPalier);
    expect(largeurMaxEffective(regles, ['.boite'], FULL_HD)).toBe(100);
  });

  it('sans palier, la valeur ne bouge pas — la forme fautive, reproduite', () => {
    const regles = releverReglesLargeur(feuilleSansPalier);
    expect(largeurMaxEffective(regles, ['.boite'], FULL_HD)).toBe(100);
    expect(largeurMaxEffective(regles, ['.boite'], UHD_4K)).toBe(100);
  });

  it('la spécificité l’emporte sur l’ordre de la feuille', () => {
    const regles = releverReglesLargeur(`
      .parent .enfant { max-width: 700px; }
      .enfant { max-width: 200px; }
    `);
    expect(largeurMaxEffective(regles, ['.enfant', '.parent .enfant'], FULL_HD)).toBe(700);
  });

  it('les blocs @keyframes ne désynchronisent pas la lecture', () => {
    const regles = releverReglesLargeur(`
      @keyframes tourne { from { opacity: 0; } to { opacity: 1; } }
      .boite { max-width: 300px; }
    `);
    expect(largeurMaxEffective(regles, ['.boite'], FULL_HD)).toBe(300);
  });
});

describe('La feuille de NowPlaying est bien lue', () => {
  it('des règles max-width ont été relevées', () => {
    // Une feuille vide rendrait tout le reste vert sans rien avoir examiné.
    expect(REGLES.length).toBeGreaterThan(10);
  });

  it('les trois grandeurs de la promesse existent au repos', () => {
    expect(largeurMaxEffective(REGLES, ILOT, FULL_HD)).toBeGreaterThan(0);
    expect(largeurMaxEffective(REGLES, POCHETTE, FULL_HD)).toBeGreaterThan(0);
    expect(largeurMaxEffective(REGLES, COLONNE_TITRES, FULL_HD)).toBeGreaterThan(0);
  });

  it('exhaustivité — aucun sélecteur n’a échappé à l’examen', () => {
    // Si quelqu'un ajoute une règle max-width sur ces éléments, elle doit être
    // soit prise en compte, soit écartée avec un motif. Ce test l'y oblige.
    const rencontres = new Set(
      REGLES.filter((r) => /content-layout|artwork-container|info-column/.test(r.selecteur)).map(
        (r) => r.selecteur,
      ),
    );
    const examines = new Set([
      ...ILOT,
      ...POCHETTE,
      ...COLONNE_TITRES,
      ...Object.keys(HORS_PERIMETRE),
      '.content-layout', // palier mobile (max-width: 768px)
      '.artwork-container', // paliers mobile et écran bas
    ]);
    const inconnus = [...rencontres].filter((s) => !examines.has(s));
    expect(inconnus, `sélecteurs non examinés : ${inconnus.join(' | ')}`).toEqual([]);
  });
});

describe('La promesse faite à Alain, fil 1077 (#2249)', () => {
  it('sur une TV 4K, la pochette est nettement plus grande qu’en 1080p', () => {
    expect(largeur(POCHETTE, UHD_4K)).toBeGreaterThan(largeur(POCHETTE, FULL_HD));
  });

  it('sur une TV 4K, la largeur du contenu suit', () => {
    expect(largeur(ILOT, UHD_4K)).toBeGreaterThan(largeur(ILOT, FULL_HD));
  });

  it('« la colonne titres comprise » — elle grandit elle aussi', () => {
    // La clause la plus facile à oublier : agrandir la seule pochette
    // reproduirait le blocage d'Alain (la grande pochette masque la tracklist).
    expect(largeur(COLONNE_TITRES, UHD_4K)).toBeGreaterThan(largeur(COLONNE_TITRES, FULL_HD));
  });

  it('le palier intermédiaire sert déjà les écrans 2560 px', () => {
    expect(largeur(POCHETTE, QHD)).toBeGreaterThan(largeur(POCHETTE, FULL_HD));
    expect(largeur(ILOT, QHD)).toBeGreaterThan(largeur(ILOT, FULL_HD));
    expect(largeur(COLONNE_TITRES, QHD)).toBeGreaterThan(largeur(COLONNE_TITRES, FULL_HD));
  });

  it('les paliers sont progressifs — 4K ≥ 2560 px', () => {
    expect(largeur(POCHETTE, UHD_4K)).toBeGreaterThanOrEqual(largeur(POCHETTE, QHD));
    expect(largeur(ILOT, UHD_4K)).toBeGreaterThanOrEqual(largeur(ILOT, QHD));
    expect(largeur(COLONNE_TITRES, UHD_4K)).toBeGreaterThanOrEqual(largeur(COLONNE_TITRES, QHD));
  });

  it('la dalle 4K cesse d’être vide — l’écran est réellement occupé', () => {
    // Le grief chiffré de d0b5d74c : « ~17 % de large » pour la pochette et un
    // îlot plafonné à 1200 px, soit 31 % d'une dalle 3840 px.
    const partPochette = largeur(POCHETTE, UHD_4K) / UHD_4K.largeur;
    const partIlot = largeur(ILOT, UHD_4K) / UHD_4K.largeur;
    expect(partPochette).toBeGreaterThanOrEqual(0.25);
    expect(partIlot).toBeGreaterThanOrEqual(0.5);
  });
});

describe('Les paliers restent géométriquement tenables', () => {
  // `.content-layout.wide` pose `gap: 40px` entre la pochette et la colonne.
  // Si la somme dépassait l'îlot, le navigateur comprimerait l'un des deux et
  // la tracklist redeviendrait illisible — le symptôme d'Alain, déplacé.
  const ECART = 40;

  it('l’écart de 40 px est bien celui déclaré par la feuille', () => {
    // Sinon la constante ci-dessus dériverait en silence.
    expect(SOURCE).toMatch(/\.content-layout\.wide\s*\{[^}]*gap:\s*40px/);
  });

  for (const ecran of [FULL_HD, QHD, UHD_4K]) {
    it(`pochette + colonne + écart tiennent dans l’îlot à ${ecran.largeur} px`, () => {
      const total = largeur(POCHETTE, ecran) + largeur(COLONNE_TITRES, ecran) + ECART;
      expect(total).toBeLessThanOrEqual(largeur(ILOT, ecran));
    });
  }
});
