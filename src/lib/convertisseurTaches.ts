/**
 * Les tâches du Convertisseur, hors du composant (#1804).
 *
 * Xavier Joly, 0.9.168 :
 *  - « Lors d'un encodage il ne faut surtout pas quitter la page sans quoi le
 *    job a disparu quand on revient dessus » ;
 *  - « Lorsqu'un encodage est terminé et qu'on lance un nouveau job sans avoir
 *    préparé le téléchargement du précédent, il disparaît. »
 *
 * Les deux venaient du même endroit : UNE tâche, `jobId`, dans l'état du
 * composant. Le démonter la perdait ; en lancer une autre l'écrasait. Côté
 * serveur, pourtant, la conversion continuait et l'archive restait prête.
 *
 * Ici : une LISTE, dans un magasin de module — il survit au démontage de
 * l'écran. Lancer AJOUTE, ne remplace pas. Et au montage, l'écran fusionne ce
 * que le serveur connaît (`GET /converter/jobs`, tune-server-rust#5480), ce qui
 * couvre aussi un rechargement de la page ou un autre appareil.
 *
 * Les fonctions pures (`ajouter`, `fusionner`, …) portent la règle ; le
 * magasin ne fait que les appliquer. Elles sont éprouvées sans composant.
 */
import { writable } from 'svelte/store';
import type { getConversionStatus } from './api';

export type StatutConversion = Awaited<ReturnType<typeof getConversionStatus>>;

export interface TacheConversion {
  jobId: string;
  job: StatutConversion | null;
  downloadUrl: string | null;
  /** Ce qui a été lancé (« MP3 CBR 320 kbps — 2 albums »), quand on le sait. */
  libelle: string | null;
}

/** La plus récente d'abord. */
export function ajouter(taches: TacheConversion[], jobId: string, libelle: string | null = null): TacheConversion[] {
  if (taches.some((t) => t.jobId === jobId)) return taches;
  return [{ jobId, job: null, downloadUrl: null, libelle }, ...taches];
}

export function avecStatut(taches: TacheConversion[], jobId: string, job: StatutConversion): TacheConversion[] {
  return taches.map((t) => (t.jobId === jobId ? { ...t, job } : t));
}

export function avecTelechargement(taches: TacheConversion[], jobId: string, downloadUrl: string): TacheConversion[] {
  return taches.map((t) => (t.jobId === jobId ? { ...t, downloadUrl } : t));
}

export function sans(taches: TacheConversion[], jobId: string): TacheConversion[] {
  return taches.filter((t) => t.jobId !== jobId);
}

/**
 * Ce que le serveur connaît, fusionné à ce que l'écran connaît déjà.
 *
 * Une tâche déjà là prend le statut frais sans perdre son libellé ni son lien
 * de téléchargement préparé. Une tâche inconnue — lancée avant un
 * rechargement, ou depuis un autre appareil — est ajoutée. La liste du serveur
 * vient du plus ancien au plus récent : les nouvelles se rangent donc, elles
 * aussi, la plus récente d'abord. Rien n'est retiré : une tâche que le serveur
 * ne liste plus (annulée ailleurs, serveur redémarré) garde son dernier état
 * connu, et c'est son propre sondage qui le dira.
 */
export function fusionner(
  taches: TacheConversion[],
  serveur: Array<StatutConversion & { job_id?: string }>,
): TacheConversion[] {
  let resultat = taches;
  for (const s of serveur) {
    const id = s?.job_id;
    if (!id) continue;
    resultat = avecStatut(ajouter(resultat, id), id, s);
  }
  return resultat;
}

/** Une tâche qu'il faut encore sonder : pas encore de statut, ou en cours. */
export function aSonder(t: TacheConversion): boolean {
  return t.job == null || t.job.state === 'converting';
}

export const tachesConversion = writable<TacheConversion[]>([]);
