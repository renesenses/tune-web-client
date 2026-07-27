// Ingest : faire entrer un dossier fraîchement récupéré dans la bibliothèque.
//
// Le scan suppose que les fichiers sont déjà rangés dans un dossier musical ;
// ces endpoints couvrent l'étape d'avant (analyse → aperçu → déplacement).
// Rien ne bouge sur le disque avant `applyIngest`.
//
// Importé via la barrel `lib/api`.

import { BASE, fetchJSON } from './_client';
import { getToken } from '../auth';

export type IngestFileMode = 'move' | 'copy';
export type IngestConflictPolicy = 'skip' | 'overwrite' | 'rename';
export type IngestEntryKind = 'audio' | 'extra';
export type IngestConflict = 'destination_exists' | 'duplicate_target';

export interface IngestSettings {
  /** Action par défaut sur les fichiers source, modifiable à chaque import. */
  mode: IngestFileMode;
  template: string;
  default_template: string;
  dest_root: string | null;
  /** Destination réellement utilisée si `dest_root` est vide (1er dossier musical). */
  effective_dest_root: string | null;
  music_dirs: string[];
  conflict_policy: IngestConflictPolicy;
  write_tags: boolean;
}

export interface IngestAlbumSummary {
  album_artist: string | null;
  album: string | null;
  year: number | null;
  genre: string | null;
  track_count: number;
  disc_count: number;
  is_compilation: boolean;
  formats: string[];
  total_bytes: number;
  has_cover: boolean;
  /** Codes machine (`missing_year`, `mixed_artists`, …) traduits côté UI. */
  warnings: string[];
}

export interface IngestSourceTrack {
  source_path: string;
  ext: string;
  title: string | null;
  artist: string | null;
  album_artist: string | null;
  album: string | null;
  year: number | null;
  genre: string | null;
  track_number: number | null;
  disc_number: number | null;
  duration_ms: number | null;
  format: string | null;
  file_size: number;
  has_cover: boolean;
}

/**
 * Une édition candidate. Les champs d'édition sont ce qui permet de choisir :
 * MusicBrainz garde souvent une demi-douzaine de sorties pour un même album
 * (standard, deluxe, pressages régionaux), toutes au même score.
 */
export interface IngestReleaseCandidate {
  release_id: string;
  release_group_id: string | null;
  title: string;
  artist: string;
  score: number;
  date: string | null;
  year: number | null;
  country: string | null;
  label: string | null;
  catalog_number: string | null;
  track_count: number | null;
  disc_count: number | null;
  media_format: string | null;
  /** Note d'édition de MusicBrainz : « deluxe edition », « reissue »… */
  disambiguation: string | null;
  status: string | null;
}

/** Une piste du tracklisting de l'édition choisie. */
export interface IngestReleaseTrack {
  position: number;
  disc: number;
  number: string | null;
  title: string;
  length_ms: number | null;
  recording_id: string | null;
  artist: string | null;
}

/** Ce que l'édition choisie changerait pour un fichier. */
export interface IngestTrackProposal {
  source_path: string;
  current_title: string | null;
  current_track_number: number | null;
  current_disc_number: number | null;
  proposed_title: string | null;
  proposed_track_number: number | null;
  proposed_disc_number: number | null;
  matched: boolean;
  /** `disc_and_number`, `title` ou `order` — un appariement par ordre est une supposition. */
  method: string | null;
}

export interface IngestReleaseTracksResponse {
  release: {
    release_id: string;
    title: string;
    artist: string;
    date: string | null;
    year: number | null;
    country: string | null;
    label: string | null;
    catalog_number: string | null;
    disc_count: number;
    track_count: number;
  };
  tracks: IngestReleaseTrack[];
  proposals: IngestTrackProposal[];
  changed: number;
  unmatched: number;
}

/** Correction par fichier, envoyée à plan/apply. */
export interface IngestTrackOverride {
  source_path: string;
  title?: string | null;
  track_number?: number | null;
  disc_number?: number | null;
}

export interface IngestAnalysis {
  source_path: string;
  album: IngestAlbumSummary;
  tracks: IngestSourceTrack[];
  extras: string[];
  /** Nombre de fichiers source déjà connus de la bibliothèque (ré-import). */
  already_in_library: number;
  /** Éditions proposées, classées ; vide si `identify` était faux. */
  musicbrainz_candidates: IngestReleaseCandidate[];
  defaults: {
    mode: IngestFileMode;
    template: string;
    conflict_policy: IngestConflictPolicy;
    write_tags: boolean;
  };
}

