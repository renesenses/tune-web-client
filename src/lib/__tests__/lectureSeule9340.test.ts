// @vitest-environment jsdom
/**
 * tune-server-rust#9340 (forum, fil 2994, macOS 27) — bibliothèque sur un
 * volume en lecture seule (disque NTFS sous macOS, partage en lecture
 * seule). Le serveur rend désormais un refus explicite :
 *
 *  - 409 `fichier_lecture_seule` quand l'édition d'une piste
 *    (`PATCH /metadata/tracks/{id}`) ne peut pas écrire le fichier ;
 *  - 409 `destination_lecture_seule` quand `POST /converter/start` vise un
 *    dossier du serveur où l'on ne peut pas écrire.
 *
 * Sa phrase est en français, sans `message_key` : le client ne la croit pas
 * (`messageServeur.ts`, #2417). Sans les clés `erreursServeur.<code>`,
 * l'écran afficherait le générique « Le serveur n'a pas pu traiter la
 * demande. », sans le mot « lecture seule ».
 *
 * Contre-épreuve : retirer les deux clés de `fr.ts` fait rougir les deux
 * premiers cas (le motif vaut le générique, ou disparaît).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { locale, t } from '../i18n';
import { notifications } from '../stores/notifications';
import * as api from '../api';
import { messageEtDetail } from '../notifierErreur';
import { CHARGEURS, type Locale } from '../locales';

const CODES = ['fichier_lecture_seule', 'destination_lecture_seule'] as const;
const LOCALES = Object.keys(CHARGEURS) as Locale[];

function refus(code: string, phrase: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: phrase, code }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

const vider = () => { for (const n of get(notifications)) notifications.dismiss(n.id); };

beforeEach(() => { locale.set('fr'); vider(); });
afterEach(() => { vi.restoreAllMocks(); vider(); locale.set('fr'); });

describe('#9340 — volume en lecture seule : le refus se dit', () => {
  it('éditer une piste : « lecture seule », et la phrase du serveur dans les détails', async () => {
    const phrase = "Le fichier n'a pas pu être modifié : volume monté en lecture seule : écriture refusée, original intact";
    refus('fichier_lecture_seule', phrase);
    const err: any = await api.updateTrackMetadata(7, { title: 'Après' }).catch((e) => e);
    expect(err.status).toBe(409);
    expect(err.code).toBe('fichier_lecture_seule');
    const { message, detail } = messageEtDetail(get(t)('trackTags.saveError'), err);
    expect(message).toContain('lecture seule');
    expect(message).not.toContain(get(t)('erreursServeur.generique'));
    expect(detail).toContain(phrase);
  });

  it('convertir vers un dossier en lecture seule : « lecture seule »', async () => {
    refus('destination_lecture_seule', 'La destination /Volumes/NTFS/converti est sur un volume en lecture seule : Tune ne peut pas y écrire (Read-only file system (os error 30)).');
    const err: any = await api.startConversion([{ album_id: 1 }], 'flac', 'best', null, null).catch((e) => e);
    expect(err.status).toBe(409);
    expect(err.message).toContain('lecture seule');
    expect(err.message).not.toBe(get(t)('erreursServeur.generique'));
  });

  for (const l of LOCALES) {
    it(`${l} : le dictionnaire porte les deux clés, distinctes du générique`, async () => {
      const dico = (await CHARGEURS[l]()).default as Record<string, string>;
      for (const code of CODES) {
        const texte = dico[`erreursServeur.${code}`];
        expect(texte, `${l} : erreursServeur.${code}`).toBeTruthy();
        expect(texte).not.toBe(dico['erreursServeur.generique']);
      }
    });
  }
});
