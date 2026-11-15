// @vitest-environment jsdom
//
// renesenses/tune-server-rust#8198 — retours d'Alex en direct (09/11/2026, rc10) :
// (a) l'adresse de retour à déclarer apparaît, avec Copier, sous le Client ID
//     de la carte « Services & Jetons » (`spotify_redirect_uri` de la ligne,
//     sinon `GET /system/env`) ;
// (b) « Enregistrer » rend toujours un retour visible (« Enregistré » ou
//     « Inchangé »), et « Not configured » cède la place à l'étape suivante
//     quand `spotify_etape = a_connecter` ;
// (c) un Client ID refusé par Spotify se dit, avec son début et les causes
//     probables, dans le vérificateur ; son début est aussi montré à côté du
//     Client ID enregistré ;
// (d) un Save abandonne la connexion ouverte avant lui (lien à l'ancien
//     client_id, sondage, adresse collée).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';
import { cleEtapeSpotify, clientIdEnPlace, cleDuRetourClientId, lireRetourClientId } from '../clientIdSpotify';
import { adresseRetourDeLaLigne, causesDuRefus, corrections, debutClientId, lignesDiagnostic, texteCorrection } from '../diagnosticSpotify';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

const fr = dictionnaire('fr');
const ID = '0123456789abcdef0123456789abcdef';
const URI_LIGNE = 'http://127.0.0.1:8888/api/v1/streaming/spotify/callback';
const URI_ENV = 'http://127.0.0.1:9999/api/v1/streaming/spotify/callback';

describe('#8198 (a) — l’adresse de retour sous le Client ID', () => {
  it('celle de la ligne d’abord, celle de system/env sinon', () => {
    expect(adresseRetourDeLaLigne({ spotify_redirect_uri: URI_LIGNE }, URI_ENV)).toBe(URI_LIGNE);
    expect(adresseRetourDeLaLigne({}, URI_ENV)).toBe(URI_ENV);
    expect(adresseRetourDeLaLigne({ spotify_redirect_uri: '  ' }, null)).toBeNull();
  });
});

describe('#8198 (b) — « Inchangé » et l’étape suivante', () => {
  it('`inchange` est lu, compte comme en place, et a sa phrase', () => {
    const r = lireRetourClientId({ valid: true, etat: 'inchange', validation_message: 'deja' } as any);
    expect(r.etat).toBe('inchange');
    expect(clientIdEnPlace('inchange')).toBe(true);
    expect(clientIdEnPlace('enregistre')).toBe(true);
    expect(clientIdEnPlace('refuse')).toBe(false);
    expect(cleDuRetourClientId('inchange')).toBe('v2.set.spotifyClientIdUnchanged');
  });

  it('`a_connecter` remplace « Not configured » ; rien sinon', () => {
    expect(cleEtapeSpotify({ id: 'spotify', spotify_etape: 'a_connecter' })).toBe('v2.spotify.etape.aConnecter');
    expect(cleEtapeSpotify({ id: 'spotify', spotify_etape: 'client_id_manquant' })).toBeNull();
    expect(cleEtapeSpotify({ id: 'spotify', spotify_etape: 'connecte' })).toBeNull();
    expect(cleEtapeSpotify({ id: 'deezer', spotify_etape: 'a_connecter' })).toBeNull();
    for (const l of ONZE_LANGUES) {
      expect(dictionnaire(l)['v2.spotify.etape.aConnecter'], l).toBeTruthy();
      expect(dictionnaire(l)['v2.set.spotifyClientIdUnchanged'], l).toBeTruthy();
    }
  });
});

