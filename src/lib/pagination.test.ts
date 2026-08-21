import { describe, it, expect } from 'vitest';
import { fusionnerPage } from './pagination';

const alb = (id: number) => ({ id: String(id) });
const cle = (a: { id: string }) => a.id;
const page = (debut: number, combien: number) =>
  Array.from({ length: combien }, (_, i) => alb(debut + i));

describe('fusionnerPage', () => {
  it('ajoute la page à la suite, dans l’ordre', () => {
    const r = fusionnerPage(page(1, 50), page(51, 50), 50, cle);
    expect(r.liste).toHaveLength(100);
    expect(r.liste[0].id).toBe('1');
    expect(r.liste[99].id).toBe('100');
  });

  it('une page pleine et neuve laisse le bouton', () => {
    expect(fusionnerPage(page(1, 50), page(51, 50), 50, cle).encore).toBe(true);
  });

  it('une page courte arrête le bouton', () => {
    // Le cas normal de fin de discographie.
    expect(fusionnerPage(page(1, 50), page(51, 12), 50, cle).encore).toBe(false);
  });

  it('une page vide arrête le bouton', () => {
    const r = fusionnerPage(page(1, 50), [], 50, cle);
    expect(r.encore).toBe(false);
    expect(r.liste).toHaveLength(50);
  });

  /// Le piège qui boucle à l'infini : un service qui ignore l'offset et
  /// resert la première page. Elle est PLEINE — la seule longueur ne suffit
  /// donc pas à s'arrêter.
  it("une page pleine mais entièrement déjà vue arrête le bouton", () => {
    const deja = page(1, 50);
    const r = fusionnerPage(deja, page(1, 50), 50, cle);
    expect(r.encore).toBe(false);
    expect(r.liste).toHaveLength(50);
  });

  it('écarte les doublons sans perdre les nouveautés', () => {
    // Chevauchement de page : un catalogue qui bouge entre deux appels.
    const r = fusionnerPage(page(1, 50), page(45, 50), 50, cle);
    expect(r.liste).toHaveLength(94);
    expect(new Set(r.liste.map(cle)).size).toBe(94);
    expect(r.encore).toBe(true);
  });

  it('ne modifie pas la liste reçue', () => {
    const actuelle = page(1, 3);
    const copie = [...actuelle];
    fusionnerPage(actuelle, page(4, 3), 50, cle);
    expect(actuelle).toEqual(copie);
  });

  it('part d’une liste vide sans cas particulier', () => {
    const r = fusionnerPage([], page(1, 50), 50, cle);
    expect(r.liste).toHaveLength(50);
    expect(r.encore).toBe(true);
  });
});
