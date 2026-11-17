import { describe, it, expect } from 'vitest';
import { zoneExistanteDuRefus } from './zoneExistante';

function refus(status: number, corps: Record<string, unknown>, message = 'msg') {
  const e = new Error(message) as any;
  e.status = status;
  e.code = corps.code;
  e.corps = corps;
  return e;
}

describe('tune-server-rust#8987 — zone existante nommée par un 409', () => {
  it('« Nouvelle zone » sur un appareil déjà pris : la zone existante', () => {
    const z = zoneExistanteDuRefus(refus(409, {
      code: 'zone_existe_deja', zone_id: 1, zone_name: 'DENAFRIPS DAC USB',
      message_key: 'api.zones.deviceAlreadyHasZone',
    }, 'Cet appareil a déjà la zone « DENAFRIPS DAC USB ».'));
    expect(z).toEqual({ id: 1, nom: 'DENAFRIPS DAC USB', message: 'Cet appareil a déjà la zone « DENAFRIPS DAC USB ».' });
  });

  it('changement d’appareil vers un appareil tenu : la zone qui le tient', () => {
    const z = zoneExistanteDuRefus(refus(409, {
      code: 'sortie_tenue_par_une_zone', zone_id: 9, holder_zone_id: 4, holder_zone_name: 'Salon',
      message_key: 'api.zones.deviceHeldByZone',
    }));
    expect(z).toEqual({ id: 4, nom: 'Salon', message: 'msg' });
  });

  it('sans phrase traduite, l’écran compose la sienne', () => {
    const z = zoneExistanteDuRefus(refus(409, { code: 'zone_existe_deja', zone_id: 2, zone_name: 'X' }));
    expect(z?.message).toBeNull();
  });

  it('tout autre échec n’est pas une zone existante', () => {
    expect(zoneExistanteDuRefus(refus(500, { code: 'zone_field_write_failed' }))).toBeNull();
    expect(zoneExistanteDuRefus(refus(409, { code: 'zone_non_supprimee' }))).toBeNull();
    expect(zoneExistanteDuRefus(refus(409, { code: 'zone_existe_deja' }))).toBeNull();
    expect(zoneExistanteDuRefus(null)).toBeNull();
    expect(zoneExistanteDuRefus(new Error('réseau'))).toBeNull();
  });
});
