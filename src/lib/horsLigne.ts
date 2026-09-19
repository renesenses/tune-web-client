/**
 * Écoute hors ligne — lecture du contrat serveur (`tune-server/src/routes/offline.rs`).
 *
 * Porté en v2 avant la phase 5 (web#1257), qui retire `OfflineView.svelte`.
 *
 * 🔴 L'ancien écran lisait des champs que le serveur n'envoie PAS :
 * `GET /offline/downloads` rend `track_title`, `file_size` et le statut
 * `completed` ; l'écran attendait `title`, `size_bytes` et `complete`. Une
 * piste téléchargée s'y affichait donc sans titre et jamais « terminée ».
 * La lecture vit ici, hors du composant, pour qu'un test l'appelle.
 */

export type StatutHorsLigne = 'complete' | 'downloading' | 'pending' | 'error' | 'missing' | 'autre';

export interface TelechargementHorsLigne {
  id: string;
  titre: string;
  artiste: string;
  album: string;
  statut: StatutHorsLigne;
  taille: number | null;
  erreur: string | null;
}

export interface EtatHorsLigne {
  total: number;
  taille: number;
  enAttente: number;
}

function texte(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function nombre(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function statutHorsLigne(v: unknown): StatutHorsLigne {
  switch (v) {
    case 'completed':
    case 'complete':
      return 'complete';
    case 'downloading':
    case 'pending':
    case 'error':
    case 'missing':
      return v;
    default:
      return 'autre';
  }
}

/** Une entrée de `GET /offline/downloads`, champs du serveur ET anciens noms. */
export function lireTelechargement(brut: any): TelechargementHorsLigne | null {
  if (!brut || (brut.id === null || brut.id === undefined)) return null;
  return {
    id: String(brut.id),
    titre: texte(brut.track_title) || texte(brut.title),
    artiste: texte(brut.artist_name),
    album: texte(brut.album_title),
    statut: statutHorsLigne(brut.status),
    taille: nombre(brut.file_size) ?? nombre(brut.size_bytes),
    erreur: texte(brut.error) || null,
  };
}

export function lireTelechargements(brut: unknown): TelechargementHorsLigne[] {
  if (!Array.isArray(brut)) return [];
  return brut.map(lireTelechargement).filter((x): x is TelechargementHorsLigne => x !== null);
}

/** `GET /offline/status` — `total`/`size_bytes`, ou leurs noms explicites. */
export function lireEtat(brut: any): EtatHorsLigne {
  return {
    total: nombre(brut?.total) ?? nombre(brut?.total_tracks) ?? 0,
    taille: nombre(brut?.size_bytes) ?? nombre(brut?.total_size_bytes) ?? 0,
    enAttente: nombre(brut?.pending) ?? 0,
  };
}

export function tailleLisible(octets: number): string {
  if (octets < 1024) return `${octets} B`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} KB`;
  if (octets < 1024 * 1024 * 1024) return `${(octets / (1024 * 1024)).toFixed(1)} MB`;
  return `${(octets / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
