/**
 * web#3315 — l'ANNÉE, le GENRE et le LABEL de la fiche d'un album, cliquables
 * (en-tête, colonne « Album details », colonnes Année / Genre / Label des
 * pistes). Suite du chantier #2770 : les entités passent par `LienEntite`,
 * ce module dit seulement OÙ elles mènent depuis la fiche.
 *
 * - Album de la BIBLIOTHÈQUE : année → Bibliothèque filtrée par année
 *   (`ouvrirAnnee`) ; genre → facette Genres ; label → page du label de la
 *   Bibliothèque. Genre et label referment d'abord la fiche (calque), comme le
 *   lien « Autres artistes de … » (tune-server-rust#8145).
 * - Album d'un SERVICE : genre → la page du genre chez le service, quand le
 *   service en donne l'identifiant (`/streaming/{svc}/albums/{id}/context`,
 *   Qobuz seul aujourd'hui) ; label → la page « Label » du service (#2379).
 *   L'ANNÉE d'un album de service n'a pas de destination cohérente : texte.
 * - Sans cible connue (dépôt distant, Bandcamp, TIDAL…) : texte, pas de lien
 *   mort.
 */
import { get } from 'svelte/store';
import { partiesDEntite, type Entite } from './lienEntite';
import { ouvrirFacetteDansLaBibliotheque, ouvrirLabelDansLaBibliotheque } from './artistesDuLabel';
import { ouvrirLabelDeService } from './labelDeService';
import { activeView } from './stores/navigation';
import { activeStreamingService, genreDeServiceDemande } from './stores/streaming';

export interface CibleDeService { id: string; nom: string }

export interface ContexteLiensFiche {
  /** Album de la bibliothèque (ni service, ni dépôt, ni Bandcamp). */
  local: boolean;
  /** Le service de l'album (`qobuz`, `tidal`…), `null` pour la bibliothèque. */
  service: string | null;
  /** Le genre de l'album chez le service, avec son identifiant. */
  genreService: CibleDeService | null;
  /** Le label de l'album chez le service, avec son identifiant. */
  labelService: CibleDeService | null;
  /** Les genres que la fiche affiche : un seul = c'est celui du service. */
  genresAffiches?: readonly string[];
  /** Referme la fiche (calque) avant d'aller dans la Bibliothèque. */
  fermer?: (() => void) | null;
}

const cle = (s: string | null | undefined) => (s ?? '').trim().toLocaleLowerCase();

/** Ouvre la page du genre `id` chez `service` (Streaming › service › Genres). */
export function ouvrirGenreDeService(c: { service: string; id: string; nom?: string | null }): void {
  const id = String(c.id ?? '').trim();
  const service = String(c.service ?? '').trim();
  if (!id || !service) return;
  genreDeServiceDemande.set({ service, id, nom: (c.nom ?? '').trim() });
  activeStreamingService.set(service);
  if (get(activeView) !== 'streaming') activeView.set('streaming');
}

/** L'année : la Bibliothèque filtrée, pour un album de la bibliothèque seulement. */
export function entiteAnnee(ctx: ContexteLiensFiche, annee: number | null | undefined, texte: string | null | undefined): Entite | null {
  const nom = (texte ?? '').trim() || (annee != null ? String(annee) : '');
  if (!nom) return null;
  if (!ctx.local || annee == null || !Number.isInteger(annee) || annee <= 0) return { type: 'annee', nom, ouvrir: null };
  return { type: 'annee', nom, annee };
}

/** Un genre : la facette de la Bibliothèque, ou la page du genre chez le service. */
export function entiteGenre(ctx: ContexteLiensFiche, genre: string | null | undefined): Entite | null {
  const nom = (genre ?? '').trim();
  if (!nom) return null;
  if (ctx.local) {
    return { type: 'genre', nom, ouvrir: () => { ctx.fermer?.(); void ouvrirFacetteDansLaBibliotheque('genres', nom); } };
  }
  const g = ctx.genreService;
  const affiches = (ctx.genresAffiches ?? []).filter((x) => cle(x));
  const memeGenre = !!g && (cle(g.nom) === cle(nom) || (affiches.length === 1 && cle(affiches[0]) === cle(nom)));
  if (ctx.service && g && memeGenre) {
    const service = ctx.service;
    return { type: 'genre', nom, ouvrir: () => ouvrirGenreDeService({ service, id: g.id, nom: g.nom || nom }) };
  }
  return { type: 'genre', nom, ouvrir: null };
}

/** Le label : la page du label de la Bibliothèque, ou celle du service. */
export function entiteLabel(ctx: ContexteLiensFiche, label: string | null | undefined): Entite | null {
  const nom = (label ?? '').trim();
  if (!nom) return null;
  if (ctx.local) {
    return { type: 'label', nom, ouvrir: () => { ctx.fermer?.(); void ouvrirLabelDansLaBibliotheque(nom); } };
  }
  const l = ctx.labelService;
  if (ctx.service && l) {
    const service = ctx.service;
    return { type: 'label', nom, ouvrir: () => ouvrirLabelDeService({ service, id: l.id, nom: l.nom || nom }) };
  }
  return { type: 'label', nom, ouvrir: null };
}

/** L'entité mène-t-elle quelque part ? Sinon l'écran garde son texte d'avant. */
export function menePart(e: Entite | null | undefined): e is Entite {
  return !!e && partiesDEntite(e).some((p) => p.ouvrir != null);
}
