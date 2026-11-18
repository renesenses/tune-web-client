/**
 * tune-server-rust#9070 (fil 2770) — un micro ouvert qui ne rend aucune trame
 * échoue en 4 s avec le code `micro_muet` : l'écran le dit dans la langue de
 * l'interface, avec le périphérique ouvert, et un conseil qui dépend du PCM
 * ouvert (pas de « choisissez hw: » quand c'est déjà hw:, ni hors ALSA). Le
 * code `micro_fige` (#9066) se traduit aussi. La liste des micros montre le
 * type d'accès ALSA à côté du nom.
 */
import { describe, expect, it } from 'vitest';
import { causeMesure, entreeMaterielleAlsa, libelleMicro } from '../correctionPiece';
import { CHARGEURS } from '../locales';
import fr from '../locales/fr';

const t = (k: string) => (fr as Record<string, string>)[k] ?? k;
const CLES = ['v2.room.errMicSilent', 'v2.room.errMicSilentChooseHw', 'v2.room.errMicSilentReport', 'v2.room.errMicFrozen'];

describe('#9070 — micro muet', () => {
  it('PCM ALSA hors hw: — conseille l’entrée matérielle de la même carte', () => {
    const c = causeMesure({ code: 'micro_muet', message: 'x', peripherique: 'alsa:dsnoop:CARD=U18dB,DEV=0' }, t)!;
    expect(c).toContain('ne renvoie aucun son');
    expect(c).toContain('alsa:dsnoop:CARD=U18dB,DEV=0');
    expect(c).toContain('hw:CARD=U18dB,DEV=0 dans la liste');
    expect(c).not.toMatch(/\{(peripherique|hw)\}/);
  });

  it('déjà en hw: — pas de conseil circulaire, le rapport de diagnostic', () => {
    const c = causeMesure({ code: 'micro_muet', peripherique: 'alsa:hw:CARD=U18dB,DEV=0' }, t)!;
    expect(c).toContain('alsa:hw:CARD=U18dB,DEV=0');
    expect(c).not.toContain('choisissez');
    expect(c).toContain('rapport de diagnostic');
  });

  it('hors ALSA (macOS, Windows) — message neutre, jamais hw:', () => {
    for (const p of ['coreaudio:BuiltInMicrophoneDevice', 'wasapi:{0.0.1}', undefined]) {
      const c = causeMesure({ code: 'micro_muet', peripherique: p }, t)!;
      expect(c, String(p)).toContain('ne renvoie aucun son');
      expect(c, String(p)).not.toContain('hw:');
      expect(c, String(p)).not.toContain('rapport de diagnostic');
    }
  });

  it('micro_fige (#9066) se traduit ; sans code, la cause du greffon reste telle quelle', () => {
    const c = causeMesure({ code: 'micro_fige', peripherique: 'alsa:hw:CARD=U18dB,DEV=0', message: 'le micro ne capte plus' }, t)!;
    expect(c).toBe('Le micro « alsa:hw:CARD=U18dB,DEV=0 » ne capte plus : débranché ou en veille ?');
    expect(causeMesure({ code: 'micro_fige', entree: 'Umik-1' }, t)).toContain('« Umik-1 »');
    expect(causeMesure({ motif: 'rapport crête/bruit de 3 dB' }, t)).toBe('rapport crête/bruit de 3 dB');
    expect(causeMesure({ code: 'inconnu', message: 'capture interrompue' }, t)).toBe('capture interrompue');
    expect(causeMesure({}, t)).toBeNull();
  });

  it('entrée matérielle ALSA', () => {
    expect(entreeMaterielleAlsa('alsa:sysdefault:CARD=U18dB')).toBe('hw:CARD=U18dB,DEV=0');
    expect(entreeMaterielleAlsa('alsa:plughw:CARD=X,DEV=1')).toBe('hw:CARD=X,DEV=1');
    expect(entreeMaterielleAlsa('alsa:pipewire')).toBeNull();
    expect(entreeMaterielleAlsa('coreaudio:X')).toBeNull();
  });

  it('les quatre clés existent dans les 16 langues, avec leurs paramètres', async () => {
    expect(Object.keys(CHARGEURS).length).toBe(16);
    for (const [langue, charger] of Object.entries(CHARGEURS)) {
      const d = (await charger()).default as Record<string, string>;
      for (const k of CLES) expect(d[k], `${langue} ${k}`).toBeTruthy();
      for (const k of CLES.slice(0, 3)) expect(d[k], `${langue} ${k}`).toContain('{peripherique}');
      expect(d['v2.room.errMicSilentChooseHw'], langue).toContain('{hw}');
      expect(d['v2.room.errMicFrozen'], langue).toContain('{micro}');
    }
  });

  it('montre le type d’accès ALSA à côté du nom, rien ailleurs', () => {
    expect(libelleMicro({ nom: 'Umik-1  Gain: 18dB, USB Audio', acces: 'hw' })).toBe('Umik-1  Gain: 18dB, USB Audio (hw)');
    expect(libelleMicro({ nom: 'Micro MacBook', acces: null })).toBe('Micro MacBook');
    expect(libelleMicro({ nom: 'Micro' })).toBe('Micro');
  });
});