describe('#8198 (c) — Client ID refusé par Spotify', () => {
  const diag = {
    client_id: {
      etat: 'ok', spotify: 'refuse', debut: 'fa9d961a',
      causes_possibles: ['proprietaire_sans_premium', 'connexion_lancee_avant_le_client_id'],
    },
    a_corriger: ['client_id_refuse_par_spotify'],
  };

  it('la ligne Client ID le dit, avec son début', () => {
    const l = lignesDiagnostic(diag)[0];
    expect(l.valeur).toBe('v2.spotify.diag.clientIdRefuseParSpotify');
    expect(l.etat).toBe('ko');
    expect(l.extra).toBe('fa9d961a…');
    expect(lignesDiagnostic({ client_id: { etat: 'ok', spotify: 'accepte' } })[0].etat).toBe('ok');
  });

  it('🔴 la correction nomme le début et les causes, dans l’ordre du serveur', () => {
    const [c] = corrections(diag);
    expect(c.cle).toBe('v2.spotify.fix.clientIdRefuseIntro');
    expect(c.causes).toEqual(['v2.spotify.cause.proprietaireSansPremium', 'v2.spotify.cause.connexionAvant']);
    for (const l of ONZE_LANGUES) {
      const s = texteCorrection(dictionnaire(l)[c.cle], c, diag);
      expect(s, l).toContain('fa9d961a');
      expect(s, l).toContain('Basic Information');
      expect(s, l).not.toContain('{debut}');
      for (const k of c.causes!) expect(dictionnaire(l)[k], `${l} ${k}`).toBeTruthy();
    }
  });

  it('sans cause connue du serveur : les trois', () => {
    expect(causesDuRefus({ client_id: { causes_possibles: ['autre'] } })).toHaveLength(3);
    expect(causesDuRefus(null)).toHaveLength(3);
  });

  it('le refus `spotify_client_id_refuse` (échange) dit la même chose : les trois causes', () => {
    const fr = dictionnaire('fr')['v2.spotify.err.clientIdRefuse'];
    expect(fr).toContain('Basic Information');
    expect(fr).toContain('Se connecter');
    expect(fr).toContain('Premium');
    expect(fr).toContain('supprimée ou désactivée');
  });

  it('debutClientId coupe à 8 caractères', () => {
    expect(debutClientId('fa9d961a0000')).toBe('fa9d961a');
    expect(debutClientId(undefined)).toBeNull();
  });
});

// ── La carte « Services & Jetons » montée ───────────────────────────────────

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

function serveur(ligne: Record<string, unknown>, sauvegarde: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const methode = (init?.method ?? 'GET').toUpperCase();
    let charge: unknown = {};
    let status = 200;
    if (url.includes('/services/tokens/spotify') && methode === 'POST') charge = sauvegarde;
    else if (url.endsWith('/services/tokens')) charge = [{ id: 'spotify', name: 'Spotify', kind: 'oauth', fields: [], ...ligne }];
    else if (url.includes('/system/env')) charge = { spotify_redirect_uri: URI_ENV, spotify_client_id_configure: true };
    else if (url.includes('/streaming/spotify/diagnostic')) { status = 404; charge = { error: 'not found' }; }
    else if (url.includes('/streaming/services')) charge = { spotify: { enabled: true, authenticated: false } };
    else if (url.includes('/zones') || url.includes('/devices')) charge = [];
    return {
      ok: status === 200, status, statusText: status === 200 ? 'OK' : 'Not Found',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge), json: async () => charge,
    } as unknown as Response;
  }));
}

