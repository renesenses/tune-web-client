// Discussion #8269 (go de Bertrand, 12/11/2026, rc12) — barre de progression
// en forme d'onde. Témoins de la logique pure : quelle piste a une onde, ce
// qu'est une réponse dessinable, UNE requête par piste, le repli silencieux.
import { describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import {
  cibleClavier, cheminOnde, creerCacheOndes, idPisteOnde, nombreDeBarres,
  clePisteOnde, DELAI_REESSAI_MS, echecDefinitif, normaliserOnde, ondeDeLaPiste,
  pisteDeServiceDe, reduireOnde, type ClePiste,
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
    const charger = vi.fn(async (id: ClePiste) => {
      if (id === 2) throw Object.assign(new Error('404'), { status: 404 });
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
    const charger = vi.fn((id: ClePiste) => id === 1
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

// Bertrand, .18, 17/11/2026 : « la forme d'onde a disparu » sous Chrome, pas
// sous Safari. L'onglet Chrome était resté ouvert pendant la mise à jour et le
// redémarrage du serveur (16/11) : la demande échouée alors était retenue
// comme « pas d'onde » pour la vie de l'onglet. Cmd+Maj+R l'a fait revenir.
describe('#8269 — une panne passagère n’est pas une réponse', () => {
  const erreur = (status?: number) => Object.assign(new Error(String(status ?? 'réseau')), status === undefined ? {} : { status });

  it('définitif : 404, 400, 422, 501 ; passager : réseau, 500, 502, 503, 401, 408, 429', () => {
    for (const s of [404, 400, 422, 501]) expect(echecDefinitif(erreur(s)), String(s)).toBe(true);
    for (const s of [undefined, 500, 502, 503, 401, 408, 429]) expect(echecDefinitif(erreur(s)), String(s)).toBe(false);
    expect(echecDefinitif(new TypeError('Failed to fetch'))).toBe(false);
    expect(echecDefinitif(null)).toBe(false);
  });

  it('🔴 le cache : après une panne réseau ou un 503, la piste est redemandée et son onde revient', async () => {
    let panne: Error | null = new TypeError('Failed to fetch');
    const charger = vi.fn(async () => {
      if (panne) throw panne;
      return { waveform: [0.2, 0.8] };
    });
    const cache = creerCacheOndes(charger);
    expect(await cache.obtenir(7)).toBeNull();
    expect(cache.connue(7), 'rien de retenu après une panne réseau').toBeUndefined();
    panne = erreur(503);
    expect(await cache.obtenir(7)).toBeNull();
    expect(cache.connue(7), 'rien de retenu après un 503').toBeUndefined();
    panne = null;
    expect(await cache.obtenir(7)).toEqual([0.2, 0.8]);
    expect(cache.connue(7)).toEqual([0.2, 0.8]);
    await cache.obtenir(7);
    expect(charger).toHaveBeenCalledTimes(3);
  });

  it('🔴 le store : panne au premier passage, l’onde revient au retour sur la piste et au remontage', async () => {
    let panne = true;
    const charger = vi.fn(async () => {
      if (panne) throw erreur(502);
      return { waveform: [0.1, 0.9] };
    });
    const piste = writable<Pick<NowPlaying, 'source' | 'track_id'> | null>({ source: 'local', track_id: 3 });
    const onde = ondeDeLaPiste(writable(true), piste, creerCacheOndes(charger));
    let stop = onde.subscribe(() => {});
    await attendre(); await attendre();
    expect(get(onde)).toBeNull();
    expect(charger).toHaveBeenCalledTimes(1);

    // Le serveur est revenu. Remontage (l'écran se rouvre) : redemandée.
    panne = false;
    stop();
    stop = onde.subscribe(() => {});
    await attendre(); await attendre();
    expect(charger).toHaveBeenCalledTimes(2);
    expect(get(onde)).toEqual([0.1, 0.9]);
    stop();

    // Changement de piste puis retour : panne sur la 4, revenue au retour.
    panne = true;
    stop = onde.subscribe(() => {});
    piste.set({ source: 'local', track_id: 4 });
    await attendre(); await attendre();
    expect(get(onde)).toBeNull();
    panne = false;
    piste.set({ source: 'local', track_id: 3 });
    await attendre();
    piste.set({ source: 'local', track_id: 4 });
    await attendre(); await attendre();
    expect(get(onde), 'la 4 redemandée après la panne').toEqual([0.1, 0.9]);
    expect(charger).toHaveBeenCalledTimes(4);
    stop();
  });
});

// Go de Bertrand du 17/11/2026 (rc13) : l'onde des pistes Qobuz et TIDAL.
describe('#8269 rc13 — Qobuz et TIDAL', () => {
  it('la clé : id de bibliothèque pour une piste locale, « service:id » pour Qobuz/TIDAL, rien sinon', () => {
    expect(clePisteOnde({ source: 'local', track_id: 12 })).toBe(12);
    expect(clePisteOnde({ source: 'qobuz', track_id: null, source_id: '48098083' })).toBe('qobuz:48098083');
    expect(clePisteOnde({ source: 'tidal', source_id: ' 123 ' } as never)).toBe('tidal:123');
    for (const source of ['radio', 'podcast', 'upnp', 'spotify', 'youtube'] as const) {
      expect(clePisteOnde({ source, source_id: 'x' } as never), source).toBeNull();
    }
    expect(clePisteOnde({ source: 'qobuz', source_id: null } as never)).toBeNull();
    expect(pisteDeServiceDe('qobuz:4:2')).toEqual({ service: 'qobuz', id: '4:2' });
    expect(pisteDeServiceDe(12)).toBeNull();
  });

  it('🔴 « pending » n’est pas retenu ; le store redemande, puis montre l’onde', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let pret = false;
      const charger = vi.fn(async () => (pret ? { waveform: [0.2, 0.7] } : { waveform: null, pending: true }));
      const cache = creerCacheOndes(charger);
      const piste = writable<Pick<NowPlaying, 'source' | 'track_id' | 'source_id'> | null>(
        { source: 'qobuz', track_id: null, source_id: '1' },
      );
      const onde = ondeDeLaPiste(writable(true), piste, cache, writable(true));
      const stop = onde.subscribe(() => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(get(onde)).toBeNull();
      expect(cache.connue('qobuz:1'), '« pending » : rien de retenu').toBeUndefined();
      await vi.advanceTimersByTimeAsync(DELAI_REESSAI_MS);
      expect(charger).toHaveBeenCalledTimes(2);
      pret = true;
      await vi.advanceTimersByTimeAsync(DELAI_REESSAI_MS);
      expect(get(onde)).toEqual([0.2, 0.7]);
      expect(charger).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(DELAI_REESSAI_MS * 5);
      expect(charger).toHaveBeenCalledTimes(3);

      // Changement de piste pendant un calcul : les relances cessent.
      pret = false;
      piste.set({ source: 'qobuz', track_id: null, source_id: '2' });
      await vi.advanceTimersByTimeAsync(0);
      piste.set({ source: 'radio', track_id: null, source_id: 'r' });
      await vi.advanceTimersByTimeAsync(DELAI_REESSAI_MS * 5);
      expect(charger).toHaveBeenCalledTimes(4);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

// Décision de Bertrand du 17/11/2026 (option C) : l'onde des pistes de
// streaming est un réglage à part, décoché par défaut.
describe('#8269 rc13 — réglage « Forme d’onde des pistes de streaming »', () => {
  it('🔴 décoché (défaut) : aucune requête pour Qobuz/TIDAL ; les pistes locales ne changent pas', async () => {
    const charger = vi.fn(async () => ({ waveform: [0.4, 0.8] }));
    const piste = writable<Pick<NowPlaying, 'source' | 'track_id' | 'source_id'> | null>(
      { source: 'qobuz', track_id: null, source_id: '9' },
    );
    const services = writable(false);
    const onde = ondeDeLaPiste(writable(true), piste, creerCacheOndes(charger), services);
    const stop = onde.subscribe(() => {});
    await attendre(); await attendre();
    expect(get(onde)).toBeNull();
    expect(charger).not.toHaveBeenCalled();
    // Sans 4ᵉ argument : décoché aussi.
    const parDefaut = ondeDeLaPiste(writable(true), piste, creerCacheOndes(charger));
    const stop2 = parDefaut.subscribe(() => {});
    await attendre();
    expect(charger).not.toHaveBeenCalled();
    stop2();
    // Piste locale : demandée, réglage décoché ou non.
    piste.set({ source: 'local', track_id: 41, source_id: null });
    await attendre(); await attendre();
    expect(charger).toHaveBeenCalledWith(41);
    expect(get(onde)).toEqual([0.4, 0.8]);
    // Coché : la piste de service est demandée.
    services.set(true);
    piste.set({ source: 'tidal', track_id: null, source_id: '9' });
    await attendre(); await attendre();
    expect(charger).toHaveBeenCalledWith('tidal:9');
    stop();
  });
});

