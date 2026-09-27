// renesenses/tune-server-rust#2680, fil 221 — « redirect_uri: Insecure ».
//
// L'écran ne disait ni QUELLE URI déclarer dans le tableau de bord Spotify, ni
// qu'une URI en `http://<IP LAN>` ou `localhost` serait refusée, ni quoi faire
// quand Tune tourne sur une autre machine (le rappel 127.0.0.1 ne s'ouvre que
// dans le navigateur du serveur). Ces trois décisions d'affichage sont ici.
import { describe, expect, it } from 'vitest';
import { cleDuRefus, rappelAboutitIci, rappelEnBouclage } from '../redirectionSpotify';
import fr from '../locales/fr';
import en from '../locales/en';

const DEFAUT = 'http://127.0.0.1:8888/api/v1/streaming/spotify/callback';

describe('redirection Spotify (#2680)', () => {
  it('reconnaît le rappel en boucle locale, et seulement lui', () => {
    expect(rappelEnBouclage(DEFAUT)).toBe(true);
    expect(rappelEnBouclage('http://[::1]:8888/api/v1/streaming/spotify/callback')).toBe(true);
    expect(rappelEnBouclage('https://tune.example/api/v1/streaming/spotify/callback')).toBe(false);
    expect(rappelEnBouclage('http://192.168.1.20:8888/callback/spotify')).toBe(false);
    expect(rappelEnBouclage(null)).toBe(false);
  });

  it('propose de coller l’adresse quand la page est ouverte depuis une autre machine', () => {
    expect(rappelAboutitIci(DEFAUT, '127.0.0.1')).toBe(true);
    expect(rappelAboutitIci(DEFAUT, 'localhost')).toBe(true);
    expect(rappelAboutitIci(DEFAUT, '192.168.1.20')).toBe(false);
    expect(rappelAboutitIci(DEFAUT, 'nas.local')).toBe(false);
    // Une URI HTTPS déclarée par l'exploitant aboutit d'où que l'on soit.
    expect(rappelAboutitIci('https://tune.example/cb', '192.168.1.20')).toBe(true);
  });

  it('nomme chaque refus du serveur par une phrase traduite', () => {
    expect(cleDuRefus(null)).toBeNull();
    expect(cleDuRefus(undefined)).toBeNull();
    for (const refus of ['localhost', 'http_hors_bouclage']) {
      const cle = cleDuRefus(refus);
      expect(cle).not.toBeNull();
      expect((fr as Record<string, string>)[cle!]).toBeTruthy();
      expect((en as Record<string, string>)[cle!]).toBeTruthy();
    }
    expect((en as Record<string, string>)['v2.set.spotifyRedirectInsecure']).toContain('Insecure');
  });
});
