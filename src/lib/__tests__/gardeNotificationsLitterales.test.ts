import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Contre-épreuve de `scripts/check-notifications-litterales.mjs` : la garde
 * est lancée pour de vrai sur deux fixtures. Elle doit rougir sur les formes
 * relevées le 08/11/2026 (anglais en dur, français sans accent, gabarit avec
 * une phrase fixe) et rester verte sur ce qui est légitime.
 */
const RACINE = resolve(__dirname, '../../..');

const FAUTIF = `<script lang="ts">
  import { notifications } from '../lib/stores/notifications';
  notifications.error('Failed to load OAAT groups');
  notifications.error("Enregistrement impossible");
  notifications.error(\`Lecture impossible : \${name}\`);
  notifications.error(
    'Network error: server unreachable'
  );
</script>
`;

const PROPRE = `<script lang="ts">
  import { notifications } from '../lib/stores/notifications';
  import { t } from '../lib/i18n';
  // notifications.error('commentaire, pas un appel');
  notifications.error($t('oaat.loadError'));
  notifications.error(\`\${$t('genreTree.loadError')} : \${e?.message || e}\`);
  notifications.error(\`Last.fm : \${e?.message ?? e}\`);
  notifications.error(\`\${s.name} — \${r.validation_message}\`);
  notifications.error(res.error);
  notifications.success('Hello world');
</script>
`;

let dir = '';
function garde(sous: string) {
  return spawnSync('node', ['scripts/check-notifications-litterales.mjs'], {
    cwd: RACINE,
    env: { ...process.env, I18N_RACINE: join(dir, sous) },
    encoding: 'utf8',
  });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'garde-notif-'));
  mkdirSync(join(dir, 'fautif'));
  mkdirSync(join(dir, 'propre'));
  writeFileSync(join(dir, 'fautif', 'Fautif.svelte'), FAUTIF);
  writeFileSync(join(dir, 'propre', 'Propre.svelte'), PROPRE);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('garde : pas de littéral dans notifications.error', () => {
  it('rougit sur les quatre formes en dur et les nomme', () => {
    const r = garde('fautif');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('4 message(s)');
    expect(r.stderr).toContain('Failed to load OAAT groups');
    expect(r.stderr).toContain('Enregistrement impossible');
    expect(r.stderr).toContain('Lecture impossible');
    expect(r.stderr).toContain('Network error: server unreachable');
  });

  it('reste verte sur les formes légitimes', () => {
    const r = garde('propre');
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it("reste verte sur l'arbre du client", () => {
    const r = spawnSync('node', ['scripts/check-notifications-litterales.mjs'], { cwd: RACINE, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});
