import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { texteMedaillonFile, libelleBoutonFile } from '../medaillonFile';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

/**
 * web#2389 — FabienM (fil 2431) : le nombre de titres de la file en médaillon
 * sur le bouton file d'attente de la barre de lecture, comme sur Android.
 */
const BARRE = readFileSync(resolve(__dirname, '../../components/partages/TransportBar.svelte'), 'utf8');
const fr = dictionnaire('fr');
const tFr = (k: string) => fr[k] ?? k;

describe('web#2389 — médaillon du bouton file d’attente', () => {
  it('file vide : pas de médaillon', () => {
    expect(texteMedaillonFile(0)).toBeNull();
    expect(texteMedaillonFile(-1)).toBeNull();
    expect(texteMedaillonFile(Number.NaN)).toBeNull();
  });

  it('porte la longueur de la file, plafonnée à 99+', () => {
    expect(texteMedaillonFile(1)).toBe('1');
    expect(texteMedaillonFile(59)).toBe('59');
    expect(texteMedaillonFile(99)).toBe('99');
    expect(texteMedaillonFile(100)).toBe('99+');
  });

  it('l’infobulle dit le nombre de titres (singulier, pluriel, vide)', () => {
    expect(libelleBoutonFile(tFr, 0)).toBe("File d'attente");
    expect(libelleBoutonFile(tFr, 1)).toBe("File d'attente · 1 titre");
    expect(libelleBoutonFile(tFr, 59)).toBe("File d'attente · 59 titres");
  });

  it('les libellés existent dans toutes les langues du client, avec leur nombre', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      expect(d['transport.queueCountN'], `${l} queueCountN`).toContain('plural,');
      expect(libelleBoutonFile((k) => d[k] ?? k, 59, l)).toContain('59');
    }
  });

  it('la barre dessine le médaillon depuis la longueur de la file', () => {
    expect(BARRE).toContain("import { texteMedaillonFile, libelleBoutonFile } from '../../lib/medaillonFile';");
    expect(BARRE).toContain('{#if texteMedaillonFile($queueTracks.length)}');
    expect(BARRE).toContain('<span class="queue-badge" aria-hidden="true">{texteMedaillonFile($queueTracks.length)}</span>');
    expect(BARRE).toContain('title={libelleBoutonFile($t, $queueTracks.length, $locale)}');
    // Le commentaire de #919 ne prétend plus que le nombre est « en infobulle, pas dessiné ».
    expect(BARRE).not.toContain('Le nombre de titres à suivre est en infobulle, pas dessiné');
  });
});
