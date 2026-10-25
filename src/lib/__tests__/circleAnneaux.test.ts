// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { construireScene, ordreParCercles, idContact, ID_PLUS_CERCLES, type DonneesCercle, type Vue } from '../champCercle/scene';
import { anneauxDeVue, dansContour, demiBras, DOUCEUR, MAILLE, enveloppe, etiquettesDeVue, formeLissee, pointSurContour, recouvrement, placerEtiquettes, largeurEtiquette, type Boite } from '../champCercle/anneaux';
import { lunesParPlanete, positionLuneEnRangee, largeurRangeeLunes, LUNES_MAX } from '../champCercle/lunes';
import { ChampCercle, type PlacementNoeud } from '../champCercle/moteur';
import { budgetScene } from '../champCercle/budget';
import type { PlaylistCercleResume } from '../circlePlaylists';

// Tune Circle — décision de Bertrand du 24/10/2026 au soir : « les cercles
// relient des utilisateurs ». Un cercle se dessine comme un ANNEAU (boucle
// colorée et nommée) qui entoure ses membres ET moi, et non plus comme un
// nœud placé entre moi et ses membres.

const c = (id: number, nom: string) => ({ id, nom, albums: null, genres: [], lieu: null });

/** Jazz {Alex, Yves}, Rock {Yves, Zoé}, Famille {Max}, et deux contacts hors cercle. */
const donnees = (o: Partial<DonneesCercle> = {}): DonneesCercle => ({
  moi: { nom: 'Bertrand', albums: 9300, genres: [], lieu: null },
  contacts: [c(1, 'Alex'), c(2, 'Hors1'), c(3, 'Max'), c(4, 'Yves'), c(5, 'Zoé'), c(6, 'Hors2')],
  cercles: [
    { id: 7, nom: 'Jazz', membres: [1, 4] },
    { id: 8, nom: 'Rock', membres: [4, 5] },
    { id: 9, nom: 'Famille', membres: [3] },
  ],
  focus: null, maxAutour: 30, maxGrappes: 6,
  ...o,
});

const TAILLES: [number, number][] = [[800, 500], [390, 420], [1400, 640]];

/** Centre en px d'un nœud, aux positions cibles de la vue (même formule que le moteur). */
function centre(d: ReturnType<typeof construireScene>, v: Vue, id: string, W: number, H: number): [number, number] | null {
  const t = d.vues[v].noeuds[id];
  if (!t || t.x == null || t.y == null) return null;
  return [W / 2 + t.x * W * 0.42, H / 2 + t.y * H * 0.43];
}

/** Vérifie la géométrie d'une vue : membres et moi DANS leur boucle, les autres dehors. */
function verifierGeometrie(d: DonneesCercle, v: Vue, prefixe: 'k:' | 'ks:', tailles = TAILLES) {
  const s = construireScene(d);
  for (const [W, H] of tailles) {
    const anneaux = anneauxDeVue(s, v, W, H);
    const ids = Object.keys(s.vues[v].noeuds).filter((k) => k.startsWith(prefixe));
    expect(anneaux.map((a) => a.id).sort()).toEqual(ids.sort());
    for (const a of anneaux) {
      const k = d.cercles.find((x) => `${prefixe}${x.id}` === a.id)!;
      const moi = centre(s, v, 'self', W, H)!;
      expect(dansContour(a.contour, ...moi), `${a.id} doit m'entourer (${W}×${H})`).toBe(true);
      for (const ct of d.contacts) {
        const p = centre(s, v, idContact(ct.id), W, H);
        if (!p) continue;
        const membre = k.membres.includes(ct.id);
        expect(dansContour(a.contour, ...p), `${ct.nom} ${membre ? 'DANS' : 'hors de'} ${k.nom} (${W}×${H})`).toBe(membre);
      }
    }
  }
  return s;
}

describe('anneaux — géométrie pure', () => {
  it('l\'enveloppe contient chaque disque, et pas un point lointain', () => {
    const e = enveloppe([{ x: 0, y: 0, r: 30 }, { x: 200, y: 10, r: 10 }], 12);
    expect(dansContour(e, 0, 0)).toBe(true);
    expect(dansContour(e, 200, 10)).toBe(true);
    expect(dansContour(e, 100, 5)).toBe(true);
    expect(dansContour(e, 0, 41)).toBe(true); // bord du disque (30) + marge (12) – 1
    expect(dansContour(e, 100, 120)).toBe(false);
  });

  it('un point du trait est sur le contour', () => {
    const e = enveloppe([{ x: 0, y: 0, r: 20 }, { x: 100, y: 0, r: 20 }], 0);
    const p = pointSurContour(e, 0, 37);
    expect(distanceAuContour(e, p.x, p.y)).toBeLessThan(1e-6);
  });

  it('ordre : les membres d\'un cercle côte à côte, le contact partagé à la jonction, les hors-cercle à la fin', () => {
    const d = donnees();
    const o = ordreParCercles(d.contacts.map((x) => x.id), d.cercles);
    expect(o).toEqual([1, 4, 5, 3, 2, 6]);
  });
});

