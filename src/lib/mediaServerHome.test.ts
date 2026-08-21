import { describe, it, expect } from 'vitest';
import { estUnServeurTune, ouvertureParDefaut, CONTENEUR_ALBUMS } from './mediaServerHome';

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
