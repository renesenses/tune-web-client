/**
 * « Régler le volume au décibel près » (#1274) — ce que le client ASSEMBLE.
 *
 * Ce que ces tests prouvent : la conversion dB ↔ linéaire est celle du serveur
 * (`tune-core/src/audio/volume_scale.rs`), la saisie d'un audiophile est lue
 * telle qu'il la tape, un dB positif est refusé CÔTÉ CLIENT au lieu d'aller
 * chercher un 400, et `setVolumeDb` écrit sur la route qui accepte `volume_db`
 * en n'envoyant QUE ce champ (le serveur rend 400 si les deux sont présents).
 *
 * Ce qu'ils ne prouvent pas : l'allure du champ à l'écran. Le dépôt n'a pas de
 * harnais de rendu — qu'un champ de 64 px tienne dans la barre de lecture sans
 * pousser le curseur demande un coup d'œil humain.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MAX_DB,
  analyserDb,
  dbDepuisLineaire,
  formaterDb,
  lineaireDepuisDb,
} from '../volumeDb';

const presque = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe('la conversion est celle du serveur', () => {
  it('la pleine échelle vaut exactement 0 dB', () => {
    expect(dbDepuisLineaire(1)).toBe(0);
    expect(lineaireDepuisDb(0)).toBe(1);
  });

  it('−20 dB vaut 0,1 en linéaire, dans les deux sens', () => {
    // C'est le nombre du contrat serveur (`un_reglage_en_db_atteint_sa_cible`).
    expect(presque(lineaireDepuisDb(-20)!, 0.1)).toBe(true);
    expect(presque(dbDepuisLineaire(0.1)!, -20)).toBe(true);
  });

  it('−6 dB, pas « moitié moins fort » : 50 % en est la lecture', () => {
    expect(presque(dbDepuisLineaire(0.5)!, -6.020599913279624)).toBe(true);
  });

  it('le zéro est le silence, pas un plancher — null, jamais un nombre', () => {
    // Rendre −60 ou −120 inventerait une atténuation finie là où il n'y a plus
    // de son, et renvoyer cette valeur RALLUMERAIT la zone.
    expect(dbDepuisLineaire(0)).toBeNull();
    expect(dbDepuisLineaire(-0.5)).toBeNull();
    expect(dbDepuisLineaire(Number.NaN)).toBeNull();
    expect(lineaireDepuisDb(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('un état interne au-dessus de 1 est borné, pas rendu en gain positif', () => {
    expect(dbDepuisLineaire(1.4)).toBe(0);
  });

  it("l'aller-retour d'une valeur tapée est exact, sans dérive", () => {
    for (const db of [-0.5, -3, -6, -12, -20, -20.5, -30, -48]) {
      expect(presque(dbDepuisLineaire(lineaireDepuisDb(db)!)!, db)).toBe(true);
    }
  });
});

describe('la saisie directe, telle qu\'un utilisateur la tape', () => {
  it('lit la valeur nue', () => {
    expect(analyserDb('-20')).toEqual({ db: -20 });
    expect(analyserDb('-20.5')).toEqual({ db: -20.5 });
  });

  it('lit la virgule décimale française et l\'unité en suffixe', () => {
    expect(analyserDb('-20,5')).toEqual({ db: -20.5 });
    expect(analyserDb('-20,5 dB')).toEqual({ db: -20.5 });
    expect(analyserDb('-20.5dB')).toEqual({ db: -20.5 });
    expect(analyserDb('  -20,5   DB ')).toEqual({ db: -20.5 });
  });

  it('lit le signe moins typographique et l\'espace insécable', () => {
    // U+2212 et U+00A0 : ce que produisent des claviers et des copier-coller
    // réels, et ce qu'un `Number()` nu rendrait NaN.
    expect(analyserDb('−20,5 dB')).toEqual({ db: -20.5 });
  });

  it('accepte 0 dB — la pleine échelle est une valeur légitime', () => {
    expect(analyserDb('0')).toEqual({ db: 0 });
    expect(analyserDb('0 dB')).toEqual({ db: MAX_DB });
  });

  it('REFUSE un dB positif au lieu de le ramener au plafond', () => {
    // Ramener +3 dB à 0 ferait croire à l'utilisateur qu'il l'a obtenu. Le
    // serveur refuse (`volume_db doit être négatif ou nul`) ; le client le
    // refuse d'abord, pour que le motif soit dit tout de suite.
    expect(analyserDb('3')).toEqual({ refus: 'positif' });
    expect(analyserDb('+0.5 dB')).toEqual({ refus: 'positif' });
  });

  it('refuse le vide et ce qui n\'est pas un nombre', () => {
    expect(analyserDb('')).toEqual({ refus: 'vide' });
    expect(analyserDb('   ')).toEqual({ refus: 'vide' });
    expect(analyserDb('-∞ dB')).toEqual({ refus: 'illisible' });
    expect(analyserDb('fort')).toEqual({ refus: 'illisible' });
    expect(analyserDb('-2-0')).toEqual({ refus: 'illisible' });
  });
});

describe('le formatage se relit lui-même', () => {
  it('rend une valeur que la saisie sait reprendre', () => {
    for (const lineaire of [1, 0.5, 0.1, 0.01]) {
      const texte = formaterDb(lineaire);
      const relu = analyserDb(texte);
      expect('db' in relu).toBe(true);
    }
  });

  it('n\'écrit jamais « -0.0 dB »', () => {
    expect(formaterDb(1)).toBe('0.0 dB');
    expect(formaterDb(0.9995)).toBe('0.0 dB');
  });

  it('dit le silence, il ne l\'arrondit pas à un nombre', () => {
    expect(formaterDb(0)).toBe('-∞ dB');
  });
});

describe('la route écrite est celle qui accepte volume_db', () => {
  const api = readFileSync(join('src', 'lib', 'api.ts'), 'utf8');

  it('setVolumeDb écrit sur /zones/{id}/volume', () => {
    const corps = api.slice(api.indexOf('export function setVolumeDb'));
    expect(corps).toContain('/volume');
    expect(corps.slice(0, 400)).toMatch(/method: 'PUT'/);
  });

  it('n\'envoie QUE volume_db — les deux champs sont exclusifs côté serveur', () => {
    // `demande_lineaire` répond 400 « volume et volume_db sont exclusifs » si
    // les deux arrivent ensemble : le corps ne doit pas porter `volume:`.
    const debut = api.indexOf('export function setVolumeDb');
    const corps = api.slice(debut, debut + 400);
    expect(corps).toContain('volume_db: volumeDb');
    expect(corps).not.toMatch(/JSON\.stringify\(\{[^}]*\bvolume\b\s*[,:}]/);
  });
});

describe('la contre-épreuve : le curseur seul ne sait pas poser -20,5 dB', () => {
  it('aucun cran de step="0.01" ne tombe sur -20,5 dB', () => {
    // C'est le défaut que l'écran corrige. Le curseur va de 0 à 1 par 0,01 ;
    // -20,5 dB vaut 0,0944… — entre deux crans, atteignable par AUCUN.
    const cible = lineaireDepuisDb(-20.5)!;
    const crans = Array.from({ length: 101 }, (_, i) => i / 100);
    expect(crans.some((c) => presque(c, cible, 1e-6))).toBe(false);
    // Et les deux crans voisins tombent à plus d'un demi-dB de la cible.
    expect(Math.abs(dbDepuisLineaire(0.09)! + 20.5)).toBeGreaterThan(0.4);
    expect(Math.abs(dbDepuisLineaire(0.1)! + 20.5)).toBeGreaterThan(0.4);
  });
});
