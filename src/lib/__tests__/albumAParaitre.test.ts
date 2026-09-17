import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { estAParaitre, parutionMs, dateDeParution, pisteIndisponible } from '../albumAParaitre';
import { versElement } from '../accueilWidgets';

const MAINTENANT = Date.UTC(2026, 8, 17, 12, 0, 0);
const DEMAIN = Math.floor(Date.UTC(2026, 8, 18) / 1000);
const HIER = Math.floor(Date.UTC(2026, 8, 16) / 1000);

describe('point 10 — les albums à paraître sont grisés et injouables', () => {
  it('une date future dit « à paraître », une date passée non', () => {
    expect(estAParaitre({ released_at: DEMAIN }, MAINTENANT)).toBe(true);
    expect(estAParaitre({ released_at: HIER }, MAINTENANT)).toBe(false);
  });

  it('sans date, on ne conclut RIEN : un album sans date n’est pas à paraître', () => {
    expect(estAParaitre({}, MAINTENANT)).toBe(false);
    expect(estAParaitre({ released_at: null }, MAINTENANT)).toBe(false);
    expect(estAParaitre({ released_at: 0 }, MAINTENANT)).toBe(false);
    expect(estAParaitre({ released_at: '2026-09-18' }, MAINTENANT)).toBe(false);
    expect(parutionMs({})).toBeNull();
    expect(dateDeParution({})).toBeNull();
  });

  it('la date se lit dans la langue demandée', () => {
    expect(dateDeParution({ released_at: DEMAIN }, 'fr-FR')).toContain('2026');
  });

  it('une PISTE indisponible se reconnaît, et seulement sur un « non » explicite', () => {
    // Bertrand, 17/09/2026 : « les albums ne sont pas entièrement grisés,
    // seulement certaines pistes ».
    expect(pisteIndisponible({ disponible: false })).toBe(true);
    expect(pisteIndisponible({ disponible: true })).toBe(false);
    expect(pisteIndisponible({})).toBe(false);
    expect(pisteIndisponible(null)).toBe(false);
  });

  it('un album annoncé GARDE sa lecture : ses singles sortis s’écoutent', () => {
    const futur = versElement(
      { source_id: 'a', title: 'À venir', artist_name: 'X', released_at: DEMAIN }, 0, 'alb', { service: 'qobuz' },
    );
    const sorti = versElement(
      { source_id: 'b', title: 'Sorti', artist_name: 'X', released_at: HIER }, 1, 'alb', { service: 'qobuz' },
    );
    expect(futur.aParaitre).toBe(true);
    expect(futur.parution).toBe(DEMAIN);
    expect(typeof futur.jouer).toBe('function');
    expect(sorti.aParaitre).toBe(false);
    expect(typeof sorti.jouer).toBe('function');
  });

  it('les vignettes d’album annoncent la DATE, les listes grisent la PISTE', () => {
    for (const f of ['src/components/v2/PageWidgets.svelte', 'src/components/v2/StreamingV2.svelte']) {
      expect(readFileSync(f, 'utf8'), f).toContain('v2.str.comingOn');
    }
    for (const f of ['src/components/v2/ListePistesV2.svelte', 'src/components/v2/LignePisteV2.svelte']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('pisteIndisponible');
      expect(src, f).toContain('disabled={indispo}');
    }
  });
});
