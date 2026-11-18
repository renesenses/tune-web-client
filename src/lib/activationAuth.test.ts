import { describe, expect, it } from 'vitest';
import { activationPossible, cleDuRefusActivation } from './activationAuth';
import en from './locales/en';

describe('écran « Activer l’authentification »', () => {
  it('nomme chaque refus du serveur', () => {
    expect(cleDuRefusActivation({ auth_enabled: true, username: 'default', token: 'x' })).toBeNull();
    expect(cleDuRefusActivation({ error: 'activation_code_required' })).toBe('authActivation.codeRequired');
    expect(cleDuRefusActivation({ error: 'activation_code_invalid' })).toBe('authActivation.codeInvalid');
    expect(cleDuRefusActivation({ error: 'auth_already_enabled' })).toBe('authActivation.alreadyEnabled');
    expect(cleDuRefusActivation({ error: 'password_too_short' })).toBe('authActivation.passwordTooShort');
    expect(cleDuRefusActivation({ error: 'autre' })).toBe('authActivation.error');
    expect(cleDuRefusActivation(null)).toBe('authActivation.error');
  });

  it('toutes les clés de refus existent', () => {
    for (const r of [{ error: 'activation_code_required' }, { error: 'activation_code_invalid' },
      { error: 'auth_already_enabled' }, { error: 'password_too_short' }, { error: 'x' }]) {
      expect((en as Record<string, string>)[cleDuRefusActivation(r)!]).toBeTruthy();
    }
  });

  it('exige 8 caractères, la confirmation et, hors de la machine, le code', () => {
    expect(activationPossible('court', 'court', '', false)).toBe(false);
    expect(activationPossible('motdepasse', 'motdepass', '', false)).toBe(false);
    expect(activationPossible('motdepasse', 'motdepasse', '', false)).toBe(true);
    expect(activationPossible('motdepasse', 'motdepasse', ' ', true)).toBe(false);
    expect(activationPossible('motdepasse', 'motdepasse', 'ABCD-EFGH', true)).toBe(true);
  });
});
