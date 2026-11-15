import { describe, expect, it } from 'vitest';
import { motsDuTexte, pisteRepondAuTexteLibre } from '../texteLibreOxygen';
import type { Track } from '../types';

/**
 * tune-server-rust#7619 — décision de Bertrand du 01/11/2026 : la recherche
 * trouve par DÉBUT DE MOT. Le filtre de la fenêtre chargée d'Oxygen suit le
 * serveur (`condition_texte_libre`) : chaque mot de la saisie commence un mot
 * de l'un des champs, le milieu d'un mot ne trouve plus rien.
 */
const piste = (champs: Partial<Track>): Track => ({ id: 1, title: '', ...champs });

describe('texte libre d\'Oxygen en début de mot (#7619)', () => {
  it('chaque mot est un début de mot, dans n\'importe quel champ', () => {
    const p = piste({ title: 'Symphonie n° 3', artist_name: 'Gustav Mahler', label: 'Deutsche Grammophon' });
    expect(pisteRepondAuTexteLibre(p, 'mahl')).toBe(true);
    expect(pisteRepondAuTexteLibre(p, 'mahl symph')).toBe(true);
    expect(pisteRepondAuTexteLibre(p, 'GRAMMO')).toBe(true);
    expect(pisteRepondAuTexteLibre(p, 'mahler 3')).toBe(true);
  });

  it('le milieu d\'un mot ne trouve plus rien', () => {
    const p = piste({ title: 'Come Together', artist_name: 'The Beatles', label: 'Parlophone' });
    for (const q of ['eatles', 'ogether', 'arlo', 'eat']) {
      expect(pisteRepondAuTexteLibre(p, q), q).toBe(false);
    }
    expect(pisteRepondAuTexteLibre(p, 'beat')).toBe(true);
  });

  it('chaque mot doit être trouvé (ET entre les mots)', () => {
    const p = piste({ title: 'So What', artist_name: 'Miles Davis' });
    expect(pisteRepondAuTexteLibre(p, 'mil dav')).toBe(true);
    expect(pisteRepondAuTexteLibre(p, 'mil coltrane')).toBe(false);
  });

  it('accents, casse et ponctuation : comme l\'index du serveur', () => {
    const p = piste({ artist_name: 'AC/DC', composer: 'Antonín Dvořák', album_title: 'Re:member' });
    expect(pisteRepondAuTexteLibre(p, 'dvorak')).toBe(true);
    expect(pisteRepondAuTexteLibre(p, 'ac dc')).toBe(true);
    expect(pisteRepondAuTexteLibre(p, 'member')).toBe(true);
    expect(pisteRepondAuTexteLibre(p, 'orak')).toBe(false);
    expect(motsDuTexte('  Saint-Saëns, « Danse »!')).toEqual(['saint', 'saens', 'danse']);
  });
});
