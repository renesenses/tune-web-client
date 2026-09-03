/**
 * Le bandeau de l'accueil salue la personne.
 *
 * Bertrand, 03/09/2026 : « remplace "Votre page" par Bonjour ou bonsoir
 * username ! ».
 */
import { describe, it, expect } from 'vitest';
import { nomASaluer, cleSalutation, salutation } from '../salutation';
import { fr, en } from '../locales';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
/** Le vrai dictionnaire : un test contre un faux ne garde pas les clés. */
const traduire = (d: Record<string, string>) => (c: string) => d[c] ?? c;

describe('Qui saluer', () => {
  it('le profil nomme la personne', () => {
    expect(nomASaluer({ name: 'bertrand@mozaiklabs.fr', display_name: 'Bertrand' }, null)).toBe('Bertrand');
  });

  it('le profil SEMÉ par le serveur ne nomme personne', () => {
    // `INSERT OR IGNORE INTO profiles … VALUES (1, 'default', 'Default', 1)`.
    // « Bonsoir Default ! » saluerait une ligne de migration.
    expect(nomASaluer({ name: 'default', display_name: 'Default' }, null)).toBeNull();
    expect(nomASaluer({ name: 'Default', display_name: 'Default' }, 'Bertrand')).toBe('Bertrand');
  });

  it('un nom fait d’espaces n’est pas un nom', () => {
    expect(nomASaluer({ name: 'x', display_name: '   ' }, null)).toBeNull();
    expect(nomASaluer({ name: 'x', display_name: '   ' }, '  ')).toBeNull();
  });

  it('sans profil ni compte, on ne salue personne par son nom', () => {
    expect(nomASaluer(null, null)).toBeNull();
    expect(nomASaluer(undefined, undefined)).toBeNull();
  });
});

describe('Bonjour ou bonsoir', () => {
  it('la bascule est à 18 h, et la nuit reste au soir', () => {
    for (const h of [5, 9, 12, 17]) expect(cleSalutation(h, true), `${h} h`).toBe('v2.home.greetDay');
    for (const h of [18, 21, 23, 0, 4]) expect(cleSalutation(h, true), `${h} h`).toBe('v2.home.greetEvening');
  });

  it('sans nom, la clé change — sinon le modèle laisserait « {nom} » à l’écran', () => {
    expect(cleSalutation(9, false)).toBe('v2.home.greetDayPlain');
    expect(cleSalutation(21, false)).toBe('v2.home.greetEveningPlain');
  });
});

describe('Le bandeau, en français et en anglais', () => {
  it('rend le nom à sa place', () => {
    const p = { name: 'bertrand@mozaiklabs.fr', display_name: 'Bertrand' };
    expect(salutation(traduire(fr), p, null, 21)).toBe('Bonsoir Bertrand !');
    expect(salutation(traduire(fr), p, null, 9)).toBe('Bonjour Bertrand !');
    expect(salutation(traduire(en), p, null, 21)).toBe('Good evening, Bertrand!');
  });

  it('sans nom, aucun « {nom} » ne reste à l’écran', () => {
    for (const [langue, d] of [['fr', fr], ['en', en]] as const) {
      for (const h of [9, 21]) {
        const rendu = salutation(traduire(d), { name: 'default', display_name: 'Default' }, null, h);
        expect(rendu, `${langue} ${h} h`).not.toContain('{nom}');
        expect(rendu.trim().length, `${langue} ${h} h : bandeau vide`).toBeGreaterThan(0);
      }
    }
  });

  it('les quatre clés existent dans les DEUX dictionnaires', () => {
    for (const c of ['v2.home.greetDay', 'v2.home.greetEvening', 'v2.home.greetDayPlain', 'v2.home.greetEveningPlain']) {
      expect(fr[c as keyof typeof fr], `${c} manque en français`).toBeTruthy();
      expect(en[c as keyof typeof en], `${c} manque en anglais`).toBeTruthy();
    }
    // Les deux modèles nommés DOIVENT porter le trou, sinon le nom disparaît
    // en silence et le bandeau salue tout le monde pareil.
    for (const c of ['v2.home.greetDay', 'v2.home.greetEvening']) {
      expect(String(fr[c as keyof typeof fr]), `${c} fr`).toContain('{nom}');
      expect(String(en[c as keyof typeof en]), `${c} en`).toContain('{nom}');
    }
  });
});

describe('Où le bandeau s’affiche', () => {
  it('l’accueil salue, les écrans éditoriaux non', () => {
    expect(lire('../../components/v2/HomeV2.svelte').includes('<PageWidgets salut />'),
      'l’accueil a reperdu son salut').toBe(true);
    // Qobuz et Tidal instancient la MÊME page : sans la garde, « Bonsoir
    // Bertrand ! » remplacerait « Éditorial » et on ne saurait plus où l'on est.
    expect(/salut = false,/.test(lire('../../components/v2/PageWidgets.svelte')),
      'le salut est devenu le défaut : les écrans de service saluent aussi').toBe(true);
    expect(lire('../../components/v2/PageWidgets.svelte')
      .includes('{salut ? banniere : $t(cleEyebrow as any)}'),
      'le bandeau ne retombe plus sur la clé de la page').toBe(true);
  });
});
