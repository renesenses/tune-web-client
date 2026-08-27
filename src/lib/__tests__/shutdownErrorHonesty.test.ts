import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { errText } from '../utils';

const settings = readFileSync(
  resolve(__dirname, '../../components/SettingsView.svelte'),
  'utf-8',
);

function shutdownHandler(): string {
  const start = settings.indexOf('async function eteindreLaMachine()');
  const end = settings.indexOf('// Restart the server', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return settings.slice(start, end);
}

describe('extinction Tune OS honnête (#2187)', () => {
  it('un refus HTTP réarme le bouton et affiche la cause', () => {
    const handler = shutdownHandler();
    const classify = handler.indexOf('const msg = errText(e)');
    const rearm = handler.indexOf('extinctionEnCours = false', classify);
    const notify = handler.indexOf('notifications.error(msg)', rearm);

    expect(classify).toBeGreaterThanOrEqual(0);
    expect(rearm).toBeGreaterThan(classify);
    expect(notify).toBeGreaterThan(rearm);
    expect(errText(new Error('404'))).toBe('404');
    expect(errText(new Error('systemctl: permission denied'))).toBe(
      'systemctl: permission denied',
    );
  });

  it('une coupure de transport reste compatible avec une machine déjà éteinte', () => {
    const handler = shutdownHandler();
    expect(handler).toContain('if (msg !== null)');
    expect(errText(new TypeError('Failed to fetch'))).toBeNull();
    expect(errText(new TypeError('Load failed'))).toBeNull();
    expect(errText(new TypeError('NetworkError when attempting to fetch resource.'))).toBeNull();
  });
});
