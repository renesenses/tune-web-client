/**
 * « En premium : Zones autorisées est illimité !! » (Bertrand, 06/09/2026).
 *
 * L'écran Réglages annonçait « Zones autorisées : 3 » sur son serveur — un
 * serveur PREMIUM qui porte quatorze zones.
 *
 * Mesuré le même jour, `GET /cloud/license/status` sur le .18 :
 *
 *     tier       : "premium"
 *     zone_limit : null
 *
 * Le champ existe et vaut `null` : c'est ainsi que le serveur dit « pas de
 * plafond ». Le magasin lisait `status.zone_limit ?? 3` et traduisait donc
 * « illimité » par le plafond du palier GRATUIT.
 *
 * ⚠️ Purement de l'affichage. Le plafond réel est appliqué côté serveur, au
 * point d'étranglement de la lecture (`enforce_zone_cap` dans
 * `orchestrator.play()`) : rien ici ne l'assouplit, et la garde du bas le
 * vérifie en s'assurant qu'aucun écran ne DÉCIDE à partir de ce nombre.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

async function chargerAvec(status: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock('../api', () => ({ getLicenseStatus: vi.fn(async () => status) }));
  const m = await import('../stores/license');
  await m.loadLicense();
  return get(m.licenseState);
}

describe('le plafond de zones annoncé', () => {
  beforeEach(() => { vi.resetModules(); });

  it('premium + zone_limit null → ILLIMITÉ, pas 3', async () => {
    // La charge réelle du .18, copiée telle quelle.
    const s = await chargerAvec({ tier: 'premium', zone_limit: null });
    expect(s.tier).toBe('premium');
    expect(s.zoneLimit).toBeNull();
  });

  it('pro se comporte comme premium', async () => {
    expect((await chargerAvec({ tier: 'pro', zone_limit: null })).zoneLimit).toBeNull();
  });

  it('gratuit sans champ → le plafond du palier, pas illimité', async () => {
    // Le défaut SYMÉTRIQUE : accorder l'illimité par défaut à un gratuit
    // servi par un serveur ancien qui n'envoie pas le champ.
    expect((await chargerAvec({ tier: 'free' })).zoneLimit).toBe(3);
    expect((await chargerAvec({})).zoneLimit).toBe(3);
  });

  it('un plafond CHIFFRÉ est respecté, quel que soit le palier', async () => {
    // Si le serveur décide un jour d'en poser un sur un premium, on l'affiche.
    expect((await chargerAvec({ tier: 'premium', zone_limit: 10 })).zoneLimit).toBe(10);
    expect((await chargerAvec({ tier: 'free', zone_limit: 1 })).zoneLimit).toBe(1);
  });

  it('zéro reste ZÉRO : ce n’est pas « illimité »', async () => {
    // `?? ` ne confond pas 0 avec l'absence, mais `||` le ferait — et un
    // plafond de zéro est une information, pas un vide.
    expect((await chargerAvec({ tier: 'free', zone_limit: 0 })).zoneLimit).toBe(0);
  });
});

describe("l'écran le DIT au lieu d'afficher un nombre faux", () => {
  it('« Illimité » quand il n’y a pas de plafond', () => {
    const src = sansCommentaires(lire('src/components/v2/SettingsV2.svelte'));
    expect(src).toMatch(
      /lic\.zoneLimit == null \? \$t\('settings\.zonesUnlimited' as any\) : lic\.zoneLimit/,
    );
  });

  it('🔴 aucun écran ne DÉCIDE à partir de ce nombre', () => {
    // Il est d'affichage. Le plafond réel vit dans le serveur ; un client qui
    // s'en servirait pour interdire un geste réinventerait une règle qu'il ne
    // connaît qu'à moitié.
    for (const f of ['src/components/v2/SettingsV2.svelte', 'src/components/v2/ZonesV2.svelte']) {
      const src = sansCommentaires(lire(f));
      expect(src, `${f} compare zoneLimit`).not.toMatch(/zoneLimit\s*[<>]=?/);
    }
  });
});
