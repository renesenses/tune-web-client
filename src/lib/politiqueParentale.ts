/**
 * Contrôle parental, étape 1 — la politique d'un profil supervisé.
 *
 * tune-server-rust#7856 (issue), #7898 (routes, fusionnées dans le lot
 * `batch/bugs-rc11-20261101`) :
 *
 *   GET    /profiles/{id}/politique-parentale                 → 200 | 404 | 403
 *   PUT    /profiles/{id}/politique-parentale  {revision, politique} → 200 | 403 | 409 | 422
 *   DELETE /profiles/{id}/politique-parentale?revision=n       → 204 | 403 | 409
 *
 * L'appelant est le profil ACTIF (en-tête `X-Profile-Id`) : l'administrateur
 * pose les règles d'un autre profil. Le profil visé lui-même, et tout profil
 * lui-même supervisé, reçoivent 403.
 *
 * ⚠️ Le serveur REMPLACE la politique entière (`deny_unknown_fields`, pas de
 * fusion). Les plages horaires et les budgets d'écoute (étape 2, #7974) sont
 * déjà enregistrés et validés par le serveur : cet écran ne les édite pas
 * encore, mais il les RENVOIE tels qu'il les a lus (`...base`). Écrire une
 * politique sans eux les effacerait.
 */
import { BASE, fetchJSON } from './api';
import type { Profile } from './stores/profile';

export interface ArtisteBloque { id?: number | null; nom?: string | null }
export interface PlageHoraire { jours: number[]; debut: string; fin: string }

export interface PolitiqueParentale {
  artistes_bloques: ArtisteBloque[];
  /** `null` : aucune restriction ; une liste (même vide) : seuls ces éléments. */
  radios_autorisees: string[] | null;
  podcasts_autorises: string[] | null;
  /** Étape 2 (#7974) : conservés, non édités ici. */
  plages_horaires?: PlageHoraire[];
  budget_quotidien_minutes?: number | null;
  budget_hebdomadaire_minutes?: number | null;
}

export interface PolitiqueEnregistree {
  profile_id: number;
  superviseur_id: number;
  revision: number;
  politique: PolitiqueParentale;
  maj_le: string;
}

const racine = (id: number) => `${BASE}/profiles/${id}/politique-parentale`;

/** Qui voit la section : un administrateur, pour un AUTRE profil non administrateur. */
export function peutSuperviser(actif: Pick<Profile, 'id' | 'is_admin'> | undefined, cible: Pick<Profile, 'id' | 'is_admin'>): boolean {
  return !!actif && actif.is_admin === true && actif.id !== cible.id && cible.is_admin !== true;
}

/** La politique posée, ou `null` : profil sans règle (404 `politique_parentale_absente`). */
export async function lirePolitique(id: number): Promise<PolitiqueEnregistree | null> {
  try {
    return await fetchJSON<PolitiqueEnregistree>(racine(id), undefined, undefined, true);
  } catch (e: any) {
    if (e?.status === 404 && e?.code === 'politique_parentale_absente') return null;
    throw e;
  }
}

export function poserPolitique(id: number, revision: number, politique: PolitiqueParentale) {
  return fetchJSON<PolitiqueEnregistree>(
    racine(id),
    { method: 'PUT', body: JSON.stringify({ revision, politique }) },
    undefined,
    true,
  );
}

export async function retirerPolitique(id: number, revision: number): Promise<void> {
  await fetchJSON<void>(`${racine(id)}?revision=${revision}`, { method: 'DELETE' }, undefined, true);
}

/** Une ligne par entrée : espaces rognés, lignes vides et doublons écartés. */
export function lignes(texte: string): string[] {
  const vu = new Set<string>();
  const sortie: string[] = [];
  for (const l of texte.split(/\r?\n/)) {
    const v = l.trim();
    if (v && !vu.has(v)) { vu.add(v); sortie.push(v); }
  }
  return sortie;
}

const norm = (s: string) => s.trim().split(/\s+/).join(' ').toLowerCase();

/** L'artiste bloqué tel qu'on l'écrit sur une ligne : son nom, sinon `#id`. */
export function ligneArtiste(a: ArtisteBloque): string {
  return a.nom?.trim() || (a.id != null ? `#${a.id}` : '');
}

/**
 * Les lignes saisies → artistes bloqués. Une ligne qui retrouve un artiste déjà
 * posé (même nom) reprend ses données, identifiant compris ; `#123` désigne un
 * artiste de la bibliothèque par son identifiant seul.
 */
export function artistesDepuisLignes(texte: string, existants: ArtisteBloque[]): ArtisteBloque[] {
  return lignes(texte).map((l) => {
    const connu = existants.find((a) => ligneArtiste(a) === l || (a.nom && norm(a.nom) === norm(l)));
    if (connu) return connu;
    const m = /^#(\d+)$/.exec(l);
    return m ? { id: Number(m[1]) } : { nom: l };
  });
}

/** Clé i18n du motif d'échec d'une écriture ou d'une lecture. */
export function cleErreur(e: any): string {
  const statut = e?.status, code = e?.code;
  if (statut === 403) return 'parental.err.forbidden';
  if (statut === 409) return 'parental.err.stale';
  if (statut === 404) return 'parental.err.unknownProfile';
  if (statut === 422) {
    if (code === 'profil_administrateur_non_supervisable') return 'parental.err.adminProfile';
    if (code === 'politique_trop_longue') return 'parental.err.tooLong';
    if (code === 'artiste_bloque_sans_id_ni_nom') return 'parental.err.artistEmpty';
    return 'parental.err.invalid';
  }
  return 'parental.err.generic';
}
