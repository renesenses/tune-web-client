// Accueil Roon-like (retouche du 27/11/2026) : les sections du bas et les
// rangées de l'accueil de Tune.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  rangeesDeLAccueil, gesteDeLaCarte, grilleEcoutes, dureeCourte, ongletsNouveautes, DEJA_SUR_L_ACCUEIL,
} from '../accueilRoonLike';
import { widgetParId, DISPOSITION_DEFAUT, WIDGETS } from '../accueilWidgets';

const SALON = join(__dirname, '..', '..', 'components', 'salon');

describe('rangées de l’accueil de Tune', () => {
  it('toutes les bandes de la disposition, sauf ce que la page dessine déjà', () => {
    const disp = ['premiere-ligne', 'reprendre', 'recemment-ajoutes', 'favoris', 'favoris', 'inconnu', 'statistiques', 'tops', 'stats-semaine'];
    expect(rangeesDeLAccueil(disp, widgetParId).map((w) => w.id)).toEqual(['reprendre', 'favoris', 'tops']);
  });
  it('aucune bande du registre n’est perdue : chacune est dessinée par la page ou en rangée', () => {
    const bandes = WIDGETS.filter((w) => w.forme === 'bande' || w.forme === 'tops').map((w) => w.id);
    const enRangee = new Set(rangeesDeLAccueil(bandes, widgetParId).map((w) => w.id));
    for (const id of bandes) expect(enRangee.has(id) || DEJA_SUR_L_ACCUEIL.has(id), id).toBe(true);
  });
  it('le défaut de l’accueil donne au moins une rangée', () => {
    expect(rangeesDeLAccueil(DISPOSITION_DEFAUT, widgetParId).length).toBeGreaterThan(0);
  });
});

describe('le clic sur une pochette', () => {
  it('album local, album de service, artiste, zone, lecture', () => {
    expect(gesteDeLaCarte({ ouvrir: 'album', fiche: { id: 12 }, titre: 'x' } as any)).toEqual({ sorte: 'album', id: 12 });
    expect(gesteDeLaCarte({ ouvrir: 'album', fiche: { id: null, source: 'qobuz', source_id: 'q1', title: 'T' }, titre: 'T' } as any))
      .toMatchObject({ sorte: 'albumService', service: 'qobuz', albumId: 'q1' });
    expect(gesteDeLaCarte({ ouvrir: 'artiste', artiste: 'Nina', titre: 'Nina' } as any)).toEqual({ sorte: 'artiste' });
    expect(gesteDeLaCarte({ ouvrir: 'zone', zoneId: 3, titre: 'z' } as any)).toEqual({ sorte: 'zone', zoneId: 3 });
    expect(gesteDeLaCarte({ titre: 'p', jouer: () => {} } as any)).toEqual({ sorte: 'lire' });
    expect(gesteDeLaCarte({ titre: 'rien' } as any)).toEqual({ sorte: 'aucun' });
  });
});

describe('écoutes récentes : quatre semaines × sept jours', () => {
  // Jeudi 26/11/2026 (heure locale).
  const jeudi = new Date(2026, 10, 26, 15);
  it('quatre semaines du lundi au dimanche, la semaine en cours en dernier, jours à venir vides', () => {
    const g = grilleEcoutes([
      { day: '2026-11-26', listening_ms: 3_600_000 },
      { day: '2026-11-23', listening_ms: 600_000 },
      { day: '2026-11-02', listening_ms: 120_000 },
      { day: '2026-10-01', listening_ms: 999_999_999 }, // hors des quatre semaines
    ], jeudi);
    expect(g.semaines.map((s) => s.lundi)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
    expect(g.semaines[3].jours).toEqual([600_000, 0, 0, 3_600_000, null, null, null]);
    expect(g.semaines[0].totalMs).toBe(120_000);
    expect(g.totalMs).toBe(3_600_000 + 600_000 + 120_000);
  });
  it('sans historique : 0 partout, rien d’inventé', () => {
    const g = grilleEcoutes(null, jeudi);
    expect(g.totalMs).toBe(0);
    expect(g.semaines).toHaveLength(4);
  });
  it('durées courtes', () => {
    expect(dureeCourte(0)).toBe('0m');
    expect(dureeCourte(45 * 60000)).toBe('45m');
    expect(dureeCourte(192 * 60000)).toBe('3h 12m');
  });
});

describe('Nouveautés pour vous', () => {
  it('l’onglet Singles n’existe que s’il y a des singles', () => {
    expect(ongletsNouveautes(['Ride Lonesome', 'Time Lab'])).toEqual(['albums']);
    expect(ongletsNouveautes(['Ride Lonesome', 'Neon (Single)'])).toEqual(['albums', 'singles']);
    expect(ongletsNouveautes(['Neon (Single)'])).toEqual(['singles']);
    expect(ongletsNouveautes([])).toEqual(['albums']);
  });
});

describe('l’accueil Roon-like monte toutes ses sections', () => {
  it('Nouveautés, sections du bas, rangées de Tune ; onglet JOUÉ', () => {
    const src = readFileSync(join(SALON, 'AccueilSalon.svelte'), 'utf8');
    expect(src).toContain('<NouveautesSalon />');
    expect(src).toContain('<SectionsAccueilSalon />');
    expect(src).toContain('<RangeesTuneSalon />');
    expect(src).toContain("roonLike.accueil.joue");
    const bas = readFileSync(join(SALON, 'SectionsAccueilSalon.svelte'), 'utf8');
    for (const marque of ['data-liste-tune', 'data-ecoutes-recentes', 'data-radios-accueil', 'data-genres-accueil', 'data-bandeau-explorer', 'data-liste-service']) {
      expect(bas, marque).toContain(marque);
    }
  });
});
