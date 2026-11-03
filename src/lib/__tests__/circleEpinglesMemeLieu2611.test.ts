// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { construireScene, idEpingle, type DonneesCercle } from '../champCercle/scene';
import { ChampCercle, type PlacementNoeud } from '../champCercle/moteur';
import { budgetScene } from '../champCercle/budget';
import { decalagesEpingles, ECART_EPINGLES } from '../champCercle/epingles';

// tune-web-client#2611 (Bertrand, .18 rc10, 03/11/2026) : deux contacts qui
// ont posé la même ville avaient leurs épingles au même pixel du globe, et
// leurs étiquettes (nom + ville) s'imprimaient l'une sur l'autre.

const ville = (label: string, lat: number, lon: number) => ({ label, lat, lon });
const DIJON = ville('Dijon', 47.5, 5.0);
const GRENOBLE = ville('Grenoble', 45.0, 5.5);
const BUDAPEST = ville('Budapest', 47.5, 19.0);

const contact = (id: number, nom: string, lieu: ReturnType<typeof ville> | null) => ({ id, nom, albums: null, genres: [], lieu });

const donnees = (): DonneesCercle => ({
  moi: { nom: 'Moi', albums: null, genres: [], lieu: DIJON },
  contacts: [contact(1, 'Alex', GRENOBLE), contact(2, 'Zoé', GRENOBLE), contact(3, 'Max', BUDAPEST)],
  cercles: [], focus: null, maxAutour: 30, maxGrappes: 6,
});

describe('Tune Circle, globe : épingles d\'un même lieu (#2611)', () => {
  it('étage les épingles d\'un même lieu, laisse seules les autres, la mienne en tête', () => {
    const d = decalagesEpingles([
      { id: 'p:2', lat: 0.8, lon: 0.1 },
      { id: 'p:1', lat: 0.8, lon: 0.1 },
      { id: 'p:3', lat: 0.9, lon: 0.1 },
      { id: 'p:moi', lat: 0.9, lon: 0.1, me: true },
      { id: 'p:4', lat: 0.7, lon: 0.2 },
    ]);
    expect(d.get('p:1')).toEqual([0, -ECART_EPINGLES / 2]);
    expect(d.get('p:2')).toEqual([0, ECART_EPINGLES / 2]);
    expect(d.get('p:moi')).toEqual([0, -ECART_EPINGLES / 2]);
    expect(d.get('p:3')).toEqual([0, ECART_EPINGLES / 2]);
    expect(d.has('p:4')).toBe(false);
  });

  it('le moteur pose deux contacts de la même ville à deux endroits distincts', () => {
    const file: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { file.push(f); return file.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const ctx = new Proxy({}, {
      get: (_c, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
      set: () => true,
    });
    const canvas = document.createElement('canvas');
    (canvas as any).getContext = () => ctx;
    const places = new Map<string, PlacementNoeud | null>();
    const m = new ChampCercle(canvas, {
      budget: budgetScene({ largeur: 1200, lectureLocale: false, mouvementReduit: true }),
      placer: (id, p) => { places.set(id, p); },
    });
    m.redimensionner(800, 500);
    m.majScene(construireScene(donnees()));
    m.vue('monde', true);
    for (let i = 0; i < 40 && file.length; i++) file.shift()!(16 * (i + 1));
    const a = places.get(idEpingle(1));
    const b = places.get(idEpingle(2));
    const seul = places.get(idEpingle(3));
    expect(a && b && seul).toBeTruthy();
    // Même lieu : même colonne, une étiquette de deux lignes d'écart.
    expect(a!.x).toBeCloseTo(b!.x, 6);
    expect(Math.abs(a!.y - b!.y)).toBeCloseTo(ECART_EPINGLES, 6);
    // Un lieu différent reste ailleurs.
    expect(Math.hypot(seul!.x - a!.x, seul!.y - a!.y)).toBeGreaterThan(20);
    m.detruire();
    vi.unstubAllGlobals();
  });
});
