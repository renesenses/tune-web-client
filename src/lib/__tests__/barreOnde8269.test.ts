// Discussion #8269 (go de Bertrand, 12/11/2026, rc12) — barre de progression
// en forme d'onde. Témoins de la logique pure : quelle piste a une onde, ce
// qu'est une réponse dessinable, UNE requête par piste, le repli silencieux.
import { describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import {
  cibleClavier, cheminOnde, creerCacheOndes, idPisteOnde, nombreDeBarres,
  normaliserOnde, ondeDeLaPiste, reduireOnde,
} from '../barreOnde';
import type { NowPlaying } from '../types';

const attendre = () => new Promise((r) => setTimeout(r, 0));

describe('#8269 — quelle piste a une onde', () => {
  it('une piste locale, par `track_id` (/zones) ou `id` (/zones/{id}/state)', () => {
    expect(idPisteOnde({ source: 'local', track_id: 12 })).toBe(12);
    expect(idPisteOnde({ source: 'local', id: 7 })).toBe(7);
  });
  it('🔴 jamais une piste de service, une radio ou un média UPnP : pas de fichier', () => {
    for (const source of ['qobuz', 'tidal', 'radio', 'upnp', 'youtube'] as const) {
      expect(idPisteOnde({ source, track_id: 12 }), source).toBeNull();
    }
    expect(idPisteOnde(null)).toBeNull();
    expect(idPisteOnde({ source: 'local' })).toBeNull();
  });
});

describe('#8269 — la réponse du serveur', () => {
  it('garde un tableau de nombres, borné à [0, 1]', () => {
    expect(normaliserOnde({ waveform: [0, 0.5, 1.4, -1] })).toEqual([0, 0.5, 1, 0]);
  });
  it('🔴 « pas d’onde » pour `waveform: null`, un tableau vide, plat ou douteux', () => {
    expect(normaliserOnde({ track_id: 1, waveform: null, error: 'no file path' })).toBeNull();
    expect(normaliserOnde({ waveform: [] })).toBeNull();
    expect(normaliserOnde({ waveform: [0, 0, 0] })).toBeNull();
    expect(normaliserOnde({ waveform: [0.2, 'x'] })).toBeNull();
    expect(normaliserOnde('track not found')).toBeNull();
    expect(normaliserOnde(null)).toBeNull();
  });
  it('réduit par le maximum de chaque tranche, et dessine une barre par point', () => {
    expect(reduireOnde([0.1, 0.9, 0.2, 0.3], 2)).toEqual([0.9, 0.3]);
    expect(reduireOnde([0.1, 0.2], 10)).toEqual([0.1, 0.2]);
    expect(nombreDeBarres(400, 200)).toBe(133);
    expect(nombreDeBarres(30, 200)).toBe(24);
    expect(cheminOnde([0.5, 1]).match(/M/g)!.length).toBe(2);
  });
});

describe('#8269 — clavier', () => {
  it('← / → 10 s bornés, Début / Fin, rien pour les autres touches', () => {
    expect(cibleClavier('ArrowRight', 5_000, 200_000)).toBe(15_000);
    expect(cibleClavier('ArrowRight', 195_000, 200_000)).toBe(200_000);
    expect(cibleClavier('ArrowLeft', 4_000, 200_000)).toBe(0);
    expect(cibleClavier('Home', 50_000, 200_000)).toBe(0);
    expect(cibleClavier('End', 0, 200_000)).toBe(199_000);
    expect(cibleClavier('ArrowUp', 0, 200_000), '↑ reste au volume').toBeNull();
    expect(cibleClavier('a', 0, 200_000)).toBeNull();
    expect(cibleClavier('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('#8269 — une requête par piste', () => {
  it('🔴 deux demandes simultanées partagent la requête ; un refus n’est JAMAIS redemandé', async () => {
    const charger = vi.fn(async (id: number) => {
      if (id === 2) throw new Error('500');
      return { waveform: [0.2, 0.8] };
    });
    const cache = creerCacheOndes(charger);
    const [a, b] = await Promise.all([cache.obtenir(1), cache.obtenir(1)]);
    expect(a).toEqual([0.2, 0.8]);
    expect(b).toBe(a);
    expect(await cache.obtenir(2)).toBeNull();
    expect(await cache.obtenir(2)).toBeNull();
    await cache.obtenir(1);
    expect(charger).toHaveBeenCalledTimes(2);
    expect(cache.connue(2)).toBeNull();
    expect(cache.connue(3)).toBeUndefined();
  });

  it('🔴 le store : rien de demandé réglage décoché ni pour une piste Qobuz ; une seule requête pour une piste locale', async () => {
    const charger = vi.fn(async () => ({ waveform: [0.1, 0.9, 0.4] }));
    const actif = writable(false);
    const piste = writable<Pick<NowPlaying, 'source' | 'track_id' | 'id'> | null>({ source: 'local', track_id: 5 });
    const onde = ondeDeLaPiste(actif, piste, creerCacheOndes(charger));
    const vus: unknown[] = [];
    const stop = onde.subscribe((v) => vus.push(v));
    await attendre();
    expect(get(onde)).toBeNull();
    expect(charger, 'réglage décoché : aucune requête').not.toHaveBeenCalled();

    actif.set(true);
    await attendre(); await attendre();
    expect(get(onde)).toEqual([0.1, 0.9, 0.4]);

    // Tics de position : la piste est la même, rien n'est redemandé.
    piste.set({ source: 'local', track_id: 5 });
    piste.set({ source: 'local', id: 5 });
    await attendre();
    expect(charger).toHaveBeenCalledTimes(1);

    piste.set({ source: 'qobuz', track_id: 99 });
    await attendre();
    expect(get(onde), 'Qobuz : la barre classique').toBeNull();
    expect(charger).toHaveBeenCalledTimes(1);
    stop();
  });

  it('une réponse arrivée après un changement de piste ne s’affiche pas', async () => {
    let libere!: (v: unknown) => void;
    const charger = vi.fn((id: number) => id === 1
      ? new Promise((r) => { libere = r; })
      : Promise.resolve({ waveform: [0.3, 0.6] }));
    const piste = writable<Pick<NowPlaying, 'source' | 'track_id'> | null>({ source: 'local', track_id: 1 });
    const onde = ondeDeLaPiste(writable(true), piste, creerCacheOndes(charger));
    const stop = onde.subscribe(() => {});
    await attendre();
    piste.set({ source: 'radio', track_id: null });
    libere({ waveform: [1, 1] });
    await attendre(); await attendre();
    expect(get(onde)).toBeNull();
    stop();
  });
});
