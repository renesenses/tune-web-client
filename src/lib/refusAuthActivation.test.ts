import { describe, expect, it } from 'vitest';
import { motifRefusAuth, phraseRefusAuth, CIBLE_ACTIVATION_AUTH } from './refusAuthActivation';

const refus = (reason: string, status = 403) => ({ status, corps: { error: 'auth_required', reason } });

describe('refus « depuis cette machine seulement »', () => {
  it('reconnaît not_local et port80_relay, rien d’autre', () => {
    expect(motifRefusAuth(refus('not_local'))).toBe('not_local');
    expect(motifRefusAuth(refus('port80_relay'))).toBe('port80_relay');
    expect(motifRefusAuth(refus('not_local', 401))).toBeNull();
    expect(motifRefusAuth(refus('autre'))).toBeNull();
    expect(motifRefusAuth({ status: 403, corps: { error: 'admin role required' } })).toBeNull();
    expect(motifRefusAuth(null)).toBeNull();
  });

  it('préfère la phrase traduite, sinon le texte du serveur', () => {
    const connue = (cle: string) => (cle === 'machineAction.notLocal' ? 'Phrase traduite' : cle);
    const inconnue = (cle: string) => cle;
    expect(phraseRefusAuth('not_local', 'server text', connue)).toBe('Phrase traduite');
    expect(phraseRefusAuth('not_local', 'server text', inconnue)).toBe('server text');
    expect(phraseRefusAuth('port80_relay', 'server text', inconnue)).toBe('server text');
  });

  it('le bouton mène à Réglages ▸ Système ▸ Authentification', () => {
    expect(CIBLE_ACTIVATION_AUTH).toEqual({ tab: 'system', section: 'authActivation' });
  });
});
