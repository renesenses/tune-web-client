// Extension « Pont Roon » (PREMIUM) — `tune-server-rust`, greffon
// `tune-pont-roon`, monté sur `/ext/pont-roon`.
//
// Ces appels NE LÈVENT PAS sur 402/404 : ce sont des états de l'écran
// (« réservé au Premium », « extension non installée »), pas des pannes.
//
// Importé via la barrel `lib/api`.

import { BASE } from './_client';
import { getToken } from '../auth';
import { profileHeader } from '../profileHeader';

/** Le rapport d'un import, tel que le serveur le rend. */
export interface RapportPontRoon {
  preview: boolean;
  archive?: boolean;
  core?: string;
  artistes_total: number;
  artistes_apparies: number;
  artistes_inconnus: string[];
  albums_total: number;
  albums_apparies: number;
  albums_inconnus: string[];
  pistes_total: number;
  pistes_appariees: number;
  credits_a_ecrire: number;
  credits_deja_presents: number;
  credits_ecrits: number;
  images_nommees: number;
  images_portees: number;
  images_artistes_a_poser: number;
  images_artistes_posees: number;
  images_albums_a_poser: number;
  images_albums_posees: number;
  absent_de_l_api?: string[];
}

export interface ReponsePontRoon<T> {
  status: number;
  corps: T | { error?: string; detail?: string; code?: string } | null;
}

function entetes(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json', ...profileHeader(), ...extra };
  const token = getToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function lire<T>(r: Response): Promise<ReponsePontRoon<T>> {
  let corps: any = null;
  try { corps = await r.json(); } catch { corps = null; }
  return { status: r.status, corps };
}

/** `GET /ext/pont-roon/` — le droit Premium et le dernier import. */
export async function pontRoonEtat(): Promise<ReponsePontRoon<{ premium: boolean; dernier_rapport: RapportPontRoon | null }>> {
  return lire(await fetch(`${BASE}/ext/pont-roon/`, { headers: entetes() }));
}

/** `POST /ext/pont-roon/import` — l'archive du moissonneur (ou l'export JSON). */
export async function pontRoonImporter(fichier: Blob, apercu: boolean): Promise<ReponsePontRoon<RapportPontRoon>> {
  const type = fichier.type || 'application/octet-stream';
  return lire(await fetch(`${BASE}/ext/pont-roon/import?apercu=${apercu}`, {
    method: 'POST',
    headers: entetes({ 'Content-Type': type }),
    body: fichier,
  }));
}
