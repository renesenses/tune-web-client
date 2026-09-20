import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { niveauApresAlerte, niveauDeLaSonde } from '../santeServeur';

describe('niveauApresAlerte — une alerte ne fait jamais redescendre', () => {
  it('critical l’emporte toujours', () => {
    expect(niveauApresAlerte('ok', 'critical')).toBe('critical');
    expect(niveauApresAlerte('warning', 'critical')).toBe('critical');
  });
  it('🔴 un warning ne fait pas redescendre un critical', () => {
    expect(niveauApresAlerte('critical', 'warning')).toBe('critical');
  });
  it('un warning élève un ok', () => {
    expect(niveauApresAlerte('ok', 'warning')).toBe('warning');
  });
  it('un niveau inconnu ne change rien', () => {
    expect(niveauApresAlerte('warning', 'info')).toBe('warning');
    expect(niveauApresAlerte('ok', undefined)).toBe('ok');
  });
});

describe('niveauDeLaSonde', () => {
  it('ramène tout statut inconnu à ok', () => {
    expect(niveauDeLaSonde('critical')).toBe('critical');
    expect(niveauDeLaSonde('warning')).toBe('warning');
    expect(niveauDeLaSonde('degraded?')).toBe('ok');
    expect(niveauDeLaSonde(null)).toBe('ok');
  });
});

describe('branchement dans la coquille v2', () => {
  const live = readFileSync('src/lib/v2Live.ts', 'utf8');
  const barre = readFileSync('src/components/v2/Sidebar.svelte', 'utf8');

  it('l’événement system.health_alert passe par la règle, et se dit', () => {
    const i = live.indexOf("type === 'system.health_alert'");
    expect(i, 'l’alerte de santé n’est pas écoutée').toBeGreaterThan(-1);
    const bloc = live.slice(i, live.indexOf('return;', i));
    expect(bloc).toContain('niveauApresAlerte(');
    expect(bloc).toMatch(/notifications\.error\(/);
  });

  it('la barre sonde le moniteur, et montre la pastille hors de « ok »', () => {
    expect(barre).toContain('api.getHealthMonitor()');
    expect(barre).toMatch(/setInterval\(sonderSante, 60_000\)/);
    expect(barre).toMatch(/\{#if \$healthStatus !== 'ok'\}/);
  });
});
