import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * tune-server-rust#6774 — une zone qui passe sur un AUTRE appareil voit le
 * serveur désarmer PURE verrouillé et le volume fixe. L'interface doit le
 * refléter sans attendre un changement de zone ou un rechargement.
 */
const transport = readFileSync(
  resolve(__dirname, '../../components/partages/TransportBar.svelte'),
  'utf-8',
);
const zones = readFileSync(resolve(__dirname, '../../components/v2/ZonesV2.svelte'), 'utf-8');

describe('PURE et volume fixe relus au changement d’appareil (#6774)', () => {
  it('l’état PURE est relu quand l’appareil de la zone courante change', () => {
    expect(transport).toMatch(
      /const appareilDeLaZone = \$derived\(zone\?\.output_device_id \?\? null\);/,
    );
    const effet = transport.match(/\$effect\(\(\) => \{\s*void appareilDeLaZone;\s*void refreshAudiophile\(\$currentZoneId\);\s*\}\);/);
    expect(
      effet,
      '#6774 : l’effet qui relit PURE doit dépendre de l’appareil de la zone, sinon le bouclier reste armé après le changement d’appareil',
    ).not.toBeNull();
  });

  it('le changement de sortie reprend la zone RENDUE par le serveur (volume fixe désarmé)', () => {
    const debut = zones.indexOf('async function changerSortie(');
    const fin = zones.indexOf('finally', debut);
    expect(debut).toBeGreaterThanOrEqual(0);
    const corps = zones.slice(debut, fin);
    expect(corps).toContain('const maj = await api.changeZoneOutput(');
    expect(corps).toContain('zones.update((zs) => zs.map((x) => (x.id === zid ? maj : x)));');
  });
});
