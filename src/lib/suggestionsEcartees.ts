/**
 * « Pas pour moi » sur une suggestion de l'accueil (renesenses/tune-web-client#916,
 * FabienM, fil forum 1527 : « avec les deux boutons "Écouter" / "Pas pour moi" »).
 *
 * ## Où vit l'écart
 *
 * Sur le SERVEUR, par profil (`X-Profile-Id`), table `suggestions_ecartees`.
 * Pas dans le navigateur : un « non » dit sur le téléphone vaut aussi sur
 * l'ordinateur, et ne vaut pas pour le reste de la maison. Les rangées de
 * recommandation de `/home/*` le lisent déjà pour se filtrer.
 *
 * Ce module en tient une COPIE pour deux raisons, pas plus :
 *  1. la vignette disparaît au clic, sans attendre un rechargement de la page ;
 *  2. les rangées éditoriales d'un service (sélection Qobuz) passent par les
 *     routes de CATALOGUE, que l'écran Streaming partage : le serveur ne peut
 *     pas les filtrer sans retirer aussi la playlist du catalogue. L'accueil
 *     les filtre donc ici, avec la même liste.
 *
 * ## Ce qui s'écarte
 *
 * Un album (local ou de service), une playlist de service, ou l'ARTISTE d'une
 * suggestion — par son nom, chez tous les services à la fois. La règle de
 * nom est celle du serveur (`nom_normalise` : minuscules, espaces réduits) :
 * deux règles qui divergent feraient revenir au rechargement ce qui avait
 * disparu au clic.
 */
import { derived, get, writable } from 'svelte/store';
import * as api from './api';
import type { SuggestionEcartee } from './api';
import type { Element } from './accueilWidgets';

export type { SuggestionEcartee };

/** Le nom d'un artiste tel que le serveur le compare. */
export function nomNormalise(nom: string): string {
  return nom.trim().split(/\s+/).filter(Boolean).join(' ').toLowerCase();
}

/** La clé d'une désignation : `type|source|identifiant`. */
export function cleEcart(s: Pick<SuggestionEcartee, 'item_type' | 'source' | 'item_id'>): string {
  const source = s.item_type === 'artist' ? 'nom' : (s.source ?? '').trim().toLowerCase() || 'local';
  const id = s.item_type === 'artist' ? nomNormalise(s.item_id) : String(s.item_id).trim();
  return `${s.item_type}|${source}|${id}`;
}

const estService = (s: string | null | undefined): s is string =>
  !!s && !['local', 'radio', 'upnp', 'nom'].includes(s.trim().toLowerCase());

/**
 * Ce que « Pas pour moi » écarte pour CETTE vignette : l'album ou la playlist
 * qu'elle montre. `null` hors des rangées de suggestion, ou quand la vignette
 * ne désigne rien de façon sûre — un geste absent vaut mieux qu'un écart qui
 * ne retirerait rien.
 */
export function cibleDeSuggestion(el: Element): SuggestionEcartee | null {
  if (!el?.suggestion) return null;
  const instantane = {
    title: el.titre && el.titre !== '—' ? el.titre : null,
    subtitle: el.sous ?? null,
    cover_url: el.cover ?? null,
  };
  // web#916 (13/10/2026) — une radio de l'accueil, par son identifiant local.
  if (el.radioId != null) {
    return Number.isInteger(el.radioId) && el.radioId > 0
      ? { item_type: 'radio', source: 'local', item_id: String(el.radioId), ...instantane }
      : null;
  }
  if (el.ouvrir === 'playlist') {
    const sid = el.favoriDistant?.itemType === 'playlist' ? el.favoriDistant.serviceId : null;
    const service = el.source ?? null;
    if (!sid || !estService(service)) return null;
    return { item_type: 'playlist', source: service.trim().toLowerCase(), item_id: String(sid), ...instantane };
  }
  const fiche = el.fiche;
  if (!fiche) return null;
  if (typeof fiche.id === 'number' && fiche.id > 0) {
    return { item_type: 'album', source: 'local', item_id: String(fiche.id), ...instantane };
  }
  const service = fiche.source ?? el.source ?? null;
  const sid = fiche.source_id ?? null;
  if (sid != null && String(sid).trim() && estService(service)) {
    return { item_type: 'album', source: service.trim().toLowerCase(), item_id: String(sid), ...instantane };
  }
  return null;
}

/** L'ARTISTE de la suggestion, quand la rangée le connaît. */
export function cibleArtiste(el: Element): SuggestionEcartee | null {
  if (!el?.suggestion) return null;
  const nom = (el.artisteSuggere ?? '').trim();
  if (!nom) return null;
  return { item_type: 'artist', source: 'nom', item_id: nom, title: nom, subtitle: null, cover_url: null };
}

/** La liste du profil actif — la copie de ce que le serveur range. */
export const suggestionsEcartees = writable<SuggestionEcartee[]>([]);

/** Les clés écartées, pour un test en temps constant par vignette. */
export const clesEcartees = derived(suggestionsEcartees, (l) => new Set(l.map(cleEcart)));

/** La vignette est-elle écartée — elle-même, ou son artiste ? */
export function estEcartee(el: Element, cles: Set<string>): boolean {
  if (!el?.suggestion || cles.size === 0) return false;
  const c = cibleDeSuggestion(el);
  if (c && cles.has(cleEcart(c))) return true;
  const a = cibleArtiste(el);
  return !!a && cles.has(cleEcart(a));
}

/** Relit la liste du profil actif. Un échec garde la copie telle quelle. */
export async function chargerSuggestionsEcartees(): Promise<void> {
  try {
    const r = await api.getSuggestionsEcartees();
    suggestionsEcartees.set(Array.isArray(r?.items) ? r.items : []);
  } catch {
    // Un serveur antérieur ne connaît pas la route : rien n'est écarté.
  }
}

/**
 * « Pas pour moi ». La vignette disparaît TOUT DE SUITE (copie locale), puis
 * le serveur range l'écart ; s'il refuse, la vignette revient et l'erreur
 * remonte à l'appelant, qui le dit.
 */
export async function ecarter(s: SuggestionEcartee): Promise<SuggestionEcartee> {
  const cle = cleEcart(s);
  const deja = get(suggestionsEcartees).some((x) => cleEcart(x) === cle);
  if (!deja) suggestionsEcartees.update((l) => [s, ...l]);
  try {
    const r = await api.ecarterSuggestion(s);
    const range = r?.item ?? s;
    suggestionsEcartees.update((l) => [range, ...l.filter((x) => cleEcart(x) !== cle)]);
    return range;
  } catch (e) {
    if (!deja) suggestionsEcartees.update((l) => l.filter((x) => cleEcart(x) !== cle));
    throw e;
  }
}

/** « Annuler » (le message) et « Rétablir » (les Réglages). */
export async function retablir(s: Pick<SuggestionEcartee, 'item_type' | 'source' | 'item_id'>): Promise<void> {
  const cle = cleEcart(s);
  const avant = get(suggestionsEcartees);
  suggestionsEcartees.set(avant.filter((x) => cleEcart(x) !== cle));
  try {
    await api.retablirSuggestion(s);
  } catch (e) {
    suggestionsEcartees.set(avant);
    throw e;
  }
}
