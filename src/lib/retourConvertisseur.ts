import { activeView } from './stores/navigation';
import type { getConversionStatus } from './api';

export interface RetourV2 {
  q: string; picked: number[]; presetId: string | null; jobId: string | null;
  job: Awaited<ReturnType<typeof getConversionStatus>> | null; downloadUrl: string | null;
}
export interface RetourLegacy {
  selectedAlbumIds: number[]; selectedDirPaths: string[];
  selectedPresetId: string; customFormat: string; customQuality: string;
  customSampleRate: string; customBitDepth: string; albumSearch: string;
  jobId: string | null; conversionState: 'idle' | 'converting' | 'done' | 'error';
  progress: number; currentFile: string; convertedCount: number; totalCount: number;
  downloadSize: string; conversionError: string;
}
interface Retours { v2: RetourV2; legacy: RetourLegacy }
let retour: { client: keyof Retours; etat: Retours[keyof Retours]; visite: boolean } | null = null;

function effacer() {
  retour = null;
}

// Seulement le trajet Localiser → Répertoires → Convertisseur, jamais une session persistée.
export function conserverRetourConvertisseur<K extends keyof Retours>(client: K, etat: Retours[K]) {
  effacer();
  retour = { client, etat, visite: false };
}
activeView.subscribe((vue) => {
  if (!retour) return;
  if (vue === 'browse') retour.visite = true;
  else if (vue !== 'converter') effacer();
});

export function consommerRetourConvertisseur<K extends keyof Retours>(client: K): Retours[K] | null {
  const etat = retour?.client === client && retour.visite ? retour.etat as Retours[K] : null;
  effacer();
  return etat;
}
