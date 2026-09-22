/**
 * #1427 — « Il y a une raison particulière a la disparition de la prise en
 * compte des fichiers FIR (wav) dans les paramètres de la zone ? » (GgB,
 * fil 1671, 21/09/2026).
 *
 * Le bloc de correction acoustique n'a jamais été porté dans la nouvelle
 * interface : il ne vivait que dans `ZoneConfigModal`, ouvert par un CLIC
 * DROIT sur la pastille de zone de la barre de lecture — un geste qui n'est
 * annoncé nulle part et qui n'a aucun équivalent tactile. Les deux écrans qui
 * s'appellent « les réglages de la zone » — l'écran Zones, et
 * Réglages ▸ Appareils ▸ Réglages par zone, où mène « Ouvrir les réglages » —
 * n'en portaient rien.
 *
 * Arbitrage de Bertrand du 22/09/2026 : porter le réglage dans
 * Réglages ▸ Appareils ▸ Réglages par zone, là où le testeur le cherche, et
 * garder le chemin existant puisqu'il ne coûte rien.
 *
 * 🔴 Une SECONDE copie du bloc aurait divergé : c'est exactement ce que le
 * commentaire de `ZoneConfigModal` raconte de la condition `output_type ===
 * 'local'` restée d'un côté et corrigée de l'autre. Le bloc devient donc un
 * composant partagé, monté par les deux écrans.
 *
 * ⚠️ Ce ticket ne dit RIEN de ce que GgB a perdu : il n'a jamais précisé s'il
 * avait perdu l'ACCÈS au réglage ou le SON de sa correction. Rien ici ne
 * prétend répondre à la seconde lecture.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (/\.(svelte|ts)$/.test(p) && !p.includes('__tests__')) acc.push(p);
  }
  return acc;
}

const PARTAGE = 'src/components/partages/CorrectionAcoustiqueZone.svelte';

describe('#1427 — la correction acoustique est dans Réglages ▸ Appareils ▸ Par zone', () => {
  it('🔴 le bloc « Par zone » monte le composant de correction acoustique', () => {
    const src = sansCommentaires(lire('src/components/v2/SettingsV2.svelte'));
    expect(src).toContain("import CorrectionAcoustiqueZone from '../partages/CorrectionAcoustiqueZone.svelte';");
    // Monté DANS la carte de zone, donc avec la zone de la boucle.
    expect(src).toMatch(/<CorrectionAcoustiqueZone zone=\{z\}[^>]*\/>/);
    // Et bien dans la section `perZone`, pas ailleurs dans l'écran.
    const debut = src.indexOf("{:else if s.id === 'perZone'}");
    const fin = src.indexOf("{:else if s.id === 'clap'}", debut);
    expect(debut, 'la section « Par zone » a disparu').toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(debut);
    expect(src.slice(debut, fin)).toContain('<CorrectionAcoustiqueZone');
  });

  it('🔴 UNE seule implémentation : les deux écrans montent le MÊME composant', () => {
    const modal = sansCommentaires(lire('src/components/partages/ZoneConfigModal.svelte'));
    expect(modal).toContain("import CorrectionAcoustiqueZone from './CorrectionAcoustiqueZone.svelte';");
    expect(modal).toContain('<CorrectionAcoustiqueZone');
    // Les routes du serveur ne sont appelées QUE depuis le composant partagé.
    const appels = fichiers(resolve(process.cwd(), 'src'))
      .filter((p) => /room-correction\/ir\//.test(readFileSync(p, 'utf-8')))
      .map((p) => p.slice(p.indexOf('src/')));
    expect(appels).toEqual([PARTAGE]);
  });

  it('le composant partagé porte bien tout le bloc, et sur TOUTE zone', () => {
    const src = lire(PARTAGE);
    // Titre, description, chargement, remplacement, désactivation, courbe.
    for (const cle of ['zoneConfig.firTitle', 'zoneConfig.firDesc', 'zoneConfig.loadIrFile',
      'zoneConfig.firActive', 'zoneConfig.replace', 'zoneConfig.disable']) {
      expect(src, `${cle} absente du composant partagé`).toContain(cle);
    }
    expect(src).toContain('<FirResponseCurve');
    // 🔴 Aucune condition sur le type de sortie : la leçon d'Alexander Jam.
    // Le serveur applique l'IR aux lecteurs réseau aussi (`zone_has_active_ir`
    // force le transcodage « so the FIR reaches network renderers »).
    expect(sansCommentaires(src)).not.toContain("output_type");
    // Le refus Premium reste traduit : cette route est gardée côté serveur et
    // ne passe pas par `lib/api.ts` (envoi en octets bruts) — #884.
    expect(src).toContain('messageRefusPremium(');
    expect(src).toContain('res.status === 402');
  });

  it('le chemin existant n’est pas retiré : le clic droit ouvre toujours le panneau', () => {
    // Il ne coûte rien et dépanne qui le connaît. Il reste tout aussi peu
    // découvrable — ce n'est pas lui qu'on corrige.
    const tb = sansCommentaires(lire('src/components/partages/TransportBar.svelte'));
    expect(tb).toContain('oncontextmenu=');
    expect(tb).toContain('configZone = zone');
  });
});