describe('anneaux — vue Réseau', () => {
  it('chaque membre DANS la boucle de chacun de ses cercles, moi dans toutes, un contact hors cercle dans aucune', () => {
    const s = verifierGeometrie(donnees(), 'reseau', 'k:');
    // Plus aucun nœud de cercle : des anneaux, sans fil vers eux.
    expect(s.noeuds.some((n) => (n.kind as string) === 'circle')).toBe(false);
    expect(s.noeuds.filter((n) => n.id.startsWith('k:')).every((n) => n.kind === 'ring')).toBe(true);
    expect(s.liens.some((l) => l.a.startsWith('k') || l.b.startsWith('k'))).toBe(false);
    // Les hors-cercle : un fil vers moi ; les membres sans partage : aucun fil.
    expect(s.vues.reseau.liens[`self|${idContact(2)}`]).toBe('line');
    expect(s.vues.reseau.liens[`self|${idContact(6)}`]).toBe('line');
    expect(s.vues.reseau.liens[`self|${idContact(1)}`]).toBeUndefined();
    // Un contact de deux cercles est UNE planète, dans les deux boucles.
    expect(s.noeuds.filter((n) => n.id === idContact(4))).toHaveLength(1);
  });

  it('chaque anneau porte sa couleur, son nom, et tous ses membres pour la vue liste', () => {
    const s = construireScene(donnees());
    const jazz = s.noeuds.find((n) => n.id === 'k:7')!;
    const rock = s.noeuds.find((n) => n.id === 'k:8')!;
    expect(jazz).toMatchObject({ kind: 'ring', label: 'Jazz', membresIds: [1, 4], enclos: ['self', idContact(1), idContact(4)] });
    expect(jazz.hue).not.toBe(rock.hue);
  });

  it('beaucoup de contacts (deux couronnes) et des cercles qui se chevauchent : la géométrie tient', () => {
    const contacts = Array.from({ length: 20 }, (_, i) => c(100 + i, `P${String(i).padStart(2, '0')}`));
    const cercles = [
      { id: 1, nom: 'A', membres: [100, 101, 102, 103] },
      { id: 2, nom: 'B', membres: [103, 104, 105] },
      { id: 3, nom: 'C', membres: [110, 111, 112, 113, 114] },
      { id: 4, nom: 'D', membres: [114, 115] },
    ];
    // Grand écran : jusqu'à 30 contacts autour de moi.
    verifierGeometrie(donnees({ contacts, cercles }), 'reseau', 'k:', [[800, 500], [1400, 640]]);
    // Mobile : 8 contacts autour de moi, puis « +N » (comme l'écran le règle sous 768 px).
    verifierGeometrie(donnees({ contacts, cercles, maxAutour: 8, maxGrappes: 4 }), 'reseau', 'k:', [[390, 420], [360, 380]]);
    verifierGeometrie(donnees({ contacts, cercles, maxAutour: 8, maxGrappes: 4 }), 'seul', 'ks:', [[390, 420], [360, 380]]);
    verifierGeometrie(donnees({ contacts, cercles }), 'seul', 'ks:', [[800, 500], [1400, 640]]);
  });

  it('un cercle vide : une boucle autour de moi seul', () => {
    const d = donnees({ cercles: [{ id: 7, nom: 'Vide', membres: [] }] });
    const s = construireScene(d);
    const [a] = anneauxDeVue(s, 'reseau', 800, 500);
    expect(a.id).toBe('k:7');
    expect(dansContour(a.contour, 400, 250)).toBe(true);
    for (const ct of d.contacts) expect(dansContour(a.contour, ...centre(s, 'reseau', idContact(ct.id), 800, 500)!)).toBe(false);
  });
});

describe('anneaux — vue Solo', () => {
  it('moi au centre, chaque cercle en boucle qui m\'englobe avec les pastilles de ses membres', () => {
    const s = verifierGeometrie(donnees(), 'seul', 'ks:');
    expect(s.vues.seul.noeuds[idContact(1)].avatar).toBeGreaterThan(0);
    // Les contacts hors cercle n'ont rien à faire en Solo.
    expect(s.vues.seul.noeuds[idContact(2)]).toBeUndefined();
    expect(s.noeuds.find((n) => n.id === ID_PLUS_CERCLES)).toBeUndefined();
  });

  it('au plus `maxGrappes` boucles, puis « +N »', () => {
    const d = donnees({ maxGrappes: 2 });
    const s = verifierGeometrie(d, 'seul', 'ks:');
    expect(Object.keys(s.vues.seul.noeuds).filter((k) => k.startsWith('ks:')).sort()).toEqual(['ks:7', 'ks:8']);
    expect(s.noeuds.find((n) => n.id === ID_PLUS_CERCLES)).toMatchObject({ kind: 'more', label: '+1', plusDe: 'cercles' });
    expect(s.vues.seul.noeuds[ID_PLUS_CERCLES].alpha).toBe(1);
    // Max n'est que dans « Famille », qui n'a pas de boucle ici : pas de pastille.
    expect(s.vues.seul.noeuds[idContact(3)]).toBeUndefined();
  });
});

