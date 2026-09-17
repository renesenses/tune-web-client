// renesenses/tune-server-rust#4299 — FabienM, fil 1812 point 14 et 17/09/2026 :
// « ajouter une règle dans les smartplaylists sur la source (Locale, Upnp,
// Qobuz, Tidal, Youtube, Bandcamp). Le critère source existe déjà mais il ne
// fonctionne pas ». Bertrand : « affiche la liste des sources disponibles,
// dans la règle ».
import { describe, expect, it } from 'vitest';
import { libelleSource, sourcesDisponibles } from '../sourcesRegle';
import { operateursDe, typeDuChamp, valeurInitiale, regleComplete } from '../smartRegles';
import { planDeLecture } from '../lectureEnMasse';
import type { Track } from '../types';

const statut = (authenticated: boolean) => ({ enabled: true, authenticated }) as never;

describe('#4299 — les sources proposées dans la règle', () => {
  it('bibliothèque d’abord, puis les services CONNECTÉS dans l’ordre de la page artiste', () => {
    expect(
      sourcesDisponibles({
        bandcamp: statut(true), deezer: statut(false), tidal: statut(true),
        youtube: statut(true), qobuz: statut(true), spotify: statut(true),
      }),
    ).toEqual(['local', 'upnp', 'qobuz', 'tidal', 'youtube', 'bandcamp', 'spotify']);
  });

  it('sans statut connu : la bibliothèque seule', () => {
    expect(sourcesDisponibles(null)).toEqual(['local', 'upnp']);
  });

  it('une règle déjà enregistrée garde sa valeur même si le service est déconnecté', () => {
    expect(sourcesDisponibles({ qobuz: statut(false) }, 'Qobuz')).toEqual(['local', 'upnp', 'Qobuz']);
    expect(sourcesDisponibles({ qobuz: statut(true) }, 'Qobuz')).toEqual(['local', 'upnp', 'qobuz']);
  });

  it('les libellés : « local » traduit, les services par leur nom', () => {
    expect(libelleSource('local', 'Bibliothèque')).toBe('Bibliothèque');
    expect(libelleSource('upnp', 'x')).toBe('UPnP');
    expect(libelleSource('youtube', 'x')).toBe('YouTube');
    expect(libelleSource('Qobuz', 'x')).toBe('Qobuz');
    expect(libelleSource('nouveau', 'x')).toBe('Nouveau');
  });
});

describe('#4299 — la règle « Source » des collections est une LISTE', () => {
  it('son propre type, et seulement « = » / « ≠ »', () => {
    expect(typeDuChamp('source')).toBe('source');
    expect(operateursDe('source').map((o) => o.value)).toEqual(['=', '!=']);
  });

  it('part vide, et n’est complète qu’une source choisie', () => {
    expect(valeurInitiale('=', 'source')).toBe('');
    expect(regleComplete({ field: 'source', op: '=', value: '' })).toBe(false);
    expect(regleComplete({ field: 'source', op: '=', value: 'qobuz' })).toBe(true);
  });
});

describe('#4299 — « Tout lire » d’une playlist intelligente MIXTE', () => {
  it('les favoris de service (id nul) partent avec les pistes locales', () => {
    const liste = [
      { id: 12, title: 'Local' },
      { id: null, source: 'qobuz', source_id: '1065808', title: 'All I Need' },
    ] as unknown as Track[];
    const plan = planDeLecture(liste);
    expect(plan.voie).toBe('tete-et-reste');
    if (plan.voie === 'tete-et-reste') expect(plan.pistes).toBe(2);
  });
});
