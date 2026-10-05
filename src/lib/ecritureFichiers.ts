import { get } from 'svelte/store';
import { t } from './i18n';

/**
 * « Écrire les modifications dans les fichiers audio » — Réglages ›
 * Bibliothèque › Métadonnées.
 *
 * Bertrand, 05/10/2026 : « Écrire les tags dans les fichiers : inactif par
 * défaut ! » Le serveur (`tune_core::metadata::ecriture_fichiers`) lit la clé
 * {@link CLE_ECRITURE_FICHIERS} ; ABSENTE, elle vaut « désactivé ». Désactivé,
 * une modification va seulement en base : les routes d'édition répondent
 * `file_writes_enabled: false`, et celles qui n'existent que pour écrire dans
 * les fichiers refusent en 409, code {@link CODE_REFUS_ECRITURE}.
 */
export const CLE_ECRITURE_FICHIERS = 'library_write_files_enabled';

/** Code stable du refus 409 (`{"error": …, "code": …}`). */
export const CODE_REFUS_ECRITURE = 'file_writes_disabled';

/**
 * La valeur publiée par `GET /system/config`, lue comme le serveur la lit :
 * seul un oui explicite active. Absente, illisible : désactivé.
 */
export function ecritureFichiersDepuisConfig(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    return ['true', '1', 'yes', 'on'].includes(v.trim().replace(/^"|"$/g, '').toLowerCase());
  }
  return false;
}

/**
 * La réponse d'une route d'édition dit-elle « enregistré en base, fichiers
 * inchangés » ? Seul un `false` explicite le dit : un serveur antérieur, qui
 * ne publie pas le champ, n'est pas accusé d'avoir laissé les fichiers.
 */
export function fichiersInchanges(reponse: unknown): boolean {
  return (reponse as { file_writes_enabled?: unknown } | null)?.file_writes_enabled === false;
}

/** Le corps d'erreur est-il le refus « écriture dans les fichiers désactivée » ? */
export function estRefusEcriture(corps: unknown): boolean {
  const c = corps as { code?: unknown; error?: unknown; reason?: unknown } | null;
  return (
    c?.code === CODE_REFUS_ECRITURE ||
    c?.error === CODE_REFUS_ECRITURE ||
    c?.reason === CODE_REFUS_ECRITURE
  );
}

/**
 * La phrase à afficher pour ce refus, dans la langue de l'interface. Le
 * `message` du serveur est en français ; il n'est jamais montré.
 */
export function messageRefusEcriture(): string {
  return get(t)('fileWrites.disabledError' as any);
}
