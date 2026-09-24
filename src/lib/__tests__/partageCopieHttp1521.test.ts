// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { partagerEcoute, lienDePartage, type CartePartage } from '../partageEcoute';
import { copyText } from '../utils';
import fr from '../locales/fr';

/**
 * #1521 — « Impossible de partager cette écoute », en HTTP sur une IP.
 *
 * Les testeurs atteignent Tune par `http://192.168.x.y:8888` : pas de contexte
 * sécurisé, donc `navigator.clipboard` est `undefined`. `writeText` jetait, le
 * `catch` de `handleShare` affichait « Impossible de partager cette écoute » —
 * alors que le serveur avait bel et bien créé le partage. Le message accusait
 * la mauvaise étape, et l'utilisateur n'avait rien à faire de cette phrase.
 */

const CARTE: CartePartage = {
  token: 'abc',
  url: '/shared/abc',
  url_absolue: 'http://192.168.1.42:8888/shared/abc',
  track: { title: 'Nefertiti', artist_name: 'Miles Davis', album_title: 'Nefertiti' },
};

describe('#1521 — la copie du partage en HTTP clair', () => {
  /** Le geste complet, tel que le vit un testeur sur son réseau local : la
   *  route répond, `navigator.clipboard` n'existe pas, et le texte doit
   *  QUAND MÊME atteindre le presse-papiers par `execCommand`. */
  it('copie vraiment hors contexte sécurisé, et annonce « copié »', async () => {
    const clipboardAvant = (globalThis.navigator as any).clipboard;
    // Le navigateur de réseau local : pas de Clipboard API du tout.
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: undefined, configurable: true,
    });
    (globalThis as any).window.isSecureContext = false;
    let colle: string | null = null;
    (document as any).execCommand = vi.fn(() => {
      colle = (document.querySelector('textarea') as HTMLTextAreaElement)?.value ?? null;
      return true;
    });

    const issue = await partagerEcoute({
      demanderCarte: async () => CARTE,
      copier: copyText,
      origine: 'http://192.168.1.42:8888',
    });

    expect(issue.etat).toBe('copie');
    expect(colle).toContain('Nefertiti');
    expect(colle).toContain('http://192.168.1.42:8888/shared/abc');

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: clipboardAvant, configurable: true,
    });
  });

  /** Le défaut d'origine, gardé comme témoin : l'ancien code appelait
   *  `navigator.clipboard.writeText` sans détour. Hors contexte sécurisé,
   *  `navigator.clipboard` est `undefined` — l'appel jette. */
  it("l'ancien chemin `navigator.clipboard.writeText` jetait, lui", () => {
    const faux = { clipboard: undefined } as any;
    expect(() => faux.clipboard.writeText('x')).toThrow();
  });

  /** TROIS causes, TROIS messages — c'est la seconde moitié de #1521. Un
   *  utilisateur à qui l'on dit « impossible de partager » alors que le
   *  partage a marché et que seule la copie a été refusée ne peut rien faire
   *  de cette phrase ; avec le lien, il le recopie à la main. */
  it('distingue la route refusée, le rien-à-partager et la copie refusée', async () => {
    const routeKo = await partagerEcoute({
      demanderCarte: async () => { throw new Error('500'); },
      copier: async () => true,
    });
    expect(routeKo.etat).toBe('routeRefusee');

    const vide = await partagerEcoute({
      demanderCarte: async () => ({ token: '', url: '', track: {} }),
      copier: async () => true,
    });
    expect(vide.etat).toBe('sansPiste');

    const copieKo = await partagerEcoute({
      demanderCarte: async () => CARTE,
      copier: async () => false,
      origine: 'http://192.168.1.42:8888',
    });
    expect(copieKo.etat).toBe('copieRefusee');
    // Le lien reste offert : c'est ce que l'utilisateur recopiera.
    expect(copieKo.etat === 'copieRefusee' && copieKo.lien)
      .toBe('http://192.168.1.42:8888/shared/abc');
  });

  /** Une copie qui JETTE reste un refus de copie, jamais un échec de partage :
   *  c'est exactement le cas `navigator.clipboard.writeText` en HTTP clair. */
  it('une exception de copie ne se fait pas passer pour un échec de partage', async () => {
    const issue = await partagerEcoute({
      demanderCarte: async () => CARTE,
      copier: async () => { throw new TypeError('clipboard is undefined'); },
    });
    expect(issue.etat).toBe('copieRefusee');
  });

  /** On n'annonce « copié » que sur un vrai `true` : le presse-papiers vide
   *  sous un bandeau « Copié ! » est le défaut que `copyText` existe pour
   *  éviter. */
  it('ne prétend jamais « copié » quand le presse-papiers est resté vide', async () => {
    const issue = await partagerEcoute({
      demanderCarte: async () => CARTE,
      copier: async () => false,
    });
    expect(issue.etat).not.toBe('copie');
  });

  it('le lien seul se calcule, avec ou sans adresse absolue du serveur', () => {
    expect(lienDePartage(CARTE)).toBe('http://192.168.1.42:8888/shared/abc');
    expect(lienDePartage({ ...CARTE, url_absolue: null }, 'http://192.168.1.42:8888/'))
      .toBe('http://192.168.1.42:8888/shared/abc');
  });

  /** Les deux nouveaux messages existent en français et portent le lien. */
  it('les messages distincts sont au catalogue', () => {
    expect((fr as any)['nowplaying.shareNothing']).toBeTruthy();
    expect((fr as any)['nowplaying.shareCopyRefused']).toContain('{lien}');
  });
});
