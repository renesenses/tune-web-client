// Widget d'accueil `radios-artistes` (clé `v2.home.wArtistRadios`) : il sert
// `/home/radio-picks`, c'est-à-dire les stations en favori puis les dernières
// écoutées. Son titre disait « Radios d'artistes ». Aligné sur l'app Android
// (tune-remote-flutter#236) : « Radios favorites et récentes », 15 langues,
// identifiant inchangé.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LANGUES = ['de', 'el', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nb', 'pl', 'ro', 'sv', 'vi', 'zh'];
const lire = (l: string) => readFileSync(resolve(__dirname, `../locales/${l}.ts`), 'utf-8');
const valeur = (l: string) => /"v2\.home\.wArtistRadios": "(.*?)",/.exec(lire(l))?.[1];

describe('widget radio-picks : « Radios favorites et récentes »', () => {
  it('français et anglais disent favorites et récentes', () => {
    expect(valeur('fr')).toBe('Radios favorites et récentes');
    expect(valeur('en')).toBe('Favorite & recent radios');
  });
  it.each(LANGUES)('%s : plus aucun « artiste »', (l) => {
    const v = valeur(l);
    expect(v, l).toBeTruthy();
    expect(v).not.toMatch(/artist|Künstler|καλλιτεχν|wykonawc|nghệ sĩ|艺人|アーティスト|아티스트|Előadói/i);
  });
  it('l’identifiant du widget et sa clé ne changent pas', () => {
    const src = readFileSync(resolve(__dirname, '../accueilWidgets.ts'), 'utf-8');
    expect(src).toContain("id: 'radios-artistes',\n    cleTitre: 'v2.home.wArtistRadios',");
  });
});
