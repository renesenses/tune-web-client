/**
 * #1394 — la photo d'appareil ne part pas sans que l'utilisateur ait lu où
 * elle va, et validé.
 *
 * Trois choses sont tenues ici :
 *
 * 1. la DÉCISION, en appelant le code de production (`poserPhotoAppareil`) :
 *    refuser n'envoie rien, valider envoie le fichier à la bonne zone ;
 * 2. le BRANCHEMENT : les deux chemins (roue crantée de l'écran Zones,
 *    Réglages › Appareils) passent par ce module, aucun n'appelle plus
 *    `api.uploadZoneImage` en direct — un module jamais appelé est le défaut
 *    « écrit mais pas branché » ;
 * 3. les TEXTES, dans les onze langues.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLES_AVANT_ENVOI, messageAvantEnvoi, poserPhotoAppareil } from '../photoAppareil';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const DICOS: Record<string, Record<string, string>> = {
  de, en, es, fr, hu, it: it_, ja, ko, ro, sv, zh,
} as unknown as Record<string, Record<string, string>>;

const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'] as const;
const fichier = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], 'ampli.jpg', { type: 'image/jpeg' });
const traduire = (k: string) => `«${k}»`;

describe('#1394 — poserPhotoAppareil', () => {
  it('refusé : rien ne part', async () => {
    const envoyer = vi.fn(async () => ({ image_path: 'abc' }));
    const confirmer = vi.fn(async () => false);
    const r = await poserPhotoAppareil(7, fichier(), { confirmer, traduire, envoyer });
    expect(r).toBeNull();
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('validé : le fichier part vers CETTE zone, et le retour du serveur est rendu', async () => {
    const envoyer = vi.fn(async () => ({ image_path: 'abc' }));
    const f = fichier();
    const r = await poserPhotoAppareil(7, f, { confirmer: async () => true, traduire, envoyer });
    expect(r).toEqual({ image_path: 'abc' });
    expect(envoyer).toHaveBeenCalledWith(7, f);
  });

  it('la question est posée AVANT l’envoi, pas après', async () => {
    const ordre: string[] = [];
    await poserPhotoAppareil(1, fichier(), {
      confirmer: async () => { ordre.push('question'); return true; },
      traduire,
      envoyer: async () => { ordre.push('envoi'); return { image_path: 'x' }; },
    });
    expect(ordre).toEqual(['question', 'envoi']);
  });

  it('le dialogue dit où va la photo, puis la consigne, puis la question', () => {
    expect(messageAvantEnvoi(traduire)).toBe(
      '«v2.zone.photoConsentWhere»\n\n«v2.zone.photoConsentGuide»\n\n«v2.zone.photoConsentConfirm»',
    );
  });
});

describe('#1394 — les deux chemins passent par le consentement', () => {
  const lire = (f: string) => readFileSync(resolve(__dirname, '../../components/v2', f), 'utf8');

  for (const f of ['ZonesV2.svelte', 'SettingsV2.svelte']) {
    it(`${f} n’envoie plus la photo sans passer par poserPhotoAppareil`, () => {
      const src = lire(f);
      expect(src, `${f} appelle encore uploadZoneImage en direct`).not.toMatch(/api\.uploadZoneImage\(/);
      expect(src, `${f} ne passe pas par le consentement`).toMatch(/poserPhotoAppareil\(/);
    });
  }

  it('les Réglages ne touchent pas à la zone quand l’utilisateur refuse', () => {
    const src = lire('SettingsV2.svelte');
    const i = src.indexOf('poserPhotoAppareil(zid');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).toMatch(/if \(!r\) return;/);
  });
});

describe('#1394 — les textes, dans les onze langues', () => {
  it.each(LANGUES)('%s porte les trois paragraphes, non vides', (l) => {
    const dico = DICOS[l];
    for (const k of CLES_AVANT_ENVOI) {
      expect(typeof dico[k], `${l} : ${k} manque`).toBe('string');
      expect(dico[k].trim().length, `${l} : ${k} est vide`).toBeGreaterThan(0);
    }
  });

  it('le français dit que la photo reste sur ce serveur et ne part pas chez Mozaiklabs', () => {
    expect(DICOS.fr['v2.zone.photoConsentWhere']).toMatch(/ce serveur/);
    expect(DICOS.fr['v2.zone.photoConsentWhere']).toMatch(/Mozaiklabs/);
  });
});
