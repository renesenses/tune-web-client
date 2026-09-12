// 🔴 `renesenses/tune-web-client#920` — Philippe, fil 781, 25/06/2026, partant
// d'une note de version :
//
//   « Zone settings — Nouveau panneau de réglages par zone accessible via
//     appui long : DSD mode, gapless, volume fixe (web + Flutter + iOS).
//     Je n'ai vu aucun panneau de réglage qui correspond à ce choix. »
//
// LE GESTE EXISTAIT, SON CONTENU NON
// -----------------------------------
// Le clic droit sur la pastille de zone ouvre `ZoneConfigModal` depuis
// `8656fda8` (v0.8.183). Mais `git grep -i "dsd|gapless|fixed_volume"` sur ce
// fichier rendait ZÉRO : deux des trois options vivaient dans Réglages ›
// Réglages par zone, et le gapless nulle part.
//
// Deux écrans portaient donc le même nom avec des contenus disjoints. C'est
// ce qui a fait écrire Philippe, et sa phrase — « aucun panneau qui
// corresponde » — restait littéralement vraie trois mois plus tard.
//
// 🔴 LE GAPLESS N'AVAIT AUCUN ÉCRIVAIN
// `git grep gapless_enabled -- 'src/**'` rendait 0 occurrence, alors que
// `settings.perZoneHint` l'annonce dans les onze langues et que
// `SettingsView` porte le commentaire `<!-- Zone audio settings (DSD mode,
// gapless, fixed volume) -->` au-dessus d'un bloc qui n'en contient pas.
//
// MESURÉ le 12/09/2026 sur la .18 en v0.9.147 :
//   GET  /zones            → 14 zones, toutes avec gapless_enabled, dsd_mode,
//                            fixed_volume, max_sample_rate, dsd_transport
//   PATCH /zones/15 {"gapless_enabled": false} → répond la zone À JOUR
//   PATCH inverse → restaure. Le contrat tenait ; il manquait l'appelant.
//
// CONTRE-ÉPREUVE : la dernière épreuve rejoue l'état d'AVANT — un panneau sans
// aucune des trois options — et exige que le prédicat le refuse.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const panneau = () => lire('components/ZoneConfigModal.svelte');
const api = () => lire('lib/api.ts');

describe('#920 — le panneau du clic droit porte enfin ce qu’il annonçait', () => {
  it('🔴 les TROIS réglages y sont', () => {
    const src = panneau();
    for (const geste of ['setGapless', 'setDsdMode', 'setVolumeFixe']) {
      expect(src.includes(`async function ${geste}(`), `${geste} manque`).toBe(true);
    }
  });

  it('chacun passe par une route, aucun n’est décoratif', () => {
    const src = panneau();
    expect(src).toContain('api.updateZoneGapless(zone.id, enabled)');
    expect(src).toContain('api.updateZoneDsdMode(zone.id, mode)');
    expect(src).toContain('api.updateZoneFixedVolume(zone.id, enabled)');
  });

  it('🔴 `updateZoneGapless` existe — elle n’avait AUCUN écrivain', () => {
    const src = api();
    expect(src).toContain('export function updateZoneGapless(');
    expect(src).toContain("body: JSON.stringify({ gapless_enabled: enabled })");
    expect(/method: 'PATCH'/.test(src)).toBe(true);
  });

  it('les trois affichent ce que le SERVEUR répond, pas ce qu’on lui a demandé', () => {
    // Le PATCH rend la zone à jour (mesuré). Afficher la valeur demandée
    // ferait croire à un réglage que le serveur a pu refuser ou corriger.
    const src = panneau();
    expect(src).toContain('maj?.gapless_enabled ?? enabled');
    expect(src).toContain('maj?.dsd_mode ?? mode');
    expect(src).toContain('maj?.fixed_volume ?? enabled');
  });

  it('🔴 un échec REMET le contrôle où il était', () => {
    // Sans cela l'interrupteur affirme un réglage que rien n'a persisté —
    // c'est la leçon écrite sur place par `setMonoDownmix`.
    const src = panneau();
    for (const bloc of ['setGapless', 'setDsdMode', 'setVolumeFixe']) {
      const i = src.indexOf(`async function ${bloc}(`);
      const corps = src.slice(i, src.indexOf('\n  }', i));
      expect(/= avant;/.test(corps), `${bloc} ne revient pas en arrière`).toBe(true);
      expect(/catch \(e: any\)/.test(corps), `${bloc} n’attrape pas l’échec`).toBe(true);
    }
  });
});

describe('#920 — ⚠️ le volume fixe d’une zone RÉSEAU n’est pas offert ici', () => {
  it('il est réservé aux zones locales, et le dit pour les autres', () => {
    // Sur une zone réseau, activer envoie 100 % à l'appareil : un ampli part à
    // fond (Cyrille, fil 1320, réponse #21). `SettingsView` exige de TAPER 100
    // pour confirmer. Dupliquer ce dialogue ici, c'était le dupliquer mal.
    const src = panneau();
    expect(src).toContain('const zoneLocale = $derived');
    expect(src).toContain('{#if zoneLocale}');
    expect(src, 'la zone réseau n’est pas renvoyée vers l’écran qui porte la garde')
      .toContain("$t('zoneConfig.fixedVolumeNetElsewhere')");
  });

  it('le dialogue de confirmation n’est PAS recopié', () => {
    const src = panneau();
    expect(
      /fixedVolumeNetConfirm|dialogs\.prompt/.test(src),
      'la garde des 100 % est dupliquée : deux versions divergeront',
    ).toBe(false);
  });
});

describe('#920 — les deux écrans nomment la même chose pareil', () => {
  it('le sélecteur DSD reprend les libellés de Réglages', () => {
    // Deux écrans qui nomment différemment le même réglage, c'est le défaut
    // que ce lot corrige — pas un défaut à reproduire.
    const src = panneau();
    const reglages = lire('components/SettingsView.svelte');
    for (const cle of ['settings.dsdNative', 'settings.dsdPcm']) {
      expect(src.includes(cle), `${cle} absente du panneau`).toBe(true);
      expect(reglages.includes(cle), `${cle} absente de Réglages`).toBe(true);
    }
    expect(src).toContain('<option value="dop">DoP</option>');
  });

  it('CONTRE-ÉPREUVE : le panneau d’AVANT est bien refusé', () => {
    const avant = `<div class="modal-section">
      <h3>{$t('zoneConfig.monoTitle')}</h3>
    </div>`;
    for (const geste of ['setGapless', 'setDsdMode', 'setVolumeFixe']) {
      expect(avant.includes(geste), 'le témoin porte déjà les gestes').toBe(false);
    }
    expect(/dsd|gapless|fixed_volume/i.test(avant),
      'le témoin ne reproduit pas un panneau muet sur les trois').toBe(false);
  });
});
