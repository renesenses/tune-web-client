// web#2750 point 9 — FabienM, fil 2723 : « Menu Accueil, widget "Vos favoris" :
// renommer en "Albums favoris" car ce sont uniquement les albums favoris qui
// sont affichés ». Go de Bertrand du 12/11/2026 (rc12).
//
// Le titre du widget `favoris` dit désormais ce qu'il montre, dans les quinze
// langues, avec le MÊME libellé que la bande « Albums favoris » des écrans de
// service (`v2.svc.wFavAlbums`) : un seul nom pour une seule chose.
import { describe, expect, it } from 'vitest';
import { widgetParId } from '../accueilWidgets';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

describe('web#2750 point 9 — « Albums favoris » sur l’Accueil', () => {
  it('le widget `favoris` garde sa clé de titre (les dispositions enregistrées ne bougent pas)', () => {
    expect(widgetParId('favoris')!.cleTitre).toBe('v2.home.wFavorites');
  });

  it('🔴 en français : « Albums favoris », plus « Vos favoris »', () => {
    expect(dictionnaire('fr')['v2.home.wFavorites']).toBe('Albums favoris');
  });

  it.each(ONZE_LANGUES)('%s : le titre est celui des albums favoris des services', (code) => {
    const d = dictionnaire(code);
    expect(d['v2.svc.wFavAlbums'], `${code} : v2.svc.wFavAlbums absent`).toBeTruthy();
    expect(d['v2.home.wFavorites']).toBe(d['v2.svc.wFavAlbums']);
  });
});
