// @vitest-environment jsdom
//
// renesenses/tune-server-rust#8198, volet 1 — les refus de connexion Spotify
// se disent en phrases qui disent QUOI FAIRE, dans la langue de l'interface,
// et jamais avec le texte brut du serveur (français sans accents).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLES_CODES_SPOTIFY, cleCodeSpotify } from '../messagesSpotify';
import { natureErreurConnexion } from '../erreurConnexionService';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
import { locale } from '../i18n';

const CODES_DU_CONTRAT = [
  'spotify_callback_sans_code',
  'spotify_autorisation_refusee',
  'spotify_state_inconnu',
  'spotify_client_id_absent',
  'spotify_code_invalide',
  'spotify_redirect_uri_differente',
  'spotify_client_id_refuse',
  'spotify_compte_non_autorise',
];

describe('#8198 — les huit codes du tableau A', () => {
  it('chaque code du contrat a sa clé, et rien d’autre n’en a', () => {
    for (const c of CODES_DU_CONTRAT) expect(cleCodeSpotify(c), c).toMatch(/^v2\.spotify\.err\./);
    expect(Object.keys(CLES_CODES_SPOTIFY).sort()).toEqual([...CODES_DU_CONTRAT].sort());
    expect(cleCodeSpotify('invalid_credentials')).toBeNull();
    expect(cleCodeSpotify(undefined)).toBeNull();
    expect(cleCodeSpotify('toString')).toBeNull();
  });

  it('chaque phrase existe dans les quinze langues, traduite (pas l’anglais recopié)', () => {
    const en = dictionnaire('en');
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const cle of Object.values(CLES_CODES_SPOTIFY)) {
        expect(d[cle], `${l} ${cle}`).toBeTruthy();
        if (l !== 'en') expect(d[cle], `${l} ${cle} recopie l’anglais`).not.toBe(en[cle]);
      }
    }
  });

  it('`spotify_callback_sans_code` donne l’astuce Safari dans toutes les langues', () => {
    for (const l of ONZE_LANGUES) {
      expect(dictionnaire(l)['v2.spotify.err.callbackSansCode'], l).toContain('Safari');
    }
  });

  it('`spotify_compte_non_autorise` nomme User Management et le Premium du propriétaire', () => {
    const fr = dictionnaire('fr')['v2.spotify.err.compteNonAutorise'];
    expect(fr).toContain('User Management');
    expect(fr).toContain('Premium');
    expect(fr).toContain('propriétaire');
  });
});

describe('#8198 — le refus nommé n’est pas pris pour du JSON brut', () => {
  it('un code Spotify reste « texte » même si le détail porte le corps JSON', () => {
    expect(natureErreurConnexion({
      code: 'spotify_state_inconnu',
      message: 'Cliquez de nouveau sur « Se connecter ».',
      detail: '{"code":"spotify_state_inconnu","service":"spotify","error":"state inconnu"}',
    })).toBe('texte');
    // Sans code connu, la règle d'avant ne bouge pas.
    expect(natureErreurConnexion({ message: 'x', detail: '{"error":"y"}' })).toBe('brut');
  });
});

describe('#8198 — fetchJSON met la phrase traduite dans le message', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    locale.set('fr');
  });

  async function refus(code: string) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify({ code, service: 'spotify', error: 'texte serveur sans accents' }),
    }) as unknown as Response));
    const api = await import('../api');
    const { notifications } = await import('../stores/notifications');
    const erreur = vi.spyOn(notifications, 'error');
    try {
      await api.authenticateStreaming('spotify', { callback_url: 'http://127.0.0.1:8888/cb' });
      throw new Error('aurait dû échouer');
    } catch (e: any) {
      return { e, bandeaux: erreur.mock.calls.length };
    } finally {
      erreur.mockRestore();
    }
  }

  it('en français : la phrase de la clé, sans bandeau', async () => {
    locale.set('fr');
    const { e, bandeaux } = await refus('spotify_callback_sans_code');
    expect(e.code).toBe('spotify_callback_sans_code');
    expect(e.message).toBe(dictionnaire('fr')['v2.spotify.err.callbackSansCode']);
    expect(e.message).not.toContain('texte serveur');
    expect(bandeaux, 'l’écran de connexion affiche le message ; pas de bandeau en plus').toBe(0);
  });

  it('en anglais : la phrase anglaise', async () => {
    locale.set('en');
    const { e } = await refus('spotify_autorisation_refusee');
    expect(e.message).toBe(dictionnaire('en')['v2.spotify.err.autorisationRefusee']);
  });
});