async function monterJetons() {
  locale.set('fr');
  v2SettingsTarget.set({ tab: 'access' as V2SettingsTabId, section: 'tokens' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  await souffler();
  return hote;
}

beforeEach(() => {
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
});

describe('#8198 — la carte « Services & Jetons »', () => {
  it('🔴 (a) l’adresse de retour et Copier sous le Client ID, depuis la ligne', async () => {
    serveur({ configured: true, spotify_client_id_configure: true, spotify_client_id_source: 'db', spotify_redirect_uri: URI_LIGNE, spotify_client_id_debut: 'fa9d961a' });
    const h = await monterJetons();
    const bloc = h.querySelector('[data-spotify-client-id-retour]');
    expect(bloc, 'le bloc suit le Client ID').toBeTruthy();
    expect(bloc!.querySelector('[data-spotify-jetons-redirect]')?.textContent).toBe(URI_LIGNE);
    expect(bloc!.querySelector('[data-copier-redirect-jetons]')).toBeTruthy();
    expect(bloc!.querySelector('[data-spotify-client-id-debut]')?.textContent).toContain('fa9d961a');
  });

  it('(a) serveur plus ancien : l’adresse de system/env', async () => {
    serveur({ configured: true, spotify_client_id_configure: true, spotify_client_id_source: 'db' });
    const h = await monterJetons();
    expect(h.querySelector('[data-spotify-jetons-redirect]')?.textContent).toBe(URI_ENV);
  });

  it('🔴 (b) `a_connecter` : l’étape suivante à la place de « Not configured »', async () => {
    serveur({ configured: false, spotify_client_id_configure: true, spotify_client_id_source: 'db', spotify_etape: 'a_connecter' });
    const h = await monterJetons();
    const etat = [...h.querySelectorAll('.svcstate')].map((x) => x.textContent?.trim());
    expect(etat).toContain(fr['v2.spotify.etape.aConnecter']);
    expect(etat).not.toContain(fr['serviceTokens.statusNotConfigured']);
  });

  it('🔴 (b) « Enregistrer » une valeur déjà en place : « Inchangé » s’affiche', async () => {
    serveur(
      { configured: true, spotify_client_id_configure: true, spotify_client_id_source: 'db' },
      { valid: true, etat: 'inchange', spotify_client_id_configure: true, validation_message: 'Client ID déjà enregistré' },
    );
    const h = await monterJetons();
    h.querySelector<HTMLButtonElement>('[data-modifier-client-id]')!.click();
    await souffler(2);
    const champ = h.querySelector<HTMLInputElement>('[data-saisie-client-id]')!;
    champ.value = ID;
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    await souffler(2);
    h.querySelector<HTMLButtonElement>('[data-enregistrer-client-id]')!.click();
    await souffler();
    const retour = h.querySelector('[data-spotify-save-retour]');
    expect(retour?.getAttribute('data-spotify-save-retour')).toBe('inchange');
    expect(retour?.textContent).toContain(fr['v2.set.spotifyClientIdUnchanged']);
  });
});

// ── (d) Save pendant une connexion ouverte ──────────────────────────────────

describe('#8198 (d) — un Save abandonne la connexion ouverte avant lui', () => {
  it('🔴 le lien à l’ancien client_id disparaît, le sondage s’arrête, l’adresse collée se vide', async () => {
    const appelsStatut: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const methode = (init?.method ?? 'GET').toUpperCase();
      let charge: unknown = {};
      let status = 200;
      if (url.includes('/streaming/spotify/auth') && methode === 'POST') {
        charge = { authenticated: false, verification_url: 'https://accounts.spotify.com/authorize?client_id=ANCIEN' };
      } else if (url.includes('/services/tokens/spotify') && methode === 'POST') {
        charge = { valid: true, etat: 'enregistre', spotify_client_id_configure: true };
      } else if (url.endsWith('/services/tokens')) {
        charge = [{ id: 'spotify', name: 'Spotify', kind: 'oauth', fields: [], configured: true, spotify_client_id_configure: true, spotify_client_id_source: 'db' }];
      } else if (url.includes('/system/env')) {
        // Page ouverte depuis une autre machine : le champ « adresse collée » est offert.
        charge = { spotify_redirect_uri: 'http://127.0.0.1:8888/api/v1/streaming/spotify/callback', spotify_client_id_configure: true };
      } else if (url.includes('/streaming/spotify/diagnostic')) { status = 404; charge = {}; }
      else if (url.includes('/streaming/services')) charge = { spotify: { enabled: true, authenticated: false } };
      else if (url.includes('/streaming/spotify/status')) { appelsStatut.push(url); charge = { authenticated: false }; }
      else if (url.includes('/zones') || url.includes('/devices')) charge = [];
      return {
        ok: status === 200, status, statusText: status === 200 ? 'OK' : 'Not Found',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(charge), json: async () => charge,
      } as unknown as Response;
    }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      locale.set('fr');
      v2SettingsTarget.set({ tab: 'access' as V2SettingsTabId, section: 'streaming' });
      hote = document.createElement('div');
      document.body.appendChild(hote);
      monte = mount(SettingsV2, { target: hote, props: {} });
      await souffler();
      const h = hote;
      const se = [...h.querySelectorAll<HTMLButtonElement>('.svc button')].find((b) => b.textContent?.trim() === 'Se connecter');
      se!.click();
      await souffler();
      expect(h.querySelector('a[href*="client_id=ANCIEN"]'), 'la connexion est ouverte').toBeTruthy();

      // Modifier le Client ID dans « Services & Jetons » (même écran, autre carte).
      h.querySelector<HTMLButtonElement>('[data-modifier-client-id]')!.click();
      await souffler(2);
      const champ = h.querySelector<HTMLInputElement>('[data-saisie-client-id]')!;
      champ.value = ID;
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      await souffler(2);
      h.querySelector<HTMLButtonElement>('[data-enregistrer-client-id]')!.click();
      await souffler();

      expect(h.querySelector('a[href*="client_id=ANCIEN"]'), 'le lien périmé a disparu').toBeNull();
      const avant = appelsStatut.length;
      await vi.advanceTimersByTimeAsync(10_000);
      expect(appelsStatut.length, 'le sondage est arrêté').toBe(avant);
    } finally {
      vi.useRealTimers();
    }
  });
});
