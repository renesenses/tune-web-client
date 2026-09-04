// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

/**
 * #2559 — le suivi des tickets doit passer par le RELAIS du serveur Tune local,
 * jamais en direct vers mozaiklabs.fr.
 *
 * Trois propriétés sont éprouvées ici, et chacune correspond à un défaut réel
 * constaté dans la console d'un testeur :
 *
 *  1. l'appel part vers la MÊME ORIGINE — sinon le navigateur bloque la lecture
 *     de la réponse (CORS) dès que Tune est ouvert par l'adresse du serveur ;
 *  2. la CLÉ DE LICENCE ne circule pas dans l'URL — elle finissait sinon dans la
 *     barre d'adresse, l'historique et les journaux d'accès ;
 *  3. l'envoi d'une réponse vise `/reply` (le chemin du relais) et non
 *     `/replies` (celui de mozaiklabs) ;
 *  4. le « marquer lu » passe lui aussi par le relais — c'était le DERNIER
 *     appel encore adressé en direct au site, la clé de licence dans le corps.
 */

const appels: { url: string; init?: RequestInit }[] = [];

// Le chargement du module d'API est lent (gros fichier, effets de module). On le
// paie UNE fois ici, sinon son coût est imputé au premier test qui déborde.
//
// Budget à 120 s, pas 30 : sous la suite complète — une centaine de fichiers en
// parallèle — cet import dépassait les 30 s d'origine et le fichier échouait sur
// « Hook timed out in 30000ms », sans qu'aucune assertion soit en cause.
// Reproduit sur un arbre IDENTIQUE à `origin/main` (donc antérieur à ce
// correctif) : deux passes de la suite complète, deux échecs, alors que le même
// fichier lancé seul passe en moins de 30 s. Ce n'est pas un défaut du relais,
// c'est une échéance trop courte pour la charge réelle.
let api: typeof import('../api');
beforeAll(async () => {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: 200 })));
  api = await import('../api');
  vi.unstubAllGlobals();
}, 120000);

beforeEach(() => {
  appels.length = 0;
  vi.stubGlobal('fetch', (u: any, i?: RequestInit) => {
    appels.push({ url: String(u?.url ?? u), init: i });
    return Promise.resolve(
      new Response(JSON.stringify({ tickets: [], ticket: {}, replies: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
});
afterEach(() => vi.unstubAllGlobals());

const CLE = 'TUNE-8570-51ED-F6BC-3E51';

describe('support premium : passage par le relais local (#2559)', () => {
  it('la liste des tickets ne sort PAS vers mozaiklabs.fr', async () => {
    await api.getSupportTickets(CLE);
    // Pas « exactement un appel » : le module peut en déclencher d'autres à son
    // chargement. Ce qui compte est qu'AUCUN ne sorte vers mozaiklabs.fr.
    expect(appels.length).toBeGreaterThan(0);
    for (const a of appels) {
      expect(a.url, `appel sorti vers l'extérieur : ${a.url}`).not.toContain('mozaiklabs.fr');
    }
    expect(appels.some((a) => a.url.includes('/support/tickets'))).toBe(true);
  });

  it('la clé de licence ne circule JAMAIS dans l\'URL', async () => {
    await api.getSupportTickets(CLE);
    await api.getSupportTicket(7, CLE);
    await api.markSupportTicketRead(7);
    for (const a of appels) {
      expect(a.url, `clé exposée dans ${a.url}`).not.toContain(CLE);
      expect(a.url).not.toContain('license_key');
    }
  });

  it('« marquer lu » vise le relais local, pas mozaiklabs.fr', async () => {
    await api.markSupportTicketRead(42);
    expect(appels[0].url).toMatch(/\/support\/tickets\/42\/read$/);
    expect(appels[0].url).not.toContain('mozaiklabs.fr');
    expect(String(appels[0].init?.method ?? '').toUpperCase()).toBe('POST');
  });

  it('« marquer lu » n\'emporte plus la clé de licence dans son CORPS', async () => {
    // Le défaut n'était pas seulement dans l'URL : l'ancien appel postait
    // `{"license_key":"TUNE-…"}` vers mozaiklabs.fr. Le relais résout la
    // licence lui-même ; rien de secret ne doit plus partir de la page.
    await api.markSupportTicketRead(42, CLE);
    for (const a of appels) {
      const corps = typeof a.init?.body === 'string' ? a.init.body : '';
      expect(corps, `clé dans le corps de ${a.url}`).not.toContain(CLE);
      expect(corps).not.toContain('license_key');
    }
  });

  it('le détail d\'un ticket vise le relais local', async () => {
    await api.getSupportTicket(42, CLE);
    expect(appels[0].url).not.toContain('mozaiklabs.fr');
    expect(appels[0].url).toContain('/support/tickets/42');
  });

  it('une réponse est postée sur /reply, le chemin du relais — pas /replies', async () => {
    await api.postSupportTicketReply(42, CLE, 'bonjour');
    expect(appels[0].url).toMatch(/\/support\/tickets\/42\/reply$/);
    expect(appels[0].url).not.toContain('mozaiklabs.fr');
    // Le relais résout la licence lui-même : le corps ne la porte plus.
    const corps = JSON.parse(String(appels[0].init?.body ?? '{}'));
    expect(corps).toEqual({ body: 'bonjour' });
  });
});
