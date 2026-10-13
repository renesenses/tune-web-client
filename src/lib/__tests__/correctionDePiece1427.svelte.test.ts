// @vitest-environment jsdom
/**
 * #1427 — une entrée VISIBLE « Correction de pièce » (go de Bertrand, 12/10).
 *
 * La correction FIR est dans Réglages ▸ Appareils ▸ Réglages par zone depuis la
 * rc2 (PR #1458), mais rien ne la nomme sur le chemin : régis (forum-hifi,
 * fil 41831, 07/10) « n'a pas trouvé comment activer la correction numérique ».
 * « Ouvrir les réglages » ne dit pas qu'elle s'y trouve, et la recherche des
 * réglages ne la connaissait pas.
 *
 * Choix : l'entrée vit dans le MENU DE LA ZONE (roue crantée de l'écran Zones,
 * liste et grille), parce qu'une réponse impulsionnelle se charge PAR zone ; un
 * bloc dans Réglages ▸ Audio demanderait un sélecteur de zone et une seconde
 * copie du réglage — exactement la divergence que raconte ZoneConfigModal.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { entreesMenuZone, type GestesZone } from '../menuZone';
import { searchSettings } from '../v2Settings';
import MenuZone from '../../components/v2/MenuZone.svelte';
import { locale, t } from '../i18n';

function gestes(): GestesZone {
  return {
    renommer: vi.fn(), image: vi.fn(), reglages: vi.fn(), correction: vi.fn(), latence: vi.fn(),
    appairer: vi.fn(), fusionner: vi.fn(), supprimer: vi.fn(),
  };
}

let hote: HTMLElement;
let composant: Record<string, any> | null = null;
beforeEach(() => {
  locale.set('fr');
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => {
  if (composant) unmount(composant);
  composant = null;
  hote.remove();
});

describe('#1427 — « Correction de pièce » au menu de la zone', () => {
  it('l’entrée est là même pour un débutant, juste après « Ouvrir les réglages »', () => {
    const cles = entreesMenuZone({ expert: false, appairable: false, jumelle: null }, gestes()).map((e) => e.cle);
    const i = cles.indexOf('v2.zone.roomCorrection');
    expect(i, 'pas d’entrée « Correction de pièce »').toBeGreaterThan(-1);
    expect(cles[i - 1]).toBe('v2.zone.openSettings');
  });

  it('le menu monté l’affiche en toutes lettres, et le clic lance SON geste', () => {
    const g = gestes();
    composant = mount(MenuZone, {
      target: hote,
      props: { entrees: entreesMenuZone({ expert: false, appairable: false, jumelle: null }, g), nom: 'Salon' },
    });
    flushSync();
    (hote.querySelector('.mz-roue') as HTMLButtonElement).click();
    flushSync();
    const item = [...hote.querySelectorAll('.mz-item')].find((b) => b.textContent?.trim() === 'Correction de pièce') as HTMLButtonElement;
    expect(item, 'libellé « Correction de pièce » absent du menu').toBeTruthy();
    item.click();
    expect(g.correction).toHaveBeenCalledOnce();
    expect(g.reglages).not.toHaveBeenCalled();
  });

  it('traduit : Room correction en anglais', () => {
    locale.set('en');
    expect(get(t)('v2.zone.roomCorrection' as any)).toBe('Room correction');
  });

  it('le geste de l’écran Zones mène au BLOC FIR de la fiche de cette zone', () => {
    const zones = readFileSync(resolve(process.cwd(), 'src/components/v2/ZonesV2.svelte'), 'utf-8');
    expect(zones).toMatch(/correction:\s*\(\)\s*=>\s*correctionDeLaZone\(z\)/);
    expect(zones).toMatch(/section: 'perZone', zone: z\.id \?\? undefined, bloc: 'fir'/);
    const reglages = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
    expect(reglages).toContain('<div id={`fir-${z.id}`}><CorrectionAcoustiqueZone zone={z} /></div>');
    expect(reglages).toMatch(/bloc === 'fir' \? document\.getElementById\(`fir-\$\{target\.zone\}`\)/);
  });
});

describe('#1427 — la recherche des réglages trouve la correction de pièce', () => {
  const resoudre = (k: string) => get(t)(k as any);
  for (const q of ['correction de pièce', 'Correction acoustique', 'correction numérique', 'room correction', 'FIR', 'convolution']) {
    it(`« ${q} » mène à Appareils ▸ Réglages par zone`, () => {
      const hits = searchSettings(q, resoudre);
      expect(hits.some((h) => h.tab.id === 'devices' && h.section.id === 'perZone'), `rien pour « ${q} »`).toBe(true);
    });
  }
});
