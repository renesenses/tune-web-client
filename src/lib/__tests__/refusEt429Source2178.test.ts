/**
 * #2178 — un refus perd son sens en chemin, à la SOURCE.
 *
 * Deux défauts du même endroit, `lib/api.ts` :
 *
 *  1. `apiError()` — le chemin de `fetchJSON` — posait `status` et `code` mais
 *     jetait le délai d'un 429. Or les LECTURES du support (liste des tickets,
 *     fil, réponse, marquage lu) passent toutes par `fetchJSON`, et elles
 *     partagent le compteur d'envoi de mozaiklabs (mesuré le 29/08 :
 *     `x-ratelimit-limit: 10` sur le groupe `v1/support` entier). Un 429 sur
 *     l'une d'elles arrivait donc sans `retry_after`, et l'écran affichait
 *     « réessaie plus tard » alors que le serveur avait nommé le délai.
 *  2. Le 402 premium et le 401 étaient levés en `Error` NUE : ni `status`, ni
 *     `code`. Le refus arrivait au magasin indistinguable d'une panne réseau —
 *     `statutHttp()` rendait `undefined`, comme pour un `Failed to fetch`.
 *
 * Cette garde APPELLE les vraies fonctions d'`api.ts` contre un `fetch` stubé,
 * et fait passer l'erreur levée aux vrais consommateurs (`messageErreurSupport`,
 * `estRefusPremium`). Elle ne lit aucune chaîne d'un fichier source.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { messageErreurSupport, statutHttp, delaiAvantNouvelleTentative } from '../supportErrors';
import { estRefusPremium } from '../premiumRefus';
import { fr as frBrut } from '../locales';

const fr = frBrut as Record<string, string>;

vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
});
vi.stubGlobal('window', { ...globalThis.window, location: { hash: '' } });

/** Traduction identique à `tr1()` de SupportView : lecture + interpolation. */
const trFr = (key: string, vars?: Record<string, string | number>): string => {
  let s = fr[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
};

/** Réponse HTTP en échec, telle que la rend le relais support. */
function stubReponse(status: number, corps: unknown, entetes: Record<string, string> = {}) {
  const texte = JSON.stringify(corps);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status,
      statusText: 'Error',
      headers: { get: (n: string) => entetes[n] ?? entetes[n.toLowerCase()] ?? null },
      json: async () => corps,
      text: async () => texte,
    })) as unknown as typeof fetch,
  );
}

let api: typeof import('../api');

beforeEach(async () => {
  storage.clear();
  vi.resetModules();
  api = await import('../api');
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('429 sur une LECTURE du support (chemin fetchJSON)', () => {
  it('le délai annoncé dans le corps survit jusqu’à la phrase affichée', async () => {
    // 3540 s = 59 min : le plafond horaire réel de mozaiklabs.
    stubReponse(429, { error: 'rate_limited', message: 'Too Many Attempts.', retry_after: 3540 });

    const e = await api.getSupportTickets().then(
      () => { throw new Error('la lecture aurait dû échouer'); },
      (err: unknown) => err,
    );

    expect(statutHttp(e)).toBe(429);
    expect(delaiAvantNouvelleTentative(e)).toBe(3540);
    expect(messageErreurSupport(e, trFr, 'fr')).toBe(
      "Limite d'envoi du support atteinte : trop de messages en peu de temps. " +
        "Ton message n'a pas été envoyé — réessaie dans 59 minutes.",
    );
  });

  it('le délai annoncé en en-tête `Retry-After` survit aussi', async () => {
    stubReponse(429, { error: 'rate_limited' }, { 'Retry-After': '120' });

    const e = await api.getSupportTickets()
      .then(() => { throw new Error('la lecture aurait dû échouer'); }, (err: unknown) => err);

    expect(delaiAvantNouvelleTentative(e)).toBe(120);
    expect(messageErreurSupport(e, trFr, 'fr')).toContain('dans 2 minutes');
  });

  it('sans délai exploitable, on n’en invente pas', async () => {
    stubReponse(429, { error: 'rate_limited' });

    const e = await api.getSupportTickets()
      .then(() => { throw new Error('la lecture aurait dû échouer'); }, (err: unknown) => err);

    expect(delaiAvantNouvelleTentative(e)).toBeUndefined();
    expect(messageErreurSupport(e, trFr, 'fr')).toBe(fr['support.errorRateLimited']);
  });
});

describe('402 premium et 401 : un refus n’est pas une panne réseau', () => {
  it('le 402 arrive avec son statut ET son code, pas seulement son message', async () => {
    stubReponse(402, { error: 'premium_required', message: 'Parametric EQ requires Tune Premium' });

    const e = await api.getSupportTickets()
      .then(() => { throw new Error('la lecture aurait dû échouer'); }, (err: unknown) => err);

    // Le message reste celui que les appelants historiques comparent.
    expect((e as Error).message).toBe('premium_required');
    // …mais il n'est plus la SEULE façon de reconnaître le refus.
    expect(statutHttp(e)).toBe(402);
    expect((e as { code?: string }).code).toBe('premium_required');
    expect(estRefusPremium(e)).toBe(true);
    // Une panne réseau, elle, ne porte aucun statut : les deux se distinguent.
    expect(statutHttp(new Error('Failed to fetch'))).toBeUndefined();
  });

  it('le 401 arrive avec son statut', async () => {
    stubReponse(401, { error: 'unauthorized' });

    const e = await api.getSupportTickets()
      .then(() => { throw new Error('la lecture aurait dû échouer'); }, (err: unknown) => err);

    expect((e as Error).message).toBe('Session expired');
    expect(statutHttp(e)).toBe(401);
    expect(messageErreurSupport(e, trFr, 'fr')).toBe(fr['support.errorSessionExpired']);
  });
});
