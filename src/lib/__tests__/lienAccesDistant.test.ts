// Le lien d'accès à distance : lu sur la route réservée au propriétaire,
// vérifié avant d'être montré, et mis en QR code.
import { describe, expect, it, vi } from 'vitest';
import { chargerLienAcces, lienValide, qrSvg, ROUTE_LIEN_ACCES } from '../lienAccesDistant';

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
});
