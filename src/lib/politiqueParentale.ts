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
 * fusion). Les plages horaires et les budgets d'écoute (étape 2, #7974) font
 * partie de la politique : l'écran les édite et les renvoie avec le reste.
 * Écrire une politique sans eux les effacerait.
 *
 * Validation du serveur (422) : au plus 64 plages ; jours 1 (lundi) à 7
 * (dimanche), au moins un ; `debut` < `fin` au format `HH:MM` (pas de 24:00) ;
 * budget du jour <= 1440 min, budget de la semaine <= 10080 min.
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
  /** Étape 2 (#7974) : plages d'écoute permises (aucune : à toute heure). */
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
    if (code === 'plage_horaire_vide') return 'parental.hours.errOrder';
    if (code === 'plage_horaire_jour_invalide') return 'parental.hours.errDay';
    if (code === 'plage_horaire_heure_invalide') return 'parental.hours.errTime';
    if (code === 'trop_de_plages_horaires') return 'parental.hours.errTooMany';
    if (code === 'budget_quotidien_invalide') return 'parental.budget.errDaily';
    if (code === 'budget_hebdomadaire_invalide') return 'parental.budget.errWeekly';
    if (code === 'profil_administrateur_non_supervisable') return 'parental.err.adminProfile';
    if (code === 'politique_trop_longue') return 'parental.err.tooLong';
    if (code === 'artiste_bloque_sans_id_ni_nom') return 'parental.err.artistEmpty';
    return 'parental.err.invalid';
  }
  return 'parental.err.generic';
}

// --- Étape 2 (#7974) : plages horaires et budgets d'écoute -----------------

export const PLAGES_MAX = 64;
export const BUDGET_JOUR_MAX = 24 * 60;
export const BUDGET_SEMAINE_MAX = 7 * 24 * 60;

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Les jours en ordre croissant, sans doublon. */
export const joursNormalises = (jours: number[]) => [...new Set(jours)].sort((a, b) => a - b);

/** Clé i18n du premier défaut de la plage, ou `null` si elle est valide. */
export function erreurPlage(p: PlageHoraire): string | null {
  if (!p.jours.length) return 'parental.hours.errNoDay';
  if (!HEURE.test(p.debut) || !HEURE.test(p.fin)) return 'parental.hours.errTime';
  if (p.debut >= p.fin) return 'parental.hours.errOrder';
  return null;
}

/** Clé i18n du premier défaut de la liste de plages, ou `null`. */
export function erreurPlages(plages: PlageHoraire[]): string | null {
  if (plages.length > PLAGES_MAX) return 'parental.hours.errTooMany';
  for (const p of plages) { const e = erreurPlage(p); if (e) return e; }
  return null;
}

/** Les plages telles que le serveur les reçoit : jours triés, sans doublon. */
export const plagesPourServeur = (plages: PlageHoraire[]): PlageHoraire[] =>
  plages.map((p) => ({ jours: joursNormalises(p.jours), debut: p.debut, fin: p.fin }));

/** Un budget en minutes → heures et minutes saisies (chaînes vides : pas de limite). */
export function budgetVersSaisie(minutes: number | null | undefined): { h: string; m: string } {
  if (minutes == null) return { h: '', m: '' };
  return { h: String(Math.floor(minutes / 60)), m: String(minutes % 60) };
}

/**
 * Heures et minutes saisies → minutes. Les deux champs vides : `{ minutes: null }`
 * (aucune limite). Sinon un entier strictement positif, borné par `max`.
 */
export function budgetDepuisSaisie(
  h: string, m: string, max: number, cleTrop: string,
): { minutes: number | null; erreur: string | null } {
  const hh = h.trim(), mm = m.trim();
  if (!hh && !mm) return { minutes: null, erreur: null };
  const entier = /^\d{1,5}$/;
  if ((hh && !entier.test(hh)) || (mm && !entier.test(mm))) return { minutes: null, erreur: 'parental.budget.errPositive' };
  const total = (hh ? Number(hh) : 0) * 60 + (mm ? Number(mm) : 0);
  if (total <= 0) return { minutes: null, erreur: 'parental.budget.errPositive' };
  if (total > max) return { minutes: null, erreur: cleTrop };
  return { minutes: total, erreur: null };
}
