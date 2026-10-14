/**
 * web#2093 (FabienM, fil forum 2236, point 1, 1.0.0-rc4) — « mes actuels
 * titres favoris de Qobuz ne sont pas triés par date ajout du service mais par
 * ordre alphabétique (trier par ajout récent ou ajout ancien ne fait rien).
 * Seuls les nouveaux favoris respectent le tri. »
 *
 * Base neuve : la reprise des favoris du service pose le MÊME `first_seen_at`
 * (l'instant de l'import) sur tous, alors que `created_at` porte le
 * `favorited_at` de Qobuz. Le tri lisait `first_seen_at` d'abord : toutes les
 * dates étaient égales et le départage se faisait par titre.
 */
import { describe, expect, it } from 'vitest';
import { dateDe, titreDe, trierEtFiltrer } from '../favorisTriFiltre';

const IMPORT = '2026-10-12T12:30:00Z';
const importe = (title: string, created_at: string) => ({
  id: null, title, source: 'qobuz', first_seen_at: IMPORT, created_at,
});

describe('dateDe — favori repris d’un service sur une base neuve (#2093)', () => {
  it('la date du service, plus ancienne, prime sur celle de l’import', () => {
    expect(dateDe(importe('x', '2024-02-03T10:00:00Z'))).toBe(Date.parse('2024-02-03T10:00:00Z'));
  });

  it('après une recopie chez le service (#1060), la date de Tune reste la bonne', () => {
    expect(dateDe({ id: null, title: 'x', source: 'qobuz',
      first_seen_at: '2026-03-01T10:00:00Z', created_at: '2026-09-16T08:11:50Z' }))
      .toBe(Date.parse('2026-03-01T10:00:00Z'));
  });

  it('la date du cœur d’un objet local reste en tête (#2052)', () => {
    expect(dateDe({ id: 1, title: 'x', favorite_added_at: '2026-10-01T08:00:00Z',
      created_at: '2020-01-01T00:00:00Z' })).toBe(Date.parse('2026-10-01T08:00:00Z'));
  });
});

describe('trierEtFiltrer — « Ajout récent / ancien » après import (#2093)', () => {
  const favoris = [
    importe('Aaa, aimé en 2022', '2022-05-01T09:00:00Z'),
    importe('Bbb, aimé en 2025', '2025-05-01T09:00:00Z'),
    importe('Ccc, aimé en 2019', '2019-05-01T09:00:00Z'),
    // posé après l'import : sa propre date
    { id: null, title: 'Zzz, aimé à l’instant', source: 'qobuz',
      first_seen_at: '2026-10-12T13:00:00Z', created_at: '2026-10-12T13:00:00Z' },
  ];

  it('range sur la date du service, pas sur le titre, dans les deux sens', () => {
    expect(trierEtFiltrer(favoris, null, 'recent').map(titreDe)).toEqual([
      'Zzz, aimé à l’instant', 'Bbb, aimé en 2025', 'Aaa, aimé en 2022', 'Ccc, aimé en 2019',
    ]);
    expect(trierEtFiltrer(favoris, null, 'ancien').map(titreDe)).toEqual([
      'Ccc, aimé en 2019', 'Aaa, aimé en 2022', 'Bbb, aimé en 2025', 'Zzz, aimé à l’instant',
    ]);
  });
});
