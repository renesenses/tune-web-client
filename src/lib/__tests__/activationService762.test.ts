/**
 * #762 — dans le nouveau client, AUCUN geste ne permettait d'activer un
 * service de streaming.
 *
 * La fonction existait dans `api.ts` et n'était appelée que par l'ancien écran
 * et l'assistant de première configuration. Un service arrivé désactivé —
 * Bandcamp — le restait à vie. Et l'impasse était complète : le bouton
 * « Se connecter » est lui-même désarmé quand `enabled` est faux
 * (`disabled={svcBusy === name || !st.enabled}`).
 *
 * Le défaut n'est pas dans une règle mais dans un CÂBLAGE : il n'y a rien à
 * calculer, seulement un appel qui n'était fait nulle part. La garde vérifie
 * donc que l'appel existe, et qu'il est atteignable.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import * as api from '../api';

const ECRAN = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');

describe('L’activation d’un service dans le nouveau client', () => {
  it('les deux fonctions existent côté client', () => {
    expect(typeof api.enableStreamingService).toBe('function');
    expect(typeof api.disableStreamingService).toBe('function');
  });

  it('🔴 le nouvel écran de réglages les APPELLE', () => {
    expect(ECRAN).toContain('api.enableStreamingService(name)');
    expect(ECRAN).toContain('api.disableStreamingService(name)');
  });

  it('🔴 et le geste est atteignable depuis le balisage', () => {
    // Un appel présent dans le script mais qu'aucun élément ne déclenche
    // serait exactement le même défaut, déplacé de dix lignes.
    expect(ECRAN).toMatch(/onchange=\{\(e\) => basculerSvc\(name,/);
  });

  it('🔴 la case reflète `enabled`, pas `authenticated`', () => {
    // Les deux sont indépendants : sur le .18, Bandcamp était
    // `enabled=false, authenticated=true`. Lire le mauvais champ afficherait
    // une case cochée sur un service inactif.
    expect(ECRAN).toContain('checked={!!st.enabled}');
  });

  it('l’état revient en arrière si le serveur refuse', () => {
    // Sinon l'écran garde une case cochée pour un service qui ne l'est pas —
    // et l'utilisateur croit avoir agi.
    const bloc = ECRAN.slice(
      ECRAN.indexOf('async function basculerSvc'),
      ECRAN.indexOf('async function disconnectSvc'),
    );
    expect(bloc).toContain('const avant = svcs[name]?.enabled');
    expect(bloc).toMatch(/catch\s*\{[\s\S]*enabled: avant/);
  });
});
