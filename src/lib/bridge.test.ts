// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  serverIdDepuisUrl,
  reinitialiserPourTest,
  viaRelais,
  jetonManquant,
  baseApi,
  entetesRelais,
  urlWebSocket,
  urlFlux,
} from './bridge';

const UUID = '75f24b9e-fb8a-4de2-8007-99edd3454263';

/** Place la page à une adresse donnée, comme si le relais l'avait servie. */
function pageA(pathname: string, hash = '') {
  const remplace = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      pathname,
      hash,
      search: '',
      origin: 'https://bridge.mozaiklabs.fr',
      host: 'bridge.mozaiklabs.fr',
      protocol: 'https:',
    },
  });
  Object.defineProperty(window, 'history', {
    configurable: true,
    value: { replaceState: remplace },
  });
  reinitialiserPourTest();
  return remplace;
}

beforeEach(() => {
  localStorage.clear();
  reinitialiserPourTest();
});

describe('détection du mode', () => {
  it('reconnaît un identifiant de serveur en tête de chemin', () => {
    pageA(`/${UUID}/`);
    expect(serverIdDepuisUrl()).toBe(UUID);
  });

  /// Servie normalement, l'application ne doit RIEN changer à son
  /// comportement : c'est la garantie qui rend ce chantier sans risque.
  it('ne s\'active pas quand la page est servie normalement', () => {
    pageA('/');
    expect(serverIdDepuisUrl()).toBeNull();
    expect(viaRelais()).toBe(false);
    expect(baseApi()).toBe('/api/v1');
    expect(entetesRelais()).toEqual({});
  });

  it('ignore un premier segment qui n\'a pas la forme d\'un UUID', () => {
    pageA('/library/albums');
    expect(serverIdDepuisUrl()).toBeNull();
  });
});

describe('jeton', () => {
  /// Le fragment n'est jamais envoyé au serveur, mais il resterait dans
  /// l'historique et dans une capture d'écran partagée.
  it('est lu depuis le fragment PUIS retiré de la barre d\'adresse', () => {
    const remplace = pageA(`/${UUID}/`, '#token=secret-123');
    expect(viaRelais()).toBe(true);
    expect(remplace).toHaveBeenCalled();
    const nouvelleUrl = remplace.mock.calls[0][2] as string;
    expect(nouvelleUrl).not.toContain('secret-123');
    expect(nouvelleUrl).not.toContain('token');
  });

  it('est conservé pour les ouvertures suivantes', () => {
    pageA(`/${UUID}/`, '#token=secret-123');
    expect(viaRelais()).toBe(true);
    // Nouvelle ouverture, sans fragment cette fois.
    pageA(`/${UUID}/`);
    expect(viaRelais()).toBe(true);
    expect(entetesRelais()).toEqual({ 'X-Bridge-Token': 'secret-123' });
  });

  /// Un identifiant sans jeton ne produirait que des 401 : il vaut mieux le
  /// dire à l'utilisateur que d'échouer en boucle.
  it('sans jeton, le mode distant ne s\'active pas et se signale', () => {
    pageA(`/${UUID}/`);
    expect(viaRelais()).toBe(false);
    expect(jetonManquant()).toBe(true);
    expect(baseApi()).toBe('/api/v1');
  });
});

describe('adresses', () => {
  beforeEach(() => pageA(`/${UUID}/`, '#token=jeton'));

  /// Le relais transmet `/api/relay/{id}/{chemin}` au serveur comme
  /// `/api/v1/{chemin}` : la base remplace exactement le préfixe.
  it('la base d\'API pointe vers le proxy du relais', () => {
    expect(baseApi()).toBe(`https://bridge.mozaiklabs.fr/api/relay/${UUID}`);
  });

  it('le jeton voyage sur son propre en-tête', () => {
    expect(entetesRelais()).toEqual({ 'X-Bridge-Token': 'jeton' });
  });

  /// La poignée de main WebSocket ne peut pas porter d'en-tête.
  it('le WebSocket porte le jeton en paramètre', () => {
    expect(urlWebSocket()).toBe(
      `wss://bridge.mozaiklabs.fr/ws/client/${UUID}?token=jeton`,
    );
  });
});

describe('URL de flux', () => {
  /// Le cœur du chantier : depuis un téléphone en 4G, `stream_url` pointe sur
  /// une adresse LAN qui ne mène nulle part.
  it('préfère l\'adresse distante quand elle existe', () => {
    pageA(`/${UUID}/`, '#token=jeton');
    const url = urlFlux(
      'http://192.168.1.18:8888/stream/abc.flac',
      `https://bridge.mozaiklabs.fr/stream/relay/${UUID}/abc.flac`,
    );
    expect(url).toBe(
      `https://bridge.mozaiklabs.fr/stream/relay/${UUID}/abc.flac?token=jeton`,
    );
  });

  it('garde l\'adresse locale hors du relais', () => {
    pageA('/');
    expect(urlFlux('http://192.168.1.18:8888/stream/abc.flac', null)).toBe(
      'http://192.168.1.18:8888/stream/abc.flac',
    );
  });

  /// Un serveur antérieur au lot 4 n'annonce pas la seconde adresse : on ne
  /// fabrique rien, on rend ce qu'on a.
  it('sans adresse distante, rend l\'adresse locale', () => {
    pageA(`/${UUID}/`, '#token=jeton');
    expect(urlFlux('http://192.168.1.18:8888/stream/abc.flac')).toBe(
      'http://192.168.1.18:8888/stream/abc.flac',
    );
  });

  it('rend null quand il n\'y a rien à jouer', () => {
    pageA('/');
    expect(urlFlux(null)).toBeNull();
    expect(urlFlux(undefined)).toBeNull();
  });
});
