// @vitest-environment jsdom
// 🔴 `renesenses/tune-web-client#859` — l'explication du serveur n'atteignait
// pas l'écran.
//
// FabienM signalait « Bandcamp, widget Mes playlists : 502 Bad Gateway ». Le
// code de statut a été corrigé côté serveur en v0.9.147 (501 Not Implemented,
// le bon), mais la moitié CLIENT reste : l'utilisateur lit « 501 Not
// Implemented » au lieu de « Bandcamp ne fournit pas de playlists ».
//
// MESURÉ le 12/09/2026 sur la .18 en v0.9.147 — le serveur rend TROIS formes,
// et `apiError` n'en lisait correctement AUCUNE :
//
//   501 text/plain  « Bandcamp ne fournit pas de playlists »
//   404 text/plain  « unknown service: inconnu »
//   404 JSON        {"error":"not found","path":"…"}
//   404 JSON        {"code":"not_found","error":"job not found: …"}
//   404 (corps vide)
//
// DEUX DÉFAUTS CUMULÉS
//  1. `response.json()` LÈVE sur text/plain et sur un corps vide ; le `catch`
//     avalait tout.
//  2. Sur le JSON, il lisait `detail` puis `message` — que ce serveur n'envoie
//     pas — et rangeait `body.error` dans `code`. Or `error` porte le MESSAGE
//     et `code` le code : les deux étaient inversés.
//
// ⚠️ Ça touche TOUTES les erreurs de l'application, pas le seul convertisseur.
//
// CONTRE-ÉPREUVE : chaque bloc en porte une qui rejoue l'ancien code sur le
// même corps et montre ce qu'il en faisait.

// 🔴 CE FICHIER A DÛ ÊTRE REFAIT. Mon premier jet recopiait la logique de
// `apiError` dans une fonction locale et la testait elle-même : le sabotage du
// vrai code passait au VERT. C'est le défaut que ce lot dénonce ailleurs — un
// test qui se nourrit lui-même ne garde rien. On passe donc par le chemin
// RÉEL : `fetch` est simulé, une vraie fonction d'API est appelée, et on lit
// l'erreur qu'elle lève.
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';

afterEach(() => vi.restoreAllMocks());

// 🔴 #2417 (26/10/2026) — LE CONTRAT A CHANGÉ, LA MOITIÉ DE #859 RESTE.
//
// #859 avait raison sur la LECTURE : le corps text/plain, le JSON `error` /
// `code`, rien ne doit se perdre. Il avait tort sur l'AFFICHAGE : recopier la
// phrase du serveur à l'écran, c'est montrer du français (« Bandcamp ne
// fournit pas de playlists ») à un anglophone (testeur Alex). Désormais :
//   - `err.message` : le code traduit, la phrase que le serveur dit avoir
//     traduite (`message_key`), ou le message générique ;
//   - `err.detail` : le texte brut du serveur, INTACT — le « Détails » replié.
// Ce banc garde donc la lecture (plus rien ne se perd, tout arrive dans
// `detail`) et vérifie qu'aucun brut n'atteint `message`.
import { get } from 'svelte/store';
import { t } from '../i18n';

const generique = () => get(t)('erreursServeur.generique');

/** Fait répondre le prochain `fetch` par ce corps, et rend l'erreur levée. */
async function erreurPour(corps: string, statut: number, type: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(corps, {
      status: statut,
      statusText: 'Not Implemented',
      headers: { 'content-type': type },
    }),
  );
  try {
    await api.getZones();
    throw new Error('la requête aurait dû lever');
  } catch (e: any) {
    return {
      message: e?.message as string,
      detail: (e?.detail ?? '') as string,
      code: e?.code as string | undefined,
    };
  }
}

/** L'ancien `apiError`, rejoué à la main : c'est le TÉMOIN, pas le sujet. */
async function ancien(corps: string, statut: number) {
  let detail = `${statut} Not Implemented`;
  let code: string | undefined;
  try {
    const body = JSON.parse(corps);
    if (body.detail) detail = body.detail;
    else if (body.message) detail = body.message;
    code = body.error;
  } catch { /* ignore — c'est justement ce qui perdait le message */ }
  return { detail, code };
}

