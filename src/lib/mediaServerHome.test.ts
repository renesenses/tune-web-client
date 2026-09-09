import { describe, it, expect } from 'vitest';
import {
  estUnServeurTune,
  ouvertureParDefaut,
  CONTENEUR_ALBUMS,
  RAYONS_TUNE,
} from './mediaServerHome';
import * as locales from './locales';

const srv = (manufacturer: string, model: string) => ({ manufacturer, model });

describe('estUnServeurTune', () => {
  it('reconnaît ce que Tune annonce vraiment', () => {
    // `upnp_server.rs` : <manufacturer>MozAIk Labs</manufacturer>
    //                   <modelName>Tune</modelName>
    expect(estUnServeurTune(srv('MozAIk Labs', 'Tune'))).toBe(true);
  });

  it('ne se laisse pas arrêter par la casse ni les espaces', () => {
    expect(estUnServeurTune(srv('mozaik labs', 'tune'))).toBe(true);
    expect(estUnServeurTune(srv('  MozAIk Labs  ', ' Tune '))).toBe(true);
  });

  it('exige les DEUX champs', () => {
    // Le modèle seul dirait « Tune » pour n'importe quel appareil qui aurait
    // choisi ce nom ; le fabricant seul laisserait passer un futur produit de
    // la maison qui n'exposerait pas la même racine.
    expect(estUnServeurTune(srv('Autre Marque', 'Tune'))).toBe(false);
    expect(estUnServeurTune(srv('MozAIk Labs', 'Tune Bridge'))).toBe(false);
  });

  it('ne confond pas les serveurs tiers', () => {
    for (const s of [
      srv('Synology', 'DiskStation'),
      srv('MinimServer', 'MinimServer'),
      srv('Plex', 'Plex Media Server'),
      srv('', ''),
    ]) {
      expect(estUnServeurTune(s)).toBe(false);
    }
  });

  it('supporte des champs absents', () => {
    expect(estUnServeurTune({ manufacturer: undefined as any, model: undefined as any })).toBe(
      false,
    );
  });
});

describe('ouvertureParDefaut', () => {
  it('ouvre un serveur Tune sur les albums', () => {
    const o = ouvertureParDefaut(srv('MozAIk Labs', 'Tune'));
    expect(o).toEqual({ objectId: CONTENEUR_ALBUMS, titre: 'Albums' });
  });

  it("rend null pour un serveur tiers — la racine reste le comportement neutre", () => {
    // On ne sait pas ce qu'un serveur inconnu expose ni comment il l'appelle :
    // lui imposer un dossier serait deviner.
    expect(ouvertureParDefaut(srv('Synology', 'DiskStation'))).toBeNull();
  });
});

describe('RAYONS_TUNE', () => {
  it("reprend la racine du serveur, identifiants et ordre compris", () => {
    // `ROOT_CONTAINERS` dans tune-core/src/upnp_server.rs se declare la seule
    // source de verite : ces identifiants doivent lui correspondre, sinon les
    // onglets ouvrent des dossiers qui n'existent pas.
    expect(RAYONS_TUNE.map((r) => r.objectId)).toEqual([
      'artists',
      'albums',
      'genres',
      'years',
      'tracks',
      'radios',
      'playlists',
    ]);
  });

  it('en compte SEPT, comme la racine du serveur (#2971)', () => {
    // `ROOT_CONTAINERS: [(&str, &str, &str); 7]`. `years` (#1789) puis
    // `playlists` (#1802) ont ete ajoutes cote serveur sans que cette liste
    // suive : Jean Valjean (forum 1625) ne voyait que cinq raccourcis et
    // devait revenir a la racine pour atteindre Annees et Playlists. Le
    // serveur verrouille les sept sur la reponse SOAP (`f47ed045`) ; ici on
    // verrouille l'autre bout du contrat. Le message reprend celui du serveur.
    expect(RAYONS_TUNE.length, 'la barre de rayons ne compte pas les sept rayons').toBe(7);
    expect(RAYONS_TUNE.map((r) => r.objectId)).toEqual(expect.arrayContaining(['years', 'playlists']));
  });

  it('inclut le rayon sur lequel on ouvre par defaut', () => {
    // Sans cela, l'onglet actif au premier affichage n'existerait pas.
    expect(RAYONS_TUNE.some((r) => r.objectId === CONTENEUR_ALBUMS)).toBe(true);
  });

  it('porte une cle de traduction pour chaque rayon', () => {
    for (const r of RAYONS_TUNE) {
      expect(r.cle).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
    }
  });

  it('chaque cle est traduite dans les onze langues', () => {
    // Un rayon dont la cle manque afficherait la cle brute (`common.years`)
    // dans l'onglet. `check-i18n` ne voit pas ces cles : elles sont lues
    // dynamiquement (`$tr(r.cle)`), pas ecrites en clair dans un composant.
    const langues = Object.entries(locales) as [string, Record<string, string>][];
    expect(langues.length).toBe(11);
    for (const [langue, dico] of langues) {
      for (const r of RAYONS_TUNE) {
        expect(typeof dico[r.cle], `${langue} : ${r.cle}`).toBe('string');
        expect(dico[r.cle].trim().length, `${langue} : ${r.cle} vide`).toBeGreaterThan(0);
      }
    }
  });
});
