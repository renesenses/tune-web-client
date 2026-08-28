import { describe, expect, it } from 'vitest';
import { rendererProbeErrorKey } from '../rendererProbe';

describe('renderer probe reasons', () => {
  it('ne confond pas un renderer hors ligne et un Sink vide', () => {
    expect(rendererProbeErrorKey('renderer_offline')).toBe('renderer.probeOffline');
    expect(rendererProbeErrorKey('empty_sink')).toBe('renderer.probeEmptySink');
  });

  it('distingue un echec SOAP et garde un repli neutre', () => {
    expect(rendererProbeErrorKey('soap_failed')).toBe('renderer.probeSoapFailed');
    expect(rendererProbeErrorKey('future_reason')).toBe('renderer.probeFailed');
    expect(rendererProbeErrorKey()).toBe('renderer.probeFailed');
  });
});
