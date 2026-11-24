// Internals partagés entre les sous-modules api/*.
// Préfixe `_` = ne pas importer côté composants ; passer par `lib/api`.

import { annoncerServeurInjoignable, serveurARepondu } from '../bandeauServeurInjoignable';
import { getToken, clearToken } from '../auth';
import { profileHeader } from '../profileHeader';
import { corpsJson, fusionnerEntetes } from '../fusionEntetes';
import { messageRefusPremium, type CorpsRefusPremium } from '../premiumRefus';
import { estRefusEcriture, messageRefusEcriture } from '../ecritureFichiers';
import { baseApi, entetesRelais } from '../bridge';
import { CODE_REFUS_PAYS_RADIO, messageRefusPaysRadio } from '../refusPaysRadio';
import { estUnCode, traductionDuCode } from '../messageServeur';

// Même base que `api.ts` : `/api/v1` en local, `/api/relay/{id}` par le pont.
export const BASE = baseApi();


async function apiError(response: Response): Promise<Error> {
  let detail = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json();
    const refusPays = messageRefusPaysRadio(body);
    if (refusPays) {
      return Object.assign(new Error(refusPays), { status: response.status, code: CODE_REFUS_PAYS_RADIO });
    }
    // tune-server-rust#9340 — un refus dont le CODE a sa traduction client
    // (`erreursServeur.<code>`, par exemple `fichier_lecture_seule`) se dit
    // dans la langue de l'interface, avec son statut et son code ; la phrase
    // du serveur, en français, reste dans `detail` (« Détails » replié). Les
    // autres refus gardent le comportement d'avant.
    const traduit = estUnCode(body?.code) ? traductionDuCode(body.code) : null;
    if (traduit) {
      return Object.assign(new Error(traduit), {
        status: response.status,
        code: body.code as string,
        detail: typeof body.error === 'string' ? body.error : undefined,
      });
    }
    // `detail` : anciens handlers. `error` : le format d'AppError côté serveur,
    // dont le message est souvent la seule explication actionnable ("destination
    // hors des dossiers musicaux configurés") — le perdre laissait l'UI avec un
    // « 400 Bad Request » nu.
    if (estRefusEcriture(body)) detail = messageRefusEcriture();
    else if (body.detail) detail = body.detail;
    else if (typeof body.error === 'string') detail = body.error;
  } catch {
    /* ignore */
  }
  return new Error(detail);
}

export async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      // #4447 — `Content-Type: application/json` UNIQUEMENT s'il y a quelque
      // chose a envoyer. Ce jumeau sert `api/metadata.ts` : `startAutoFix`
      // poste sans corps, et l'en-tete faisait echouer l'extracteur
      // `Option<Json<...>>` du serveur en 400 « EOF while parsing a value ».
      ...(corpsJson(options?.body) ? { 'Content-Type': 'application/json' } : {}),
      ...profileHeader(),
      ...entetesRelais(),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // #7532 — fusion, plus remplacement (voir `fusionEntetes.ts`).
    response = await fetch(url, {
      ...options,
      headers: fusionnerEntetes(headers, options?.headers),
    });
  } catch (e) {
    // #3185 — une requête abandonnée par son appelant n'est pas une panne.
    annoncerServeurInjoignable(options?.signal, 5000);
    throw e;
  }
  // #3185 — le serveur a répondu : le bandeau persistant se retire.
  serveurARepondu();
  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      throw new Error('Session expired');
    }
    /**
     * 🔴 #884 — CE JUMEAU N'AVAIT JAMAIS ÉTÉ CORRIGÉ.
     *
     * `api.ts` intercepte le 402 depuis #2419 ; ce `fetchJSON`-ci, qui sert
     * `api/metadata.ts` et `api/ingest.ts`, relayait encore le `message` du
     * serveur — composé en FRANÇAIS par `require_premium` quand la route n'a
     * pas passé ses en-têtes (50 routes sur 58 au 18/09/2026). Même aide
     * partagée, même phrase, mêmes onze langues.
     */
    if (response.status === 402) {
      let corps: CorpsRefusPremium = null;
      try {
        corps = (await response.json()) as CorpsRefusPremium;
      } catch {
        /* corps illisible : la phrase générique reste juste */
      }
      const refus = new Error(messageRefusPremium(corps)) as Error & { status?: number; code?: string };
      refus.status = 402;
      refus.code = corps?.code === 'free_zone_cap_reached' ? corps.code : 'premium_required';
      throw refus;
    }
    throw await apiError(response);
  }
  const text = await response.text();
  if (text.trimStart().startsWith('<!') || text.trimStart().toLowerCase().startsWith('<html')) {
    throw new Error('Expected JSON but received HTML — check the endpoint URL');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON response');
  }
}
