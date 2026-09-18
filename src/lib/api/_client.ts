// Internals partagés entre les sous-modules api/*.
// Préfixe `_` = ne pas importer côté composants ; passer par `lib/api`.

import { notifications } from '../stores/notifications';
import { getToken, clearToken } from '../auth';
import { profileHeader } from '../profileHeader';
import { messageRefusPremium, type CorpsRefusPremium } from '../premiumRefus';

export const BASE = '/api/v1';

let _lastNetworkError = 0;
function showNetworkError() {
  const now = Date.now();
  if (now - _lastNetworkError < 5000) return;
  _lastNetworkError = now;
  notifications.error('Network error: server unreachable');
}

async function apiError(response: Response): Promise<Error> {
  let detail = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json();
    // `detail` : anciens handlers. `error` : le format d'AppError côté serveur,
    // dont le message est souvent la seule explication actionnable ("destination
    // hors des dossiers musicaux configurés") — le perdre laissait l'UI avec un
    // « 400 Bad Request » nu.
    if (body.detail) detail = body.detail;
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
      ...(options?.body != null ? { 'Content-Type': 'application/json' } : {}),
      ...profileHeader(),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    response = await fetch(url, {
      headers,
      ...options,
    });
  } catch (e) {
    showNetworkError();
    throw e;
  }
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
