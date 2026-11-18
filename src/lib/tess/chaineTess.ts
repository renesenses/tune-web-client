/**
 * TESS W3 — modifier la chaîne d'une zone SANS rien inventer : chaque geste
 * part de la chaîne publiée par le serveur et n'y change qu'un maillon. Le
 * serveur reste juge (`PUT /zones/{id}/tess`, corps strict, refus 400/402/409).
 */
import type { ChaineTess, MaillonTess } from './contrat';

function maillons(c: ChaineTess): MaillonTess[] {
  return Array.isArray(c.plugins) ? c.plugins : [];
}

export function maillon(c: ChaineTess, id: string): MaillonTess | null {
  return maillons(c).find((m) => m.id === id) ?? null;
}

/** Coche ou décoche un greffon déjà présent. */
export function avecActivation(c: ChaineTess, id: string, enabled: boolean): ChaineTess {
  return { ...c, plugins: maillons(c).map((m) => (m.id === id ? { ...m, enabled } : m)) };
}

/** Fusionne des réglages dans ceux d'un greffon présent. */
export function avecReglages(c: ChaineTess, id: string, reglages: Record<string, unknown>): ChaineTess {
  return {
    ...c,
    plugins: maillons(c).map((m) => (m.id === id ? { ...m, settings: { ...(m.settings ?? {}), ...reglages } } : m)),
  };
}

/** Retire un greffon (« × Remove plugin »). */
export function sansGreffon(c: ChaineTess, id: string): ChaineTess {
  return { ...c, plugins: maillons(c).filter((m) => m.id !== id) };
}
