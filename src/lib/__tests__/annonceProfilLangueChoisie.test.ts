// @vitest-environment jsdom
//
// Bandeau « Profil : X » en FRANÇAIS sous une interface ANGLAISE (rc12).
//
// Cache vidé — le seul cas où l'annonce de web#2099 part —, le client démarre
// dans la langue du navigateur ; la langue CHOISIE n'arrive qu'avec les
// préférences relues du serveur, qui partent EN MÊME TEMPS que l'annonce
// (`v2Bootstrap`). Le texte, figé par `get(t)` au moment de l'annonce, restait
// dans la langue d'avant. Il suit désormais la langue active tant qu'il est
// affiché.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import lFr from '../locales/fr';
import lEn from '../locales/en';
import lDe from '../locales/de';

const fr = lFr as unknown as Record<string, string>;
const en = lEn as unknown as Record<string, string>;

const PROFILS = [
  { id: 1, name: 'Default', avatar_color: '#000' },
  { id: 2, name: 'b@exemple.fr', display_name: 'Bertrand', avatar_color: '#111' },
  { id: 3, name: 'marie', avatar_color: '#222' },
];

async function modules(langueDeDepart: 'fr' | 'en') {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const charge = /\/profiles$/.test(url) ? PROFILS : [];
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  vi.resetModules();
  const i18n = await import('../i18n');
  i18n.enregistrerDictionnaire('fr', lFr as any);
  i18n.enregistrerDictionnaire('en', lEn as any);
  i18n.enregistrerDictionnaire('de', lDe as any);
  i18n.locale.set(langueDeDepart);
  const profil = await import('../stores/profile');
  const annonce = await import('../annonceProfilRepli');
  const { notifications } = await import('../stores/notifications');
  await profil.loadProfiles();
  const messages = () => get(notifications).map((n) => n.message);
  return { i18n, annonce, notifications, messages };
}

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('annonce du profil de repli : la langue choisie, pas celle du démarrage', () => {
  it('🔴 annonce partie avant la préférence (navigateur français), anglais posé ensuite : le bandeau passe en anglais', async () => {
    const { i18n, annonce, messages } = await modules('fr');
    annonce.annoncerProfilDeRepli();
    expect(messages()).toEqual([fr['profiles.fallbackNotice'].replace('{name}', 'Bertrand')]);
    // La préférence relue du serveur, appliquée par `ShellV2`.
    i18n.locale.set('en');
    expect(messages()).toEqual([en['profiles.fallbackNotice'].replace('{name}', 'Bertrand')]);
    expect(en['profiles.fallbackNotice']).not.toBe(fr['profiles.fallbackNotice']);
  });

  it('fermée, elle ne revient pas au changement de langue suivant, et son suivi s’arrête', async () => {
    const { i18n, annonce, notifications, messages } = await modules('fr');
    const { _nombreDeSuivies } = await import('../notificationTraduite');
    annonce.annoncerProfilDeRepli();
    expect(_nombreDeSuivies()).toBe(1);
    i18n.locale.set('en');
    expect(messages()).toEqual([en['profiles.fallbackNotice'].replace('{name}', 'Bertrand')]);
    const [n] = get(notifications);
    notifications.dismiss(n.id);
    expect(_nombreDeSuivies()).toBe(0);
    i18n.locale.set('de');
    expect(messages()).toEqual([]);
  });
});

/** `common.serverUnreachable`, par `fetchJSON` (`api/_client.ts`) sur un serveur muet. */
async function serveurMuet() {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
  // Chaque appel est hors de la fenêtre anti-rafale de 5 s de `showNetworkError`.
  let maintenant = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => (maintenant += 10_000));
  vi.resetModules();
  const i18n = await import('../i18n');
  i18n.enregistrerDictionnaire('fr', lFr as any);
  i18n.enregistrerDictionnaire('en', lEn as any);
  i18n.locale.set('fr');
  const { fetchJSON } = await import('../api/_client');
  const { notifications } = await import('../stores/notifications');
  const { _nombreDeSuivies } = await import('../notificationTraduite');
  const echouer = () => fetchJSON('/api/v1/zones').catch(() => undefined);
  return { i18n, notifications, _nombreDeSuivies, echouer };
}

describe('common.serverUnreachable : traduite, persistante, suivie une seule fois', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('🔴 deux erreurs réseau : même notification, UN SEUL abonnement', async () => {
    const { notifications, _nombreDeSuivies, echouer } = await serveurMuet();
    await echouer();
    await echouer();
    const liste = get(notifications);
    expect(liste.length).toBe(1);
    expect(liste[0].count).toBe(2);
    expect(_nombreDeSuivies()).toBe(1);
  });

  it('🔴 partie en français, l’anglais choisi la retraduit ; elle reste affichée', async () => {
    const { i18n, notifications, echouer } = await serveurMuet();
    await echouer();
    expect(get(notifications).map((n) => n.message)).toEqual([fr['common.serverUnreachable']]);
    i18n.locale.set('en');
    const liste = get(notifications);
    expect(liste.map((n) => n.message)).toEqual([en['common.serverUnreachable']]);
    expect(liste[0].duration).toBe(0);
    expect(en['common.serverUnreachable']).not.toBe(fr['common.serverUnreachable']);
  });
});

describe('remplacerMessage', () => {
  it('sans changement de texte, les abonnés ne sont pas réveillés', async () => {
    vi.resetModules();
    const { notifications } = await import('../stores/notifications');
    const id = notifications.info('a', 0);
    let reveils = 0;
    const stop = notifications.subscribe(() => { reveils++; });
    notifications.remplacerMessage(id, 'a');
    expect(reveils).toBe(1);
    notifications.remplacerMessage(id, 'b');
    expect(reveils).toBe(2);
    stop();
  });
});
