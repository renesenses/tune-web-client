import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afficherCanaux, correspondance, lireSaisieDeCanaux } from '../canauxDeCarte';

/**
 * tune-server-rust#6171 — choisir les canaux de la carte qu'une zone ASIO
 * utilise (Jean-François, fil 2018) : un casque sur 3-4, un multicanal non
 * consécutif.
 */
const src = fs.readFileSync(
  fileURLToPath(new URL('../../components/partages/ZoneConfigModal.svelte', import.meta.url)),
  'utf-8',
);

describe('#6171 — les canaux de la carte', () => {
  it('lit des numéros et des plages, dans l’ordre saisi', () => {
    expect(lireSaisieDeCanaux('3-4')).toEqual({ canaux: [3, 4] });
    expect(lireSaisieDeCanaux('3, 4')).toEqual({ canaux: [3, 4] });
    expect(lireSaisieDeCanaux('1-2, 5 6 3-4')).toEqual({ canaux: [1, 2, 5, 6, 3, 4] });
    expect(lireSaisieDeCanaux('17;18')).toEqual({ canaux: [17, 18] });
    expect(lireSaisieDeCanaux('  ')).toEqual({ canaux: [] });
  });

  it('refuse ce que le serveur refuserait', () => {
    expect(lireSaisieDeCanaux('a')).toEqual({ erreur: 'forme', valeur: 'a' });
    expect(lireSaisieDeCanaux('4-3')).toEqual({ erreur: 'forme', valeur: '4-3' });
    expect(lireSaisieDeCanaux('0')).toEqual({ erreur: 'borne', valeur: '0' });
    expect(lireSaisieDeCanaux('513')).toEqual({ erreur: 'borne', valeur: '513' });
    expect(lireSaisieDeCanaux('3, 3-4')).toEqual({ erreur: 'doublon', valeur: '3' });
  });

  it('affiche la correspondance piste → carte', () => {
    expect(afficherCanaux([3, 4])).toBe('3, 4');
    expect(afficherCanaux(null)).toBe('');
    expect(correspondance([3, 4])).toEqual([[1, 3], [2, 4]]);
  });

  it('zone locale seulement, et seulement si le serveur publie la route', () => {
    expect(src).toContain('{#if zoneLocale && canauxConnus}');
    expect(src).toContain('api.getZoneOutputChannels(zone.id)');
    expect(src).toContain('api.setZoneOutputChannels(zone.id, lu.canaux)');
  });

  it('les onze langues portent les libellés et les trois refus', () => {
    const dossier = fileURLToPath(new URL('../locales/', import.meta.url));
    const langues = fs.readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    expect(langues.length).toBe(11);
    for (const f of langues) {
      const texte = fs.readFileSync(dossier + f, 'utf-8');
      for (const cle of [
        'cardChannelsTitle', 'cardChannelsDesc', 'cardChannelsLabel', 'cardChannelsPlaceholder',
        'cardChannelsSave', 'cardChannelsReset', 'cardChannelsMapping', 'cardChannelsDefault',
        'cardChannelsHint', 'cardChannelsError_forme', 'cardChannelsError_borne', 'cardChannelsError_doublon',
      ]) {
        expect(texte, `${f} : zoneConfig.${cle}`).toContain(`"zoneConfig.${cle}":`);
      }
      const m = texte.match(/"zoneConfig\.cardChannelsMapping": "([^"]*)"/);
      expect(m?.[1], f).toContain('{track}');
      expect(m?.[1], f).toContain('{card}');
    }
  });
});
