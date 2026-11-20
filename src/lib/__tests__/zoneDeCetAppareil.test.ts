// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  identifiantDeCetAppareil, nomLibre, zoneDeCetAppareil, zonesNeesIci,
} from '../zoneDeCetAppareil';
import { retenirZoneDeCetAppareil, zonesRetenues } from '../zoneNavigateurProprietaire';

const Z = [
  { id: 15, name: 'Cet ordinateur', output_type: 'browser' },
  { id: 10, name: 'Eversolo', output_type: 'dlna', output_device_id: 'uuid:x' },
];

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('zone navigateur de cet appareil', () => {
  it('crée et retient quand rien ne la désigne', async () => {
    const creer = vi.fn(async () => ({ id: 42 }));
    expect(await zoneDeCetAppareil(Z, 'Ce téléphone', creer)).toBe(42);
    expect(creer).toHaveBeenCalledWith('Ce téléphone');
    expect(zonesRetenues()).toEqual([42]);
  });

  it('reprend la zone retenue sans créer', async () => {
    retenirZoneDeCetAppareil(15);
    const creer = vi.fn();
    expect(await zoneDeCetAppareil(Z, 'Ce téléphone', creer)).toBe(15);
    expect(creer).not.toHaveBeenCalled();
  });

  it("une zone retenue disparue, ou qui n'est plus navigateur, ne compte pas", async () => {
    retenirZoneDeCetAppareil(10);
    const creer = vi.fn(async () => ({ id: 43 }));
    expect(await zoneDeCetAppareil(Z, 'Ce téléphone', creer)).toBe(43);
  });

  it("web#3314 : n'emprunte pas l'homonyme d'un autre appareil, crée « Ce téléphone (2) »", async () => {
    const creer = vi.fn(async () => ({ id: 45 }));
    const zs = [...Z, { id: 44, name: 'Ce téléphone (192.168.1.31)', output_type: 'browser' }];
    expect(await zoneDeCetAppareil(zs, 'Ce téléphone', creer)).toBe(45);
    expect(creer).toHaveBeenCalledWith('Ce téléphone (2)');
    expect(zonesRetenues()).toEqual([45]);
  });
});

describe('web#3314 — deux téléphones, un foyer', () => {
  const A = { id: 44, name: 'Ce téléphone (192.168.1.31)', output_type: 'browser' };

  it('onglet neuf sur le MÊME appareil : il reprend sa zone sans rien créer', async () => {
    const creer = vi.fn(async () => ({ id: 46 }));
    await zoneDeCetAppareil(Z, 'Ce téléphone', creer);
    const zs = [...Z, A, { id: 46, name: 'Ce téléphone (2) (192.168.1.32)', output_type: 'browser' }];
    sessionStorage.clear(); // nouvel onglet : la prise est perdue, le registre reste
    expect(zonesRetenues()).toBeNull();
    creer.mockClear();
    expect(await zoneDeCetAppareil(zs, 'Ce téléphone', creer)).toBe(46);
    expect(creer).not.toHaveBeenCalled();
    expect(zonesRetenues()).toEqual([46]);
  });

  it("la prise reste à l'onglet : rien de retenu dans localStorage", async () => {
    await zoneDeCetAppareil(Z, 'Ce téléphone', async () => ({ id: 47 }));
    expect(localStorage.getItem('tune.zonesNavigateurDeCetAppareil')).toBeNull();
    expect(sessionStorage.getItem('tune.zonesNavigateurDeCetAppareil')).toBe('[47]');
  });

  it("l'identifiant de l'appareil est tiré une fois et survit à l'onglet", () => {
    const id = identifiantDeCetAppareil();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    sessionStorage.clear();
    expect(identifiantDeCetAppareil()).toBe(id);
    localStorage.clear();
    expect(identifiantDeCetAppareil()).not.toBe(id);
  });

  it('une zone née ici puis supprimée ne compte plus : on en recrée une', async () => {
    await zoneDeCetAppareil(Z, 'Ce téléphone', async () => ({ id: 48 }));
    sessionStorage.clear();
    const creer = vi.fn(async () => ({ id: 49 }));
    expect(await zoneDeCetAppareil([...Z, A], 'Ce téléphone', creer)).toBe(49);
    expect(zonesNeesIci()).toEqual([48, 49]);
  });

  it('nomLibre : le premier numéro libre, suffixe d\'IP du serveur compris', () => {
    expect(nomLibre(Z, 'Ce téléphone')).toBe('Ce téléphone');
    expect(nomLibre([A], 'Ce téléphone')).toBe('Ce téléphone (2)');
    expect(nomLibre([A, { name: 'Ce téléphone (2) (10.0.0.4)' }], 'Ce téléphone')).toBe('Ce téléphone (3)');
    expect(nomLibre([{ name: 'Ce téléphone' }, { name: 'Ce téléphone (3)' }], 'Ce téléphone')).toBe('Ce téléphone (2)');
  });
});
