/**
 * Réglage « Balises personnelles → tags Tune » (tune-server-rust#9158,
 * demande de Rob, go de Bertrand du 19/11).
 *
 * Une correspondance : une clé lue dans le fichier (casse ignorée, préfixe de
 * conteneur ignoré : `MOOD` lit aussi `TXXX:MOOD` et
 * `----:com.apple.iTunes:MOOD`), et un mode : chaque valeur devient un tag
 * (`values`, préfixe facultatif), ou un tag fixe dès que la balise est
 * présente (`fixed`). La validation est la MÊME que celle du serveur
 * (`tune_core::metadata::tags_perso`).
 */
import { nomDeCle } from './balisesClassique';

export type ModeBalisePerso = 'values' | 'fixed';

export interface CorrespondancePerso {
  key: string;
  mode: ModeBalisePerso;
  tag?: string;
  prefix?: string;
}

export interface ReglageBalisesPerso {
  mappings: CorrespondancePerso[];
}

export const MAX_CORRESPONDANCES = 32;
export const MAX_LONGUEUR_CLE = 64;
export const MAX_LONGUEUR_PREFIXE = 32;

export type RefusCle = 'empty' | 'tooLong' | 'chars' | 'tooMany';
export type RefusCorrespondance = RefusCle | 'tagRequired' | 'prefixTooLong';

/** Une clé saisie, mise en capitales, ou la raison de son refus. */
export function normaliserCle(
  saisie: string,
  nombre: number,
): { cle: string } | { refus: RefusCle } {
  const cle = saisie.trim().toUpperCase();
  if (!cle || !nomDeCle(cle)) return { refus: 'empty' };
  if ([...cle].length > MAX_LONGUEUR_CLE) return { refus: 'tooLong' };
  if (!/^[A-Z0-9 _\-:.]+$/.test(cle)) return { refus: 'chars' };
  if (nombre >= MAX_CORRESPONDANCES) return { refus: 'tooMany' };
  return { cle };
}

/** Le refus d'une correspondance complète, ou `null`. */
export function refusDe(c: CorrespondancePerso): RefusCorrespondance | null {
  const r = normaliserCle(c.key, 0);
  if ('refus' in r) return r.refus;
  if (c.mode === 'fixed' && !(c.tag ?? '').trim()) return 'tagRequired';
  if (c.mode === 'values' && [...(c.prefix ?? '').trim()].length > MAX_LONGUEUR_PREFIXE) return 'prefixTooLong';
  return null;
}

/** Le corps envoyé : seuls les champs du mode, clés en capitales. */
export function corpsDe(r: ReglageBalisesPerso): ReglageBalisesPerso {
  return {
    mappings: r.mappings.map((c) => {
      const key = c.key.trim().toUpperCase();
      if (c.mode === 'fixed') return { key, mode: 'fixed', tag: (c.tag ?? '').trim() };
      const prefix = (c.prefix ?? '').trimStart();
      return prefix.trim() ? { key, mode: 'values', prefix } : { key, mode: 'values' };
    }),
  };
}

export function copieReglage(r: ReglageBalisesPerso): ReglageBalisesPerso {
  return { mappings: r.mappings.map((c) => ({ ...c })) };
}

export function memesReglages(a: ReglageBalisesPerso, b: ReglageBalisesPerso): boolean {
  return JSON.stringify(corpsDe(a)) === JSON.stringify(corpsDe(b));
}

export { nomDeCle };
