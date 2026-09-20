import { describe, expect, it, vi } from 'vitest';
import { entreesMenuZone, ICONES_ZONE, type GestesZone } from '../menuZone';

function gestes(): GestesZone {
  return {
    renommer: vi.fn(), reglages: vi.fn(), latence: vi.fn(),
    appairer: vi.fn(), fusionner: vi.fn(), supprimer: vi.fn(),
  };
}
const cles = (c: Parameters<typeof entreesMenuZone>[0]) => entreesMenuZone(c, gestes()).map((e) => e.cle);

describe('#1392 — le menu d’une zone', () => {
  it('tient en trois entrées hors mode expert, la suppression en dernier', () => {
    expect(cles({ expert: false, appairable: false, jumelle: null })).toEqual([
      'zone.rename', 'v2.zone.openSettings', 'zone.deleteZone',
    ]);
  });

  it('marque la suppression comme destructive, et elle SEULE', () => {
    const e = entreesMenuZone({ expert: true, appairable: true, jumelle: 'Salon' }, gestes());
    expect(e.filter((x) => x.danger).map((x) => x.cle)).toEqual(['zone.deleteZone']);
    expect(e[e.length - 1].cle).toBe('zone.deleteZone');
  });

  it('n’ouvre la latence et l’appairage qu’en mode expert', () => {
    expect(cles({ expert: false, appairable: true, jumelle: null })).not.toContain('zone.latency');
    expect(cles({ expert: false, appairable: true, jumelle: null })).not.toContain('zone.airplayPair');
    expect(cles({ expert: true, appairable: true, jumelle: null })).toContain('zone.latency');
    expect(cles({ expert: true, appairable: true, jumelle: null })).toContain('zone.airplayPair');
  });

  it('n’offre l’appairage qu’à une sortie qui le permet', () => {
    expect(cles({ expert: true, appairable: false, jumelle: null })).not.toContain('zone.airplayPair');
  });

  it('porte le nom de la jumelle, et disparaît quand il n’y en a pas', () => {
    const avec = entreesMenuZone({ expert: false, appairable: false, jumelle: 'Chambre' }, gestes());
    const fusion = avec.find((e) => e.cle === 'v2.zone.mergeInto');
    expect(fusion?.nom).toBe('Chambre');
    expect(cles({ expert: false, appairable: false, jumelle: null })).not.toContain('v2.zone.mergeInto');
  });

  it('relie chaque entrée à SON geste', () => {
    const g = gestes();
    const e = entreesMenuZone({ expert: true, appairable: true, jumelle: 'Salon' }, g);
    for (const x of e) x.faire();
    expect(g.renommer).toHaveBeenCalledOnce();
    expect(g.reglages).toHaveBeenCalledOnce();
    expect(g.latence).toHaveBeenCalledOnce();
    expect(g.appairer).toHaveBeenCalledOnce();
    expect(g.fusionner).toHaveBeenCalledOnce();
    expect(g.supprimer).toHaveBeenCalledOnce();
  });

  it('donne à chaque entrée un tracé d’icône non vide', () => {
    const e = entreesMenuZone({ expert: true, appairable: true, jumelle: 'Salon' }, gestes());
    expect(e.every((x) => typeof x.icone === 'string' && x.icone.length > 10)).toBe(true);
    expect(new Set(e.map((x) => x.icone)).size).toBe(e.length);
    expect(Object.values(ICONES_ZONE).every((d) => d.startsWith('M'))).toBe(true);
  });
});
