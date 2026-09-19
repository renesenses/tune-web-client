import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  totalPistes,
  libelleComptePistes,
  laSuiteExiste,
  rangDeLaSuite,
  fusionnerLaSuite,
} from './rechercheTotaux';
import type { FederatedSearchResult, SearchResult } from './types';

/**
 * #3189 — jfpaquet (forum 1644) voit « Pistes 50 » pour une recherche qui a
 * plus de cent correspondances : le compteur était la longueur de la page
 * reçue. Le serveur compte depuis la 0.9.132 ; l'écran doit lire ce compte,
 * dire qu'il y a une suite, et savoir la demander.
 */
const gabarits = { sur: '{shown} sur {total}', surAuMoins: '{shown} sur au moins {total}' };
const piste = (id: number) => ({ id, title: `piste ${id}` }) as any;
const pistes = (de: number, a: number) => Array.from({ length: a - de + 1 }, (_, i) => piste(de + i));
const reponse = (
  n: number,
  extra: Partial<SearchResult> = {},
  services: Record<string, SearchResult> = {},
): FederatedSearchResult => ({
  local: { artists: [], albums: [], tracks: pistes(1, n), ...extra },
  services,
});

describe('#3189 — le compte affiché est le total, pas la longueur de la page', () => {
  it('« 50 sur 731 » quand le serveur compte', () => {
    const r = reponse(50, { totals: { artists: 3, albums: 9, tracks: 731 }, has_more: { tracks: true }, limit: 50, offset: 0 });
    expect(libelleComptePistes(50, totalPistes(r), gabarits)).toBe('50 sur 731');
  });

  it('un serveur qui ne compte pas (avant la 0.9.132) : le compte affiché, sans invention', () => {
    expect(totalPistes(reponse(50))).toBeNull();
    expect(libelleComptePistes(50, null, gabarits)).toBe('50');
  });

  it('tout est là : un seul nombre', () => {
    const r = reponse(12, { totals: { artists: 0, albums: 0, tracks: 12 }, has_more: { tracks: false } });
    expect(libelleComptePistes(12, totalPistes(r), gabarits)).toBe('12');
  });

  it('le plafond de comptage se lit « au moins »', () => {
    const r = reponse(50, {
      totals: { artists: 0, albums: 0, tracks: 5000 },
      totals_capped: { tracks: true },
      has_more: { tracks: true },
    });
    expect(libelleComptePistes(50, totalPistes(r), gabarits)).toBe('50 sur au moins 5000');
  });

  it('les pistes des services et celles trouvées par métadonnées comptent dans le total', () => {
    // Le COUNT serveur ne porte que le prédicat local ; les pistes rendues en
    // supplément (métadonnées) et celles des services sont bien dans la liste.
    const r = reponse(
      52,
      { totals: { artists: 0, albums: 0, tracks: 731, tracks_via_metadata: 2 } },
      { qobuz: { artists: [], albums: [], tracks: pistes(900, 901) } },
    );
    expect(totalPistes(r)).toEqual({ total: 735, auMoins: false });
  });
});

describe('#3189 — la suite de la bibliothèque locale', () => {
  it('existe quand le serveur le dit, et seulement alors', () => {
    expect(laSuiteExiste(reponse(50, { has_more: { tracks: true } }))).toBe(true);
    expect(laSuiteExiste(reponse(50, { has_more: { tracks: false } }))).toBe(false);
    expect(laSuiteExiste(reponse(50))).toBe(false);
    expect(laSuiteExiste(null)).toBe(false);
  });

  it('se demande au rang offset + limit, pas à la longueur de la liste', () => {
    // La première page peut porter des pistes EN SUPPLÉMENT (métadonnées) :
    // la liste dépasse alors le rang parcouru par le prédicat.
    expect(rangDeLaSuite(reponse(52, { limit: 50, offset: 0 }))).toBe(50);
    expect(rangDeLaSuite(reponse(50, { limit: 50, offset: 50 }))).toBe(100);
    expect(rangDeLaSuite(reponse(50))).toBe(50);
  });

  it('fusionne la page à la suite de la liste, sans doublon, sans muter, et relit has_more', () => {
    const p1 = reponse(50, { totals: { artists: 0, albums: 0, tracks: 120 }, has_more: { tracks: true }, limit: 50, offset: 0 });
    // La piste 50 revient (le tri n'est pas total) : elle ne doit pas doubler.
    const p2 = reponse(0, { tracks: pistes(50, 99), totals: { artists: 0, albums: 0, tracks: 120 }, has_more: { tracks: true }, limit: 50, offset: 50 });
    const f = fusionnerLaSuite(p1, p2);
    expect(f.local.tracks.map((t) => t.id)).toEqual(pistes(1, 99).map((t) => t.id));
    expect(f.local.has_more?.tracks).toBe(true);
    expect(f.local.offset).toBe(50);
    expect(p1.local.tracks.length).toBe(50);
    expect(f.services).toBe(p1.services);
    expect(f.local.albums).toBe(p1.local.albums);
  });

  it('la dernière page éteint la suite et ne touche pas has_more des autres familles', () => {
    const p1 = reponse(50, { has_more: { artists: true, tracks: true }, limit: 50, offset: 0 });
    const p2 = reponse(0, { tracks: pistes(51, 70), has_more: { artists: false, tracks: false }, limit: 50, offset: 50 });
    const f = fusionnerLaSuite(p1, p2);
    expect(f.local.tracks.length).toBe(70);
    expect(laSuiteExiste(f)).toBe(false);
    expect(f.local.has_more?.artists).toBe(true);
  });
});

