// tune-server-rust#8694 — Qobuz (périphérie Akamai) refuse le RÉSEAU de
// l'utilisateur : l'écran le dit, au lieu de « connexion impossible » ou
// « mot de passe incorrect ».
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CODE_RESEAU_REFUSE, natureErreurConnexion } from '../erreurConnexionService';

const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl'];

describe('tune-server-rust#8694 réseau refusé par le service', () => {
  it('service_network_refused est un refus de réseau, ni mot de passe ni application', () => {
    expect(CODE_RESEAU_REFUSE).toBe('service_network_refused');
    const e = {
      code: 'service_network_refused',
      message: "qobuz login: Qobuz refuses connections from this network (VPN, country…); your password is not the cause",
    };
    expect(natureErreurConnexion(e)).toBe('reseau');
  });

  it('les 15 langues portent la phrase, avec {service}', () => {
    for (const l of LANGUES) {
      const s = readFileSync(resolve(__dirname, `../locales/${l}.ts`), 'utf8');
      expect(s.match(/"settings\.errNetworkRefused": ".*\{service\}.*VPN/), l).toBeTruthy();
    }
  });

  it('les deux écrans de connexion affichent la phrase pour ce code', () => {
    for (const f of ['../../components/v2/SettingsV2.svelte', '../../components/partages/OnboardingWizard.svelte']) {
      const s = readFileSync(resolve(__dirname, f), 'utf8');
      expect(s, f).toMatch(/nature === 'reseau'\s*\n\s*\? get\(t\)\('settings\.errNetworkRefused'/);
    }
  });
});
