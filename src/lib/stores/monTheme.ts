/**
 * « Mon thème » (#2527) — l'état côté client : la route du thème que déclare
 * un greffon actif (`provides.web_theme` de `GET /plugins`), et le thème du
 * profil courant, rechargé à chaque changement de profil.
 *
 * Rien en stockage navigateur : le serveur range le thème par profil, et le
 * profil le retrouve sur tous ses appareils.
 */
import { derived, get, writable } from 'svelte/store';
import { BASE, fetchJSON } from '../api';
import * as api from '../api';
import { currentProfileId } from './profile';
import {
  etatGreffonMonTheme, jugerTheme, routeThemeWeb,
  type EtatGreffonMonTheme, type FicheGreffonTheme, type ThemePerso,
} from '../monTheme';

export interface EnregistrementTheme { actif: boolean; theme: ThemePerso | null }

/** L'adresse complète du thème (`BASE` + route), ou `null` sans greffon. */
export const urlMonTheme = writable<string | null>(null);
export const etatGreffonTheme = writable<EtatGreffonMonTheme>('inconnu');
export const themeDuProfil = writable<EnregistrementTheme>({ actif: false, theme: null });
/** Le thème à PEINDRE : celui du profil, s'il est actif. */
export const monThemeActif = derived(themeDuProfil, (e) => (e.actif ? e.theme : null));

/** `BASE` vaut `/api/v1` (ou l'adresse du relais) : la route du greffon est
 *  absolue (`/api/v1/ext/…`), on garde ce qui suit `/api/v1`. */
export function adresseDuTheme(route: string): string {
  return BASE + route.replace(/^\/api\/v1/, '');
}

/** La réponse du greffon, jugée comme un import : un thème abîmé vaut « aucun ». */
export function enregistrementDe(b: unknown): EnregistrementTheme {
  const o = (b ?? {}) as { actif?: unknown; theme?: unknown };
  const j = o.theme == null ? null : jugerTheme(o.theme);
  const theme = j && j.ok ? j.theme : null;
  return { actif: o.actif === true && theme !== null, theme };
}

async function lire(url: string): Promise<void> {
  themeDuProfil.set(enregistrementDe(await fetchJSON<unknown>(url, undefined, undefined, true)));
}

/** Relit la liste des greffons, puis le thème du profil. Silencieux : sans
 *  greffon, ou sur une panne, l'interface garde ses palettes standard. */
export async function chargerMonTheme(): Promise<void> {
  try {
    const liste = (await api.getInstalledPlugins()) as unknown as FicheGreffonTheme[];
    etatGreffonTheme.set(etatGreffonMonTheme(liste));
    const route = routeThemeWeb(liste);
    const url = route ? adresseDuTheme(route) : null;
    urlMonTheme.set(url);
    if (url) await lire(url);
    else themeDuProfil.set({ actif: false, theme: null });
  } catch {
    /* Indéterminé : on ne repeint rien. */
  }
}

function urlRequise(): string {
  const url = get(urlMonTheme);
  if (!url) throw Object.assign(new Error('mon-theme absent'), { code: 'mon_theme.absent' });
  return url;
}

export async function rangerMonTheme(theme: ThemePerso, actif = true): Promise<void> {
  const url = urlRequise();
  themeDuProfil.set(enregistrementDe(await fetchJSON<unknown>(url, { method: 'PUT', body: JSON.stringify({ theme, actif }) }, undefined, true)));
}

export async function activerMonTheme(actif: boolean): Promise<void> {
  const url = urlRequise();
  themeDuProfil.set(enregistrementDe(await fetchJSON<unknown>(`${url}/actif`, { method: 'PUT', body: JSON.stringify({ actif }) }, undefined, true)));
}

export async function effacerMonTheme(): Promise<void> {
  const url = urlRequise();
  themeDuProfil.set(enregistrementDe(await fetchJSON<unknown>(url, { method: 'DELETE' }, undefined, true)));
}

// Le thème suit le profil : un autre profil, un autre thème.
let premier = true;
currentProfileId.subscribe(() => {
  if (premier) { premier = false; return; }
  const url = get(urlMonTheme);
  if (url) void lire(url).catch(() => {});
});
