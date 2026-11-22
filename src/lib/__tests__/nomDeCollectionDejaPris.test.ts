// @vitest-environment jsdom
/**
 * Forum, 21/11/2026 — « Bug collections intelligentes, erreur peut-être liée
 * au nom de plus de 3 mots ». Le nom était DÉJÀ PRIS. Le serveur rend
 * désormais 409 `smart_collection_name_taken` à la création comme au
 * renommage (tune-server-rust, `smart_collections.rs`) ; sa phrase est en
 * français, sans `message_key`, donc le client ne la croit pas
 * (`messageServeur.ts`, #2417) : sans la clé
 * `erreursServeur.smart_collection_name_taken`, l'éditeur affichait le
 * générique « Le serveur n'a pas pu traiter la demande. ».
 *
 * Contre-épreuve : retirer la clé de `fr.ts` fait rougir les deux premiers
 * cas (le message vaut le générique).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { locale, t } from '../i18n';
import { notifications } from '../stores/notifications';
import * as api from '../api';
import { messageEtDetail } from '../notifierErreur';
import { CHARGEURS, type Locale } from '../locales';

const CODE = 'smart_collection_name_taken';
const PHRASE_DU_SERVEUR = 'Une collection intelligente porte déjà le nom « Jazz vocal des années cinquante »';
const LOCALES = Object.keys(CHARGEURS) as Locale[];

function refusNomPris() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: PHRASE_DU_SERVEUR, code: CODE }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

const vider = () => { for (const n of get(notifications)) notifications.dismiss(n.id); };

/** Ce que montre `CollectionSmartEditeurV2.enregistrer` en cas d'échec. */
function bandeauDeLEditeur(e: unknown): string {
  return messageEtDetail(get(t)('common.error' as any), e, { motifSeul: true }).message;
}

beforeEach(() => { locale.set('fr'); vider(); });
afterEach(() => { vi.restoreAllMocks(); vider(); locale.set('fr'); });

describe('collection intelligente : nom déjà pris (409)', () => {
  it('à la création, l’éditeur dit que le nom est pris', async () => {
    refusNomPris();
    const err: any = await api.createSmartCollection({ name: 'Jazz vocal des années cinquante', rules: [] } as any).catch((e) => e);
    expect(err.status).toBe(409);
    expect(err.code).toBe(CODE);
    const message = bandeauDeLEditeur(err);
    expect(message).toBe('Une collection porte déjà ce nom. Choisissez-en un autre.');
    expect(message).not.toBe(get(t)('erreursServeur.generique'));
    // La phrase du serveur, qui nomme le nom, reste dans le « Détails ».
    expect(messageEtDetail('x', err).detail).toContain(PHRASE_DU_SERVEUR);
  });

  it('au renommage, même message', async () => {
    refusNomPris();
    const err: any = await api.updateSmartCollection(7, { name: 'Jazz vocal des années cinquante' } as any).catch((e) => e);
    expect(err.status).toBe(409);
    expect(bandeauDeLEditeur(err)).toBe('Une collection porte déjà ce nom. Choisissez-en un autre.');
  });

  it('en anglais aussi', async () => {
    locale.set('en');
    refusNomPris();
    const err: any = await api.createSmartCollection({ name: 'Jazz', rules: [] } as any).catch((e) => e);
    expect(bandeauDeLEditeur(err)).toBe('A collection already has this name. Please choose another one.');
  });

  for (const l of LOCALES) {
    it(`${l} : le dictionnaire porte la clé, distincte du générique`, async () => {
      const dico = (await CHARGEURS[l]()).default as Record<string, string>;
      const texte = dico[`erreursServeur.${CODE}`];
      expect(texte, `${l} : erreursServeur.${CODE}`).toBeTruthy();
      expect(texte).not.toBe(dico['erreursServeur.generique']);
    });
  }
});
