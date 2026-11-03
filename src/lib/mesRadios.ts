// « Mes radios » — ce qui revient du rapport de Rémi (RC7, 25/10/2026, #2397).
//
// Deux fonctions pures, que l'écran appelle et que les tests appellent aussi :
// une garde écrite contre le texte du composant ne prouverait pas qu'elle
// s'exécute.
import type { RadioStation } from './types';

/** Page du portail où l'on propose une radio à l'annuaire. */
export const URL_PROPOSER = 'https://mozaiklabs.fr/radios';

/**
 * Une entrée venue de l'annuaire : flux, logo et description sont gérés en
 * central, on ne les modifie donc pas ici — on la RETIRE de « Mes radios ».
 *
 * Le critère est le LIEN ENREGISTRÉ (`external_id`), pas le rapprochement :
 * le serveur rapproche aussi par adresse de flux ou par nom, et une station
 * saisie à la main qui porte le même flux qu'une fiche resterait, à tort,
 * verrouillée. Dans le doute, la station reste modifiable.
 */
export function estDeLAnnuaire(r: Pick<RadioStation, 'annuaire'>): boolean {
  const a = r.annuaire;
  if (!a?.external_id) return false;
  return a.rapproche_par == null || a.rapproche_par === 'id';
}

const CLE = 'tune.radios.dernieresLues';
/** Combien de stations on garde en mémoire locale. */
const MAX = 12;

function lire(store?: Pick<Storage, 'getItem'>): number[] {
  try {
    const brut = (store ?? localStorage).getItem(CLE);
    const v = brut ? JSON.parse(brut) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

/** Retient qu'une station vient d'être lancée depuis cet appareil. */
export function memoriserLecture(id: number, store?: Pick<Storage, 'getItem' | 'setItem'>): void {
  try {
    const s = store ?? localStorage;
    const suite = [id, ...lire(s).filter((x) => x !== id)].slice(0, MAX);
    s.setItem(CLE, JSON.stringify(suite));
  } catch {
    /* stockage indisponible : la rangée reste vide, rien ne casse */
  }
}

/**
 * Les stations lues en dernier, la plus récente d'abord.
 *
 * Si le serveur date les lectures, c'est lui qui fait foi : il voit aussi ce
 * qui a été lancé d'un autre appareil. Sinon, repli sur la mémoire de cet
 * appareil. Une station disparue de la liste est ignorée.
 *
 * web#2397 (point 6) : le serveur DATE DÉJÀ les lectures. `GET /radios` rend
 * la colonne `last_played` (ISO-8601, écrite par `RadioRepo::record_play` à
 * chaque `POST /radios/{id}/play/{zone}`), pas `last_played_at` : ce nom-là
 * n'existe que pour les pistes. Le client attendait le second, ne le trouvait
 * jamais et retombait toujours sur la mémoire locale.
 */
export function dateDeLecture(r: Pick<RadioStation, 'last_played' | 'last_played_at'>): string | null {
  const d = r.last_played ?? r.last_played_at;
  return typeof d === 'string' && d.trim() ? d : null;
}

export function dernieresLues(
  radios: RadioStation[],
  store?: Pick<Storage, 'getItem'>,
  n = 12,
): RadioStation[] {
  const datees = radios
    .filter((r) => dateDeLecture(r))
    .sort((a, b) => String(dateDeLecture(b)).localeCompare(String(dateDeLecture(a))));
  if (datees.length) return datees.slice(0, n);
  const parId = new Map(radios.map((r) => [r.id, r]));
  return lire(store)
    .map((id) => parId.get(id))
    .filter((r): r is RadioStation => !!r)
    .slice(0, n);
}
