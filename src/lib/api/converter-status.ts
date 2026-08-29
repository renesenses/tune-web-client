/** Contrat web du convertisseur vs JSON réellement servi par Tune Rust 0.9.121.
 *
 * Le client attendait `{ state: 'done', converted, progress }`.
 * Le serveur envoie `{ status: 'completed', completed, total, current_file, errors }`
 * — la barre restait à 0 % et le bouton ZIP n'apparaissait jamais
 * (XAVINUC / .79, job d4c05293, 29/08/2026).
 */

export type ConversionUiState = 'converting' | 'done' | 'error';

export interface ConversionStatus {
  state: ConversionUiState;
  progress: number;
  current_file: string;
  converted: number;
  total: number;
  download_size?: string;
  error?: string;
}

interface ConversionErrorItem {
  file?: string;
  message?: string;
}

interface ConversionStatusRaw {
  state?: string;
  status?: string;
  progress?: number;
  current_file?: string;
  converted?: number;
  completed?: number;
  total?: number;
  download_size?: string;
  error?: string;
  errors?: ConversionErrorItem[];
}

function firstErrorMessage(raw: ConversionStatusRaw): string | undefined {
  if (typeof raw.error === 'string' && raw.error.trim()) return raw.error;
  const first = raw.errors?.find((e) => e.message?.trim());
  return first?.message;
}

export function normalizeConversionStatus(raw: unknown): ConversionStatus {
  const r = (raw && typeof raw === 'object' ? raw : {}) as ConversionStatusRaw;
  const converted = Number(r.converted ?? r.completed ?? 0) || 0;
  const total = Number(r.total ?? 0) || 0;
  const currentFile = typeof r.current_file === 'string' ? r.current_file : '';

  const token = (r.state ?? r.status ?? '').toLowerCase();
  let state: ConversionUiState;
  if (token === 'done' || token === 'completed') state = 'done';
  else if (token === 'error' || token === 'failed' || token === 'cancelled') state = 'error';
  else state = 'converting';

  // Le serveur 0.9.121 n'envoie pas de progress intra-fichier : `completed`
  // reste à 0 pendant tout l'encodage d'une piste → barre figée à 0 %.
  // Tant qu'un fichier est en cours, on avance d'une fraction de piste.
  let progress: number;
  if (typeof r.progress === 'number' && Number.isFinite(r.progress) && r.progress > 0) {
    progress = r.progress;
  } else if (total > 0) {
    const inFlight = state === 'converting' && converted < total
      ? (currentFile ? 0.4 : 0.12)
      : 0;
    progress = Math.min(99, ((converted + inFlight) / total) * 100);
    if (state === 'done') progress = 100;
  } else {
    progress = 0;
  }

  const error = firstErrorMessage(r);

  return {
    state,
    progress,
    current_file: currentFile,
    converted,
    total,
    download_size: r.download_size,
    error,
  };
}
