// Le lien d'accès à distance : lu sur la route réservée au propriétaire,
// vérifié avant d'être montré, et mis en QR code.
import { describe, expect, it, vi } from 'vitest';
import {
  chargerLienAcces,
  lienValide,
  qrSvg,
  renouvelerLienAcces,
  ROUTE_LIEN_ACCES,
  ROUTE_RENOUVELER_LIEN,
} from '../lienAccesDistant';

const SID = '75f24b9e-0000-4000-8000-000000000001';
const LIEN = `https://bridge.mozaiklabs.fr/${SID}/#token=FAUX-jeton-1`;

describe('lien d’accès à distance', () => {
  it('lit la route réservée, pas le statut public', async () => {
    const f = vi.fn(async () => ({ link: LIEN }));
    expect(await chargerLienAcces(f)).toBe(LIEN);
    expect(f).toHaveBeenCalledWith(ROUTE_LIEN_ACCES);
    expect(ROUTE_LIEN_ACCES).toBe('/cloud/bridge/access-link');
  });

  it('rend null sur un refus (409, 403, route absente)', async () => {
    const f = vi.fn(async () => {
      throw Object.assign(new Error('409'), { status: 409 });
    });
    expect(await chargerLienAcces(f)).toBeNull();
  });

  it('refuse un lien qui ne mène pas au pont ou sans jeton', () => {
    expect(lienValide(LIEN)).toBe(LIEN);
    expect(lienValide(`https://ailleurs.example/${SID}/#token=x`)).toBeNull();
    expect(lienValide(`https://bridge.mozaiklabs.fr/${SID}/`)).toBeNull();
    expect(lienValide(`https://bridge.mozaiklabs.fr/${SID}/#token=`)).toBeNull();
    expect(lienValide(42)).toBeNull();
  });

  it('fabrique un QR code SVG propre au lien', () => {
    const a = qrSvg(LIEN);
    const b = qrSvg(LIEN.replace('jeton-1', 'jeton-2'));
    expect(a.startsWith('<svg')).toBe(true);
    expect(a).not.toContain('<script');
    expect(a).not.toBe(b);
    // Le lien lui-même n'est pas recopié en clair dans le dessin.
    expect(a).not.toContain('FAUX-jeton-1');
  });

  it('renouvelle par la route réservée et rend le nouveau lien', async () => {
    const nouveau = `https://bridge.mozaiklabs.fr/${SID}/#token=FAUX-jeton-2`;
    const f = vi.fn(async () => ({ link: nouveau, server_id: SID }));
    expect(await renouvelerLienAcces(f)).toBe(nouveau);
    expect(f).toHaveBeenCalledWith(ROUTE_RENOUVELER_LIEN);
    expect(ROUTE_RENOUVELER_LIEN).toBe('/cloud/bridge/rotate-token');
  });

  it('un renouvellement refusé ou illisible n’est pas tu', async () => {
    const refus = Object.assign(new Error('admin role required'), { status: 403 });
    await expect(
      renouvelerLienAcces(async () => {
        throw refus;
      }),
    ).rejects.toBe(refus);
    await expect(
      renouvelerLienAcces(async () => ({ link: `https://ailleurs.example/${SID}/#token=x` })),
    ).rejects.toThrow();
    await expect(renouvelerLienAcces(async () => null)).rejects.toThrow();
  });
});
