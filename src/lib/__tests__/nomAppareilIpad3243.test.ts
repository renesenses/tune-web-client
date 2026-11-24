// #3243 (fil 2940) — un iPad était nommé « Safari · Mac ».
//
// Safari sur iPadOS (13 et plus) envoie par défaut l'agent d'un Mac :
// `Macintosh; Intel Mac OS X 10_15_7`, sans le mot « iPad ». `nomParDefaut`
// ne cherchait que `/iPad/` : l'appareil enregistré pour l'accès à distance
// portait le nom d'un ordinateur. Ce qui distingue l'iPad d'un Mac, c'est
// l'écran tactile (`navigator.maxTouchPoints` > 1 ; 0 sur un Mac).
import { describe, expect, it } from 'vitest';
import { nomParDefaut } from '../laissezPasser/cleAppareil';

const SAFARI_IPADOS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const CHROME_IPADOS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SAFARI_IPAD_ANCIEN =
  'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1';

describe('#3243 — nom proposé pour un iPad', () => {
  it('Safari sur iPadOS (agent de Mac, écran tactile) devient « Safari · iPad »', () => {
    expect(nomParDefaut(SAFARI_IPADOS, 5)).toBe('Safari · iPad');
  });

  it('même chose pour un autre navigateur en mode « site pour ordinateur »', () => {
    expect(nomParDefaut(CHROME_IPADOS, 5)).toBe('Chrome · iPad');
  });

  it('un vrai Mac (aucun point tactile) reste un Mac', () => {
    expect(nomParDefaut(SAFARI_IPADOS, 0)).toBe('Safari · Mac');
  });

  it('un iPad qui se nomme dans son agent reste un iPad', () => {
    expect(nomParDefaut(SAFARI_IPAD_ANCIEN, 0)).toBe('Safari · iPad');
  });
});
