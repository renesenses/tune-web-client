// @vitest-environment jsdom
/**
 * Fil 3104 (Edge, 40 537 pistes) — des 404 EN BOUCLE dans la console sur
 * `/ext/assistant-ia/reglages`, et d'autres sur
 * `/audio-plugins/crossfeed-pro/zones/0`. Un 404 de ces routes veut dire
 * « greffon absent » : il est retenu (`routesAbsentes`) et les SONDES de
 * fond ne repartent plus avant que le serveur ait pu changer. (La sonde
 * TESS, elle, ne part déjà qu'une fois par connexion : `stores/tess`.)
 *
 * Sur le `main` d'avant le correctif, chaque appel refaisait sa requête :
 * cinq sondes, cinq 404.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sonderAssistantIa } from '../assistantIaDialogue';
import { crossfeedProTraiteLaZone } from '../stores/crossfeedPro';
import { crosstalkTraiteLaZone } from '../stores/crosstalk';
import * as api from '../api';
import { oublierGreffonsAbsents, oublierGreffonsAbsentsALaReconnexion } from '../routesAbsentes';

let appels: string[] = [];

beforeEach(() => {
  oublierGreffonsAbsents();
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const chemin = new URL(String(url), 'http://x').pathname;
    appels.push(chemin);
    return new Response(JSON.stringify({ error: 'not found', path: chemin }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  oublierGreffonsAbsents();
});

const nb = (motif: RegExp) => appels.filter((c) => motif.test(c)).length;

describe('fil 3104 — un 404 de greffon ne se redemande pas en boucle', () => {
  it('Assistant IA : cinq sondes, une seule requête', async () => {
    for (let i = 0; i < 5; i++) expect(await sonderAssistantIa()).toBe(false);
    expect(nb(/\/ext\/assistant-ia\/reglages$/)).toBe(1);
  });

  it('Crossfeed Pro : la zone relue à chaque évènement ne refait pas le 404', async () => {
    for (let i = 0; i < 5; i++) expect(await crossfeedProTraiteLaZone(0)).toBe(false);
    expect(nb(/\/audio-plugins\/crossfeed-pro\/zones\/0$/)).toBe(1);
  });

  it('Crosstalk : même règle', async () => {
    for (let i = 0; i < 5; i++) expect(await crosstalkTraiteLaZone(4)).toBe(false);
    expect(nb(/\/audio-plugins\/crosstalk\/zones\/4$/)).toBe(1);
  });

  it('l’écran du greffon, ouvert par l’utilisateur, interroge toujours le serveur', async () => {
    await crossfeedProTraiteLaZone(0);
    await expect(api.getReglageGreffonNatif('crossfeed-pro', 0)).rejects.toMatchObject({ status: 404 });
    expect(nb(/\/audio-plugins\/crossfeed-pro\/zones\/0$/)).toBe(2);
  });

  it('la reconnexion du flux fait redemander (le serveur a pu changer)', async () => {
    let surEvenement: (e: { type: string }) => void = () => {};
    const bus = { onEvent: (h: (e: { type: string }) => void) => { surEvenement = h; return () => {}; } };
    oublierGreffonsAbsentsALaReconnexion(bus);
    await sonderAssistantIa();
    surEvenement({ type: '_connected' }); // première connexion : rien n'est oublié
    await sonderAssistantIa();
    expect(nb(/\/ext\/assistant-ia\/reglages$/)).toBe(1);
    surEvenement({ type: '_disconnected' });
    surEvenement({ type: '_connected' });
    await sonderAssistantIa();
    expect(nb(/\/ext\/assistant-ia\/reglages$/)).toBe(2);
  });

  it('une installation de greffon fait redemander', async () => {
    await crossfeedProTraiteLaZone(0);
    await api.installPlugin('crossfeed-pro').catch(() => {});
    await crossfeedProTraiteLaZone(0);
    expect(nb(/\/audio-plugins\/crossfeed-pro\/zones\/0$/)).toBe(2);
  });

});