/** Corrections saisies par l'utilisateur, appliquées avant le calcul des chemins. */
export interface IngestOverrides {
  album_artist?: string | null;
  album?: string | null;
  year?: number | null;
  genre?: string | null;
}

export interface IngestPlanEntry {
  source_path: string;
  dest_path: string;
  /** Chemin relatif à la racine de destination — ce qu'on affiche. */
  relative_path: string;
  kind: IngestEntryKind;
  conflict: IngestConflict | null;
}

export interface IngestSkippedFile {
  source_path: string;
  reason: string;
}

export interface IngestPlan {
  source_path: string;
  dest_root: string;
  album_dir: string | null;
  template: string;
  mode: IngestFileMode;
  entries: IngestPlanEntry[];
  skipped: IngestSkippedFile[];
  warnings: string[];
}

export interface IngestPlanResponse {
  plan: IngestPlan;
  album: IngestAlbumSummary;
  audio_count: number;
  conflicts: number;
}

export interface IngestJobReport {
  mode: IngestFileMode;
  album_dir: string | null;
  moved: { source_path: string; dest_path: string }[];
  skipped: IngestSkippedFile[];
  errors: { source_path: string; message: string }[];
  bytes: number;
}

export interface IngestJob {
  id: string;
  status: 'running' | 'done' | 'partial' | 'failed' | 'undone';
  source_path: string;
  dest_root?: string;
  album_dir?: string | null;
  mode: IngestFileMode;
  started_at?: string;
  finished_at?: string;
  total?: number;
  placed?: number;
  bytes?: number;
  tags_written?: number;
  scan_triggered?: boolean;
  error?: string;
  report?: IngestJobReport;
  album?: { album: string | null; album_artist: string | null; year: number | null };
  undone_at?: string;
  undo_reverted?: number;
}

export interface IngestRequest {
  source_path: string;
  dest_root?: string;
  template?: string;
  mode?: IngestFileMode;
  conflict_policy?: IngestConflictPolicy;
  write_tags?: boolean;
  overrides?: IngestOverrides;
  /** Corrections par fichier : elles alimentent aussi les chemins de destination. */
  track_overrides?: IngestTrackOverride[];
}

export function getIngestSettings() {
  return fetchJSON<IngestSettings>(`${BASE}/library/ingest/settings`);
}

