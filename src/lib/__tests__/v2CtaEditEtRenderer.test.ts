/**
 * Deux gestes qui EXISTENT doivent rester BRANCHÉS.
 *
 * ## Le crayon sur les pochettes
 *
 * `PochetteActions` porte cinq actions, dont l'édition. Quatre écrans du v2
 * affichaient des albums de la bibliothèque avec cœur, étiquettes, lecture et
 * ouverture — mais sans `onEditer`. Le même disque avait donc un crayon dans
 * Bibliothèque et pas sur l'Accueil, les Favoris ni la Recherche. Le
 * commentaire de FavoritesV2 annonçait pourtant déjà « l'edition » parmi les
 * cinq gestes : la prose décrivait une intention que le code ne tenait pas.
 *
 * ## Le bloc « Avancé · renderer »
 *
 * `RendererConfig` est écrit, ses appels d'API aussi, et il n'était monté que
 * dans le client actuel. L'onglet Appareils du v2 n'offrait que quatre champs.
 * Rien ne signalait l'absence : aucune erreur, aucun test, juste sept réglages
 * DLNA introuvables.
 *
 * Ces deux pannes ont la même forme — du code juste, jamais appelé — et aucune
 * porte ne les voit. D'où ce test, qui lit les SOURCES.
 *
 * CE QU'IL NE PROUVE PAS : que le bouton s'affiche ni que la modale enregistre.
 * Il prouve que le fil n'est pas coupé, ce qui est exactement ce qui a lâché.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lire = (f: string) => readFileSync(join(process.cwd(), 'src/components/v2', f), 'utf8');

/** Écrans qui posent des pochettes d'albums de la BIBLIOTHÈQUE. */
const AVEC_CRAYON = ['LibraryV2.svelte', 'FavoritesV2.svelte', 'SearchV2.svelte', 'PageWidgets.svelte'];

/**
 * Une pochette et son contenu, du `<PochetteActions` au `</PochetteActions>`.
 *
 * Découper au premier `>` serait faux : `onLire={() => …}` en contient un, et
 * la garde ne tiendrait alors que par l'ORDRE des attributs — elle laisserait
 * passer le retrait de `onEditer` sur toute pochette qui le déclare tard.
 */
function pochettes(source: string): string[] {
  return source.split('<PochetteActions').slice(1).map((bloc) => {
    const fin = bloc.indexOf('</PochetteActions>');
    return fin < 0 ? bloc : bloc.slice(0, fin);
  });
}

/** Cible d'étiquettes déclarée par cette pochette, s'il y en a une. */
function cibleEtiquettes(bloc: string): string | null {
  return /etiquettes=\{[^}]*itemType: '(album|artist)'/.exec(bloc)?.[1] ?? null;
}

describe('v2 — le crayon reste branché sur les pochettes locales', () => {
  for (const fichier of AVEC_CRAYON) {
    it(`${fichier} : toute pochette qui offre les étiquettes offre l’édition`, () => {
      // Les deux exigent la MÊME chose : un identifiant de bibliothèque.
      // Là où l'un est proposé, l'autre est possible — et son absence n'est
      // donc pas une contrainte technique, mais un oubli.
      const blocs = pochettes(lire(fichier));
      expect(blocs.length, 'aucune pochette trouvée : le balayage ne garde rien').toBeGreaterThan(0);

      const sansCrayon = blocs
        .map((bloc, i) => ({ i, cible: cibleEtiquettes(bloc), crayon: /onEditer=/.test(bloc) }))
        .filter((p) => p.cible !== null && !p.crayon)
        .map((p) => `pochette #${p.i} (${p.cible})`);

      expect(
        sansCrayon,
        'ces pochettes offrent les étiquettes mais pas le crayon : ' +
          'le même objet aurait un crayon dans Bibliothèque et pas ici',
      ).toEqual([]);
    });

    it(`${fichier} monte une modale d’édition`, () => {
      // Sans elle, `onEditer` basculerait un état que personne ne rend :
      // le crayon serait là, et le clic sans effet.
      const source = lire(fichier);
      expect(
        /AlbumEditModal|RenommerModale/.test(source),
        'aucune modale d’édition montée — le crayon serait inerte',
      ).toBe(true);
    });
  }

  it('StreamingV2 n’en passe PAS : un album de service ne s’édite pas', () => {
    // `PUT /library/albums/{id}` prend un identifiant numérique ; un album
    // Qobuz s'identifie « kxend2k5wdg06 ». Mieux vaut une icône absente
    // qu'une icône morte.
    expect(lire('StreamingV2.svelte')).not.toContain('onEditer=');
  });
});

describe('v2 — la sortie mono reste atteignable, et dit quand elle n’agit pas', () => {
  const settings = lire('SettingsV2.svelte');

  it('la carte par zone expose le réglage', () => {
    // Le serveur l'accepte depuis #2362 ; aucun ecran v2 ne l'atteignait.
    expect(settings).toContain('api.updateZoneMonoDownmix');
    expect(settings).toContain("z.mono_downmix");
  });

  it('il est proposé sur TOUTES les zones, pas seulement les locales', () => {
    // Le cacher hors sortie locale le rendrait introuvable : sur une
    // installation ou tout sort par le reseau, il ne s'afficherait jamais.
    const bloc = settings.slice(0, settings.indexOf('api.updateZoneMonoDownmix'));
    const dernieres = bloc.slice(-600);
    expect(
      /\{#if[^}]*output_type[^}]*\}[^]*$/.test(dernieres),
      'le réglage est enfermé dans une garde sur le type de sortie',
    ).toBe(false);
  });

  it('l’écran dit pourquoi il n’agira pas hors sortie locale', () => {
    // Sans cette phrase, l'interrupteur MENT : accepte, persiste, sans effet.
    expect(settings).toContain("zoneConfig.monoLocalOnly");
    expect(settings).toMatch(/output_type \?\? ''\) !== 'local'/);
  });
});

describe('v2 — le bloc « Avancé · renderer » reste monté', () => {
  const settings = lire('SettingsV2.svelte');

  it('SettingsV2 importe RendererConfig', () => {
    expect(settings).toContain("import RendererConfig from '../RendererConfig.svelte'");
  });

  it('il lui passe la zone', () => {
    expect(settings).toMatch(/<RendererConfig\s+zone=\{z\}/);
  });

  it('il est réservé aux renderers réseau', () => {
    // Une sortie locale ne négocie ni protocole ni conteneur : le test de
    // découverte n'y aurait rien à interroger.
    const bloc = settings.slice(0, settings.indexOf('<RendererConfig'));
    expect(bloc.slice(-400)).toMatch(/'dlna'.*'openhome'|output_type/s);
  });
});
