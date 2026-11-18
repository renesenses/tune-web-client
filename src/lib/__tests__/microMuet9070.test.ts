/**
 * tune-server-rust#9070 (fil 2770) — un micro ouvert qui ne rend aucune trame
 * échoue en 2 s avec le code `micro_muet` : l'écran le dit dans la langue de
 * l'interface, avec le périphérique ouvert. Et la liste des micros montre le
 * type d'accès ALSA à côté du nom.
 */
import { describe, expect, it } from 'vitest';
import { causeMesure, libelleMicro } from '../correctionPiece';
import { CHARGEURS } from '../locales';
import fr from '../locales/fr';

const t = (k: string) => (fr as Record<string, string>)[k] ?? k;

describe('#9070 — micro muet', () => {
  it('traduit le code micro_muet et nomme le périphérique ouvert', () => {
    const c = causeMesure(
      { code: 'micro_muet', message: 'le micro « Umik-1 » ne renvoie aucun son', peripherique: 'alsa:dsnoop:CARD=U18dB,DEV=0' },
      t,
    );
    expect(c).toContain('ne renvoie aucun son');
    expect(c).toContain('alsa:dsnoop:CARD=U18dB,DEV=0');
    expect(c).not.toContain('{peripherique}');
    expect(c).not.toBe('v2.room.errMicSilent');
  });

  it('sans code, la cause du greffon reste telle quelle', () => {
    expect(causeMesure({ motif: 'rapport crête/bruit de 3 dB' }, t)).toBe('rapport crête/bruit de 3 dB');
    expect(causeMesure({ message: 'capture interrompue' }, t)).toBe('capture interrompue');
    expect(causeMesure({}, t)).toBeNull();
  });

  it('la clé existe dans les 16 langues, avec son paramètre', async () => {
    expect(Object.keys(CHARGEURS).length).toBe(16);
    for (const [langue, charger] of Object.entries(CHARGEURS)) {
      const s = ((await charger()).default as Record<string, string>)['v2.room.errMicSilent'];
      expect(s, langue).toBeTruthy();
      expect(s, langue).toContain('{peripherique}');
    }
  });

  it('montre le type d’accès ALSA à côté du nom, rien ailleurs', () => {
    expect(libelleMicro({ nom: 'Umik-1  Gain: 18dB, USB Audio', acces: 'hw' })).toBe('Umik-1  Gain: 18dB, USB Audio (hw)');
    expect(libelleMicro({ nom: 'Micro MacBook', acces: null })).toBe('Micro MacBook');
    expect(libelleMicro({ nom: 'Micro' })).toBe('Micro');
  });
});