export function updateIngestSettings(patch: Partial<Omit<IngestSettings, 'default_template' | 'effective_dest_root' | 'music_dirs'>>) {
  return fetchJSON<IngestSettings>(`${BASE}/library/ingest/settings`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function analyzeIngest(sourcePath: string, identify = false) {
  return fetchJSON<IngestAnalysis>(`${BASE}/library/ingest/analyze`, {
    method: 'POST',
    body: JSON.stringify({ source_path: sourcePath, identify }),
  });
}

/**
 * Tracklisting de l'édition choisie, avec l'appariement proposé fichier par
 * fichier. N'écrit rien : l'utilisateur valide, puis les corrections partent
 * en `track_overrides`.
 */
export function getIngestReleaseTracks(sourcePath: string, releaseId: string) {
  return fetchJSON<IngestReleaseTracksResponse>(`${BASE}/library/ingest/release-tracks`, {
    method: 'POST',
    body: JSON.stringify({ source_path: sourcePath, release_id: releaseId }),
  });
}

export function planIngest(req: IngestRequest) {
  return fetchJSON<IngestPlanResponse>(`${BASE}/library/ingest/plan`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function applyIngest(req: IngestRequest) {
  return fetchJSON<{ job_id: string; status: string }>(`${BASE}/library/ingest/apply`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function getIngestJob(id: string) {
  return fetchJSON<IngestJob>(`${BASE}/library/ingest/jobs/${encodeURIComponent(id)}`);
}

export function listIngestJobs() {
  return fetchJSON<{ jobs: IngestJob[] }>(`${BASE}/library/ingest/jobs`);
}

export function undoIngestJob(id: string) {
  return fetchJSON<{ job_id: string; reverted: number; errors: unknown[] }>(
    `${BASE}/library/ingest/jobs/${encodeURIComponent(id)}/undo`,
    { method: 'POST' },
  );
}

/** Un fichier déposé, avec son chemin relatif dans le dossier glissé. */
export interface DroppedFile {
  file: File;
  /** Ex. `Muse - Absolution/01 - Intro.flac`. Le serveur le nettoie composant par composant. */
  relativePath: string;
}

/**
 * Envoie des fichiers déposés vers le dossier de staging du serveur et renvoie
 * son chemin, à passer tel quel à `analyzeIngest`.
 *
 * XHR plutôt que fetch : c'est le seul moyen d'avoir la progression d'upload,
 * et un album peut peser plusieurs centaines de Mo.
 */
export function uploadIngestFiles(
  files: DroppedFile[],
  onProgress?: (fraction: number) => void,
): Promise<{ source_path: string; files: number; bytes: number }> {
  const form = new FormData();
  for (const { file, relativePath } of files) {
    form.append('file', file, relativePath || file.name);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/library/ingest/upload`);
    xhr.setRequestHeader('Accept', 'application/json');
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* laisse body à null */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.source_path) {
        resolve(body);
      } else {
        reject(new Error(body?.error ?? `${xhr.status} ${xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(form);
  });
}

/**
 * Aplatit ce qui a été lâché dans la fenêtre en une liste de fichiers avec
 * leur chemin relatif.
 *
 * Un dossier déposé n'arrive pas dans `dataTransfer.files` : il faut descendre
 * l'arborescence via l'API `webkitGetAsEntry`. Sans ça, déposer le dossier d'un
 * album ne donne rien du tout.
 */
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const out: DroppedFile[] = [];

  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .filter((i) => i.kind === 'file')
    .map((i) => (typeof (i as any).webkitGetAsEntry === 'function' ? (i as any).webkitGetAsEntry() : null))
    .filter(Boolean);

  if (entries.length === 0) {
    // Navigateur sans l'API entry : on se rabat sur les fichiers à plat.
    for (const file of Array.from(dataTransfer.files ?? [])) {
      out.push({ file, relativePath: file.name });
    }
    return out;
  }

  const readEntry = (entry: any, prefix: string): Promise<void> =>
    new Promise((resolve) => {
      if (entry.isFile) {
        entry.file(
          (file: File) => {
            out.push({ file, relativePath: prefix ? `${prefix}/${file.name}` : file.name });
            resolve();
          },
          () => resolve(),
        );
        return;
      }
      if (!entry.isDirectory) {
        resolve();
        return;
      }

      const reader = entry.createReader();
      const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      const batch = () => {
        // readEntries ne rend qu'un lot à la fois (100 sur Chrome) : il faut
        // rappeler jusqu'au lot vide, sinon un album long est tronqué.
        reader.readEntries(
          async (children: any[]) => {
            if (children.length === 0) {
              resolve();
              return;
            }
            for (const child of children) await readEntry(child, childPrefix);
            batch();
          },
          () => resolve(),
        );
      };
      batch();
    });

  for (const entry of entries) await readEntry(entry, '');
  return out;
}

const AUDIO_EXTENSIONS = [
  'flac', 'mp3', 'm4a', 'ogg', 'opus', 'wav', 'aiff', 'aif', 'wv', 'wma', 'dsf', 'dff', 'dst',
  'alac', 'ape', 'iso',
];

function hasAudioExtension(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXTENSIONS.includes(ext);
}

/**
 * Le drop contient-il de l'audio (ou un dossier, dont on ignore le contenu) ?
 *
 * Le nom se lit dans trois sources, dans cet ordre : l'entry `webkitGetAsEntry`
 * (seule à distinguer un dossier), le `File` de l'item, puis `dataTransfer.files`.
 * S'appuyer sur la seule entry — API non standard qui peut rendre `null` —
 * faisait ignorer silencieusement un drop de fichiers parfaitement valide, alors
 * que [`collectDroppedFiles`] sait justement retomber sur `files`.
 */
export function dropLooksLikeMusic(dataTransfer: DataTransfer): boolean {
  const items = Array.from(dataTransfer.items ?? []).filter((i) => i.kind === 'file');
  const files = Array.from(dataTransfer.files ?? []);
  if (items.length === 0 && files.length === 0) return false;

  const fromItems = items.some((item) => {
    const entry =
      typeof (item as any).webkitGetAsEntry === 'function' ? (item as any).webkitGetAsEntry() : null;
    // Un dossier : on ne peut pas savoir avant de le lire, on accepte.
    if (entry?.isDirectory) return true;
    const name: string =
      entry?.name ??
      (typeof (item as any).getAsFile === 'function' ? (item as any).getAsFile()?.name : null) ??
      '';
    return hasAudioExtension(name);
  });

  return fromItems || files.some((f) => hasAudioExtension(f.name));
}