describe('#859 — un corps text/plain', () => {
  const BC = 'Bandcamp ne fournit pas de playlists';

  it('🔴 la phrase du serveur n’est plus perdue : elle est dans le détail, pas à l’écran', async () => {
    const n = await erreurPour(BC, 501, 'text/plain');
    expect(n.detail).toContain(BC);
    expect(n.message, '#2417 : du français brut à l’écran').toBe(generique());
  });

  it('CONTRE-ÉPREUVE : l’ancien rendait le numéro, pas la phrase', async () => {
    const a = await ancien(BC, 501);
    expect(a.detail, 'le témoin ne reproduit pas la perte').toBe('501 Not Implemented');
    expect(a.detail).not.toContain('Bandcamp');
  });

  it('un autre cas réel : « unknown service: inconnu »', async () => {
    const n = await erreurPour('unknown service: inconnu', 404, 'text/plain');
    expect(n.detail).toContain('unknown service: inconnu');
    expect(n.message).toBe(generique());
  });
});

describe('#859 — un corps JSON', () => {
  it('🔴 `error` est le texte, `code` est le code — le texte arrive dans le détail', async () => {
    const corps = '{"code":"not_found","error":"job not found: inexistant"}';
    const n = await erreurPour(corps, 404, 'application/json');
    expect(n.detail, 'le texte reste enfermé dans `code`').toContain('job not found: inexistant');
    expect(n.message).toBe(generique());
    expect(n.code).toBe('not_found');
  });

  it('CONTRE-ÉPREUVE : l’ancien mettait le message dans `code`', async () => {
    const corps = '{"code":"not_found","error":"job not found: inexistant"}';
    const a = await ancien(corps, 404);
    expect(a.detail, 'le témoin ne reproduit pas l’inversion').toBe('404 Not Implemented');
    expect(a.code, 'le message ne partait pas dans `code`').toBe('job not found: inexistant');
  });

  it('la forme sans `code` : `error` sert des DEUX côtés', async () => {
    // `{"error":"not found","path":"…"}` — mesuré sur /library/history/xxx.
    const n = await erreurPour('{"error":"not found","path":"/x"}', 404, 'application/json');
    expect(n.detail).toContain('not found');
    // ⚠️ `code` retombe sur `error` : `premiumRefus` et la garde de plafond de
    // zones comparent `err.code` à des valeurs nommées. Retirer ce repli aurait
    // pu rendre muet un refus premium.
    expect(n.code, 'le repli de compatibilité a sauté').toBe('not found');
  });

  it('#2417 — une phrase que le serveur dit avoir traduite (`message_key`) s’affiche', async () => {
    const n = await erreurPour(
      '{"error":"queue_empty","code":"queue_empty","message":"La file est vide.","message_key":"api.playback.queueEmptyNothingToSave"}',
      400,
      'application/json',
    );
    expect(n.message).toBe('La file est vide.');
    expect(n.code).toBe('queue_empty');
  });

  it('#2417 — sans `message_key`, `detail`, `message` et `error` restent au détail', async () => {
    const n = await erreurPour('{"detail":"D","message":"M","error":"E"}', 400, 'application/json');
    expect(n.message).toBe(generique());
    for (const m of ['D', 'M', 'E']) expect(n.detail).toContain(m);
  });
});

describe('#859 — ce qu’on refuse d’afficher', () => {
  it('un corps VIDE : le message générique, le statut au détail', async () => {
    const n = await erreurPour('', 404, 'text/plain');
    expect(n.message).toBe(generique());
    expect(n.detail).toContain('404');
  });

  it('🔴 une page HTML n’est PAS un message, ni un détail', async () => {
    // Un proxy ou un portail captif rend du HTML. L'afficher tel quel
    // couvrirait l'écran de balises.
    const html = '<!doctype html><html><body>502 Bad Gateway</body></html>';
    const n = await erreurPour(html, 502, 'text/html');
    expect(n.message).toBe(generique());
    expect(n.detail).not.toContain('<');
  });

  it('un texte démesuré est tronqué dans le détail, jamais à l’écran', async () => {
    const long = 'x'.repeat(900);
    const n = await erreurPour(long, 500, 'text/plain');
    expect(n.message).toBe(generique());
    expect(n.detail.length).toBeLessThan(700);
  });

  it('le corps n’est lu QU’UNE fois — `text()` puis `JSON.parse`', async () => {
    // Appeler `.json()` puis `.text()` sur la même réponse lève
    // « body stream already read ». C'est pourquoi on lit le texte d'abord.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../api.ts'), 'utf-8');
    const i = src.indexOf('async function apiError(');
    const corps = src.slice(i, src.indexOf('\n}', i));
    expect(corps).toContain('await response.text()');
    expect(corps).toContain('JSON.parse(brut)');
    expect(/await response\.json\(\)/.test(corps),
      'deux lectures du même corps : la seconde lèverait').toBe(false);
  });
});