describe('anneaux — les lunes sur la boucle', () => {
  const pl = (o: Partial<PlaylistCercleResume>): PlaylistCercleResume => ({
    id: 'p', name: 'P', owner: null, count: 0, version: 1, updated_at: null, mine: true, circle_id: null, ...o,
  });

  it('une playlist d\'un de mes cercles va sur son ANNEAU ; celle d\'un contact sur sa planète ; plafond inchangé', () => {
    const s = construireScene(donnees());
    const presents = new Set(s.noeuds.map((n) => n.id));
    const ps = [
      ...Array.from({ length: 7 }, (_, i) => pl({ id: i, name: `J${i}`, mine: true, circle_id: 7 })),
      pl({ id: 'x', name: 'Dimanche', mine: false, owner: { user_id: 4, name: 'Yves' } }),
    ];
    const m = lunesParPlanete(ps, presents);
    expect(s.noeuds.find((n) => n.id === 'k:7')?.kind).toBe('ring');
    expect(m.get('k:7')!.lunes).toHaveLength(LUNES_MAX);
    expect(m.get('k:7')!.reste).toBe(2);
    expect(m.get('ks:7')!.lunes).toHaveLength(LUNES_MAX);
    expect(m.get(idContact(4))!.lunes.map((l) => l.nom)).toEqual(['Dimanche']);
  });

  it('le moteur pose l\'anneau ; chaque lune est SUR son trait, à pas fixe, sans se chevaucher', () => {
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
    m.vue('reseau', true);
    while (file.length) file.shift()!(16);
    const a = places.get('k:7')!;
    expect(a).toMatchObject({ mode: 'ring' });
    expect(a.contour!.length).toBeGreaterThan(6);
    // Le nom est posé DEHORS de la forme (25/10 : plus sur le trait).
    expect(dansContour(a.contour!, a.x, a.y)).toBe(false);
    expect(distanceAuContour(a.contour!, a.x, a.y)).toBeGreaterThan(8);
    // Les planètes de ses membres (Alex, Yves) dedans, Zoé (Rock seulement) et moi : moi dedans, Zoé dehors.
    const p = (id: string) => places.get(id)!;
    expect(dansContour(a.contour!, p(idContact(1)).x, p(idContact(1)).y)).toBe(true);
    expect(dansContour(a.contour!, p(idContact(4)).x, p(idContact(4)).y)).toBe(true);
    expect(dansContour(a.contour!, p('self').x, p('self').y)).toBe(true);
    expect(dansContour(a.contour!, p(idContact(5)).x, p(idContact(5)).y)).toBe(false);
    // En Réseau, l'anneau de la vue Solo est caché (ses lunes aussi).
    expect(places.get('ks:7')).toBeNull();
    // Les lunes : une rangée serrée à droite du nom, sans se chevaucher (12 px chacune).
    expect(a.lunesX).toBeGreaterThan(a.x);
    const lunes = Array.from({ length: 6 }, (_, k) => positionLuneEnRangee(a.lunesX!, a.y, k));
    for (const l of lunes) expect(l.y).toBe(a.y);
    for (let i = 1; i < lunes.length; i++) expect(lunes[i].x - lunes[i - 1].x).toBeGreaterThanOrEqual(13);
    expect(lunes[0].x - 6).toBeGreaterThan(a.x);
    m.detruire();
    vi.unstubAllGlobals();
  });
});

