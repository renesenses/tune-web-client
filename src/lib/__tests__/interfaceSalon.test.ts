// Interface « Salon » (itération 1, 25/11/2026) — registre des interfaces,
// navigation interne, aides d'affichage, et la règle du thème : aucun visuel
// en dur dans les composants Salon, tout passe par le jeu de jetons.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  INTERFACES, STYLE_INTERFACE_DEFAUT, estStyleInterface, definitionInterface, salonActif,
  estThemeSalon, paletteV2DuSalon, pageDeLaVue, initiales, duree, minutesTotales,
  tuileLarge, joursDepuis, prenomDuProfil,
} from '../interfaceSalon';
import { CHARGEURS_JETONS } from '../../components/salon/jetons';
import { REGLAGES } from '../reglagesIndex';
import { V2_SETTINGS } from '../v2Settings';
import lFr from '../locales/fr';
import lEn from '../locales/en';

const DOSSIER_SALON = join(__dirname, '..', '..', 'components', 'salon');
const STYLES_SALON = join(__dirname, '..', '..', 'styles', 'salon');

describe('registre des interfaces', () => {
  it('l’interface actuelle est la première et le défaut', () => {
    expect(INTERFACES[0].id).toBe('actuelle');
    expect(STYLE_INTERFACE_DEFAUT).toBe('actuelle');
    expect(INTERFACES[0].coquille).toBe('actuelle');
  });

  it('identifiants uniques, libellés traduits en français et en anglais', () => {
    const ids = INTERFACES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const fr = lFr as unknown as Record<string, string>;
    const en = lEn as unknown as Record<string, string>;
    for (const i of INTERFACES) {
      for (const k of [i.libelle, i.aide]) {
        expect(fr[k], k).toBeTruthy();
        expect(en[k], k).toBeTruthy();
      }
    }
  });

  it('chaque coquille Salon désigne un jeu de jetons chargeable, et son fichier existe', () => {
    for (const i of INTERFACES.filter((x) => x.coquille === 'salon')) {
      expect(i.jetons, i.id).toBeTruthy();
      expect(CHARGEURS_JETONS[i.jetons!], i.id).toBeTypeOf('function');
      // Le fichier vit dans `styles/salon/`, ou dans le dossier du thème
      // (`styles/<jeu>/`, ainsi le thème « Néomorphique »).
      const dossier = join(STYLES_SALON, '..', i.jetons!);
      const ici = readdirSync(STYLES_SALON).includes(`jetons-${i.jetons}.css`);
      const chezLui = existsSync(dossier) && readdirSync(dossier).includes(`jetons-${i.jetons}.css`);
      expect(ici || chezLui, i.id).toBe(true);
    }
  });

  it('une valeur inconnue retombe sur l’interface actuelle', () => {
    expect(estStyleInterface('salon')).toBe(true);
    expect(estStyleInterface('inconnue')).toBe(false);
    expect(estStyleInterface(undefined)).toBe(false);
    expect(definitionInterface('inconnue').id).toBe('actuelle');
    expect(salonActif('salon')).toBe(true);
    expect(salonActif('actuelle')).toBe(false);
    expect(salonActif(null)).toBe(false);
  });

  it('thème de Salon : clair par défaut, palette v2 assortie', () => {
    expect(estThemeSalon('sombre')).toBe(true);
    expect(estThemeSalon('rose')).toBe(false);
    expect(paletteV2DuSalon('sombre')).toBe('dark-grey');
    expect(paletteV2DuSalon('clair')).toBe('clear-white');
    expect(paletteV2DuSalon(undefined)).toBe('clear-white');
  });
});

describe('le réglage « Interface » est EN TÊTE du premier écran des Réglages', () => {
  it('première section du premier onglet, avec ses deux ancres indexées', () => {
    expect(V2_SETTINGS[0].id).toBe('general');
    expect(V2_SETTINGS[0].sections[0].id).toBe('choixInterface');
    const ids = REGLAGES.filter((r) => r.section === 'choixInterface').map((r) => r.id);
    expect(ids).toEqual(['choix-interface', 'theme-salon']);
  });
});

describe('navigation de Salon', () => {
  it('vues de Tune → pages Salon', () => {
    expect(pageDeLaVue('home')).toEqual({ page: 'accueil' });
    expect(pageDeLaVue('library')).toEqual({ page: 'albums' });
    expect(pageDeLaVue('library', { album: 12 })).toEqual({ page: 'album', id: 12 });
    expect(pageDeLaVue('library', { artiste: 3 })).toEqual({ page: 'artiste', id: 3 });
    expect(pageDeLaVue('genres')).toEqual({ page: 'genres' });
    expect(pageDeLaVue('queue')).toEqual({ page: 'file' });
    expect(pageDeLaVue('settings')).toEqual({ page: 'tune', vue: 'settings' });
  });
});

describe('aides d’affichage', () => {
  it('initiales', () => {
    expect(initiales('Abdullah Ibrahim')).toBe('AI');
    expect(initiales('-M-')).toBe('M');
    expect(initiales('Adele')).toBe('AD');
    expect(initiales('')).toBe('?');
  });
  it('durées', () => {
    expect(duree(235000)).toBe('3:55');
    expect(duree(3_725_000)).toBe('1:02:05');
    expect(duree(null)).toBe('0:00');
    expect(minutesTotales([60000, 90000, null])).toBe(3);
  });
  it('mosaïque des genres : une tuile large par rangée, qui glisse', () => {
    const larges = Array.from({ length: 9 }, (_, i) => tuileLarge(i));
    expect(larges).toEqual([true, false, false, false, true, false, false, false, true]);
  });
  it('jours depuis l’ajout, en secondes ou en millisecondes', () => {
    const maintenant = Date.UTC(2026, 10, 25, 12);
    expect(joursDepuis(maintenant / 1000 - 3 * 86400, maintenant)).toBe(3);
    expect(joursDepuis(maintenant - 86_400_000, maintenant)).toBe(1);
    expect(joursDepuis(null, maintenant)).toBeNull();
  });
  it('prénom du profil', () => {
    expect(prenomDuProfil({ name: 'bertrand@exemple.fr', display_name: 'Bertrand' })).toBe('Bertrand');
    expect(prenomDuProfil({ name: 'bertrand@exemple.fr' })).toBe('bertrand');
    expect(prenomDuProfil(null)).toBe('');
  });
});

describe('thème : aucun visuel en dur dans les composants Salon', () => {
  const fichiers = readdirSync(DOSSIER_SALON).filter((f) => f.endsWith('.svelte'));
  it.each(fichiers)('%s — pas de couleur, de taille de texte ni de rayon littéral', (f) => {
    const style = readFileSync(join(DOSSIER_SALON, f), 'utf8').split('<style>')[1] ?? '';
    expect(style.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g), 'couleur en dur').toBeNull();
    expect(style.match(/font-size:\s*(?:calc\()?\d/g), 'taille de texte en dur').toBeNull();
    expect(style.match(/border-radius:\s*\d+px/g), 'rayon en dur').toBeNull();
    expect(style.match(/box-shadow:\s*\d/g), 'ombre en dur').toBeNull();
  });
  it('la mise en page et l’habillage des Réglages ne portent aucune couleur', () => {
    for (const f of ['mise-en-page.css', 'reglages.css']) {
      const css = readFileSync(join(STYLES_SALON, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g), f).toBeNull();
    }
  });
});
