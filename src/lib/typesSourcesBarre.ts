/**
 * Les types de sources affichés dans la barre latérale —
 * renesenses/tune-server-rust#5065, étape 3.
 *
 * Une case « Afficher dans la barre » par TYPE (CD, entrée audio, source
 * virtuelle, HDMI), rangée dans `ui_preferences` (synchronisé serveur) sous
 * `sourcesBarre`. Un type coché apparaît TOUJOURS, grisé s'il est
 * indisponible — même quand le serveur n'en connaît aucune source.
 *
 * Par défaut, un type est coché s'il existe au moins une source de ce type
 * non `indisponible` : seuls les types réellement présents sur la machine.
 * Le choix se range TYPE PAR TYPE (`Partial`) : un type sans valeur n'est pas
 * encore décidé. Dès qu'il est vu présent, il est figé coché — un
 * périphérique débranché ensuite reste affiché, grisé, et une entrée USB
 * branchée plus tard apparaît d'elle-même. Un type décoché à la main le
 * reste.
 *
 * Module sans dépendance vers la couche API : `stores/preferences` le lit, et
 * ne doit pas la tirer (voir le commentaire de `profileHeader` là-bas).
 *
 * #2117 — ces cases suivent le PROFIL d'un appareil à l'autre, comme l'ordre
 * de la barre (fil 2109) : chaque geste est daté (`sourcesBarreMaj`), et à la
 * relecture du serveur le geste le plus récent gagne, type par type.
 */
import { horodatageBarre } from './ordreBarreLaterale';

export type TypeSourceBarre = 'cd' | 'entree' | 'virtuelle' | 'hdmi';
export type TypesBarre = Record<TypeSourceBarre, boolean>;
/** Ce qui est enregistré : les seuls types décidés. */
export type ChoixTypesBarre = Partial<TypesBarre>;

export const TYPES_SOURCE_BARRE: readonly TypeSourceBarre[] = ['cd', 'entree', 'virtuelle', 'hdmi'];

/** Ce qu'il faut d'une source pour décider de son type et de sa présence. */
export interface SourceTypee {
  type: string;
  etat: string;
  detail?: { virtuelle?: unknown; [cle: string]: unknown } | null;
}

/** Le type sous lequel la barre range la source : une entrée que le système
 *  dit virtuelle (`detail.virtuelle`) compte comme virtuelle. */
export function typeDansLaBarre(s: SourceTypee): TypeSourceBarre | null {
  if (s.type === 'virtuelle' || s.detail?.virtuelle === true) return 'virtuelle';
  return (TYPES_SOURCE_BARRE as readonly string[]).includes(s.type) ? (s.type as TypeSourceBarre) : null;
}

/** Les cases par défaut : cochées pour les types présents et utilisables. */
export function typesParDefaut(liste: readonly SourceTypee[]): TypesBarre {
  const types: TypesBarre = { cd: false, entree: false, virtuelle: false, hdmi: false };
  for (const s of liste) {
    const t = typeDansLaBarre(s);
    if (t && s.etat !== 'indisponible') types[t] = true;
  }
  return types;
}

/** Une valeur enregistrée (donc venue du SERVEUR) : ses seules clés
 *  connues à valeur booléenne ; `null` si ce n'est pas un objet. */
export function normaliserTypesBarre(v: unknown): ChoixTypesBarre | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const choix: ChoixTypesBarre = {};
  for (const t of TYPES_SOURCE_BARRE) if (typeof o[t] === 'boolean') choix[t] = o[t] as boolean;
  return choix;
}

/** Les cases en vigueur : le choix enregistré type par type, sinon le
 *  défaut (présence). */
export function typesEnVigueur(pref: unknown, liste: readonly SourceTypee[]): TypesBarre {
  const choix = normaliserTypesBarre(pref) ?? {};
  const defaut = typesParDefaut(liste);
  const types = { ...defaut };
  for (const t of TYPES_SOURCE_BARRE) if (typeof choix[t] === 'boolean') types[t] = choix[t] as boolean;
  return types;
}

/**
 * Fige cochés les types vus présents et pas encore décidés. Rend le nouveau
 * choix, ou `null` s'il n'y a rien à figer.
 */
export function figerTypesPresents(pref: unknown, liste: readonly SourceTypee[] | null): ChoixTypesBarre | null {
  if (!liste) return null;
  const choix = normaliserTypesBarre(pref) ?? {};
  const defaut = typesParDefaut(liste);
  const nouveaux = TYPES_SOURCE_BARRE.filter((t) => defaut[t] && typeof choix[t] !== 'boolean');
  if (!nouveaux.length) return null;
  const fige: ChoixTypesBarre = { ...choix };
  for (const t of nouveaux) fige[t] = true;
  return fige;
}

export function unTypeCoche(types: TypesBarre): boolean {
  return TYPES_SOURCE_BARRE.some((t) => types[t]);
}

/** Les cases de la barre telles qu'elles se rangent dans les préférences. */
export interface EtatTypesBarre {
  sourcesBarre: ChoixTypesBarre | null;
  sourcesBarreMaj: number;
}

/** #2117 — un geste sur une case « Afficher dans la barre » : la case, datée. */
export function gesteTypesBarre(
  pref: unknown,
  type: TypeSourceBarre,
  coche: boolean,
  maintenant: number = Date.now(),
): EtatTypesBarre {
  return {
    sourcesBarre: { ...(normaliserTypesBarre(pref) ?? {}), [type]: coche },
    sourcesBarreMaj: horodatageBarre(maintenant),
  };
}

/**
 * #2117 — les cases à retenir entre cet appareil et le serveur.
 *
 * Avant, le local gagnait toujours, type par type : un type figé coché sur cet
 * appareil (il suffit d'y avoir vu une source CD une fois) ne recevait jamais
 * la case décochée sur un autre appareil du même profil.
 *
 * - Le geste le plus RÉCENT gagne pour les types qu'il a décidés.
 * - Un type que le gagnant n'a pas décidé garde la valeur de l'autre côté.
 * - À égalité (deux blobs jamais datés, écrits avant ce correctif) : le local,
 *   le comportement d'avant.
 */
export function arbitrerTypesBarre(
  local: { sourcesBarre?: unknown; sourcesBarreMaj?: unknown },
  serveur: { sourcesBarre?: unknown; sourcesBarreMaj?: unknown },
): EtatTypesBarre {
  const l = normaliserTypesBarre(local.sourcesBarre) ?? {};
  const s = normaliserTypesBarre(serveur.sourcesBarre) ?? {};
  const majL = horodatageBarre(local.sourcesBarreMaj);
  const majS = horodatageBarre(serveur.sourcesBarreMaj);
  return majS > majL
    ? { sourcesBarre: { ...l, ...s }, sourcesBarreMaj: majS }
    : { sourcesBarre: { ...s, ...l }, sourcesBarreMaj: majL };
}