describe('anneaux — le design de Levente (25/10)', () => {
  it('forme lissée : contient chaque disque gonflé, suit les bras, ne couvre pas la scène comme l\'enveloppe convexe', () => {
    const moi = { x: 400, y: 250, r: 40 };
    const a = { x: 700, y: 120, r: 20 }; const b = { x: 650, y: 420, r: 20 };
    const f = formeLissee([moi, a, b], 12);
    const conv = enveloppe([moi, a, b], 12);
    for (const d of [moi, a, b]) {
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2;
        expect(dansContour(f, d.x + Math.cos(t) * (d.r + 11), d.y + Math.sin(t) * (d.r + 11))).toBe(true);
      }
    }
    // Le bras relie moi à chaque membre.
    for (const d of [a, b]) for (let k = 1; k < 10; k++) expect(dansContour(f, moi.x + (d.x - moi.x) * k / 10, moi.y + (d.y - moi.y) * k / 10)).toBe(true);
    // Entre les deux membres, là où l'enveloppe convexe passait : vide.
    expect(dansContour(conv, 640, 270)).toBe(true);
    expect(dansContour(f, 640, 270)).toBe(false);
    expect(aire(f)).toBeLessThan(aire(conv) * 0.6);
    // Sans pointe parasite : chaque sommet colle à un disque gonflé ou à un bras, à la rondeur près.
    const w = demiBras(12); const tol = DOUCEUR / 4 + 1;
    const n = f.length / 2;
    for (let i = 0; i < n; i++) {
      const x = f[i * 2]; const y = f[i * 2 + 1];
      const prochesDisque = [moi, a, b].some((d) => Math.hypot(x - d.x, y - d.y) <= d.r + 12 + tol);
      const prochesBras = [a, b].some((d) => distSeg(x, y, moi, d) <= w + tol);
      expect(prochesDisque || prochesBras, `sommet ${i}`).toBe(true);
    }
    // Et un raccord doux (le creux comblé) au pied des bras : plus d'aire qu'une union sèche.
    const aPlat = formeLissee([moi, a, b], 12, MAILLE, 1e-6);
    expect(aire(f)).toBeGreaterThan(aire(aPlat));
  });

  it('étiquettes : aucune boîte d\'étiquette de cercle ne coupe une boîte de nom (ni une autre étiquette), sur toutes les tailles', () => {
    const contacts = Array.from({ length: 14 }, (_, i) => ({ id: 100 + i, nom: ['Alex Campbell', 'Reivax66', 'Sevy Tabroc', 'Belkadi Yacine', 'Benjithom', 'FabienM', 'Levente', 'Matteo', 'Gilles', 'Tades', 'Vincent', 'Yves', 'Zoé', 'Ana'][i], albums: i % 3 ? 4100 : null, genres: [], lieu: null }));
    const cercles = [
      { id: 1, nom: 'Vumètre', membres: [110] },
      { id: 2, nom: 'Bermuda', membres: [100, 101] },
      { id: 3, nom: 'Test', membres: [101, 102, 103, 104, 105, 106] },
    ];
    const d = donnees({ contacts, cercles });
    const s = construireScene(d);
    for (const [W, H] of [[1600, 550], [1400, 640], [800, 500], [390, 420]] as [number, number][]) {
      for (const v of ['reseau', 'seul'] as Vue[]) {
        const { noeuds, etiquettes, anneaux } = etiquettesDeVue(s, v, W, H, () => largeurRangeeLunes(3));
        expect(etiquettes.length).toBe(anneaux.length);
        for (const e of etiquettes) {
          for (const o of noeuds) expect(recouvrement(e.boite, o), `${e.id} sur un nom (${v} ${W}×${H})`).toBe(0);
          for (const f of etiquettes) if (f !== e) expect(recouvrement(e.boite, f.boite)).toBe(0);
          const a = anneaux.find((x) => x.id === e.id)!;
          expect(dansContour(a.contour, e.x, e.y), `${e.id} dehors de sa forme`).toBe(false);
        }
      }
    }
  });

  it('évitement : à côté d\'un nom, l\'étiquette se pose ailleurs', () => {
    const moi = { x: 300, y: 200, r: 30 }; const m = { x: 500, y: 200, r: 16 };
    const contour = formeLissee([moi, m], 12);
    // Un nom occupe tout le côté droit du membre, là où l'étiquette irait d'abord.
    const nom: Boite = { x: 520, y: 150, w: 200, h: 100 };
    const [e] = placerEtiquettes([{ id: 'k', contour, cx: 300, cy: 200, dx: 1, dy: 0, largeur: largeurEtiquette('Bermuda') }], [nom], 900, 400);
    expect(recouvrement(e.boite, nom)).toBe(0);
  });
});

function distSeg(x: number, y: number, p: { x: number; y: number }, q: { x: number; y: number }): number {
  const dx = q.x - p.x; const dy = q.y - p.y; const l2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / l2));
  return Math.hypot(x - (p.x + t * dx), y - (p.y + t * dy));
}

function aire(c: ArrayLike<number>): number {
  let s = 0; const n = c.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += c[i * 2] * c[j * 2 + 1] - c[j * 2] * c[i * 2 + 1]; }
  return Math.abs(s) / 2;
}

function distanceAuContour(c: ArrayLike<number>, x: number, y: number): number {
  const n = c.length / 2;
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = c[i * 2]; const ay = c[i * 2 + 1]; const bx = c[j * 2]; const by = c[j * 2 + 1];
    const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2)) : 0;
    min = Math.min(min, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
  }
  return min;
}
