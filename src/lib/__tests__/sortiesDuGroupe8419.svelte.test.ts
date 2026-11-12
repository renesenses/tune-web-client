// @vitest-environment jsdom
// tune-server-rust#8419 (fil 2215) — en lecture groupée, le chemin du signal
// dit chaque sortie du groupe et ce qu'elle reçoit (son étage final).
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SortiesDuGroupe from '../../components/partages/SortiesDuGroupe.svelte';
import { locale } from '../i18n';
import { sortiesDuGroupe, etageFinal } from '../sortiesDuGroupe';
import type { SignalPath } from '../types';

const chemin = (group_outputs?: SignalPath['group_outputs']): SignalPath => ({
  bit_perfect: true, steps: [], summary: '', group_outputs,
});
const GROUPE = {
  group_id: 4, leader_id: 1,
  outputs: [
    { zone_id: 1, name: 'SMSL SU-8', this_zone: true, leader: true, state: 'playing' as const, bit_perfect: true,
      final_stage: { name: 'Renderer', description: 'WASAPI exclusif — FLAC 96 kHz/24 bit' } },
    { zone_id: 2, name: 'TASCAM US-366', this_zone: false, leader: false, state: 'playing' as const, bit_perfect: false,
      final_stage: { name: 'Renderer', description: 'WASAPI exclusif — PCM 48 kHz/24 bit' } },
  ],
};

let host: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  host?.remove();
  host = null;
});

describe('tune-server-rust#8419 — sorties du groupe dans le chemin du signal', () => {
  it('les deux sorties et ce que reçoit la seconde', () => {
    locale.set('fr');
    host = document.createElement('div');
    document.body.appendChild(host);
    monte = mount(SortiesDuGroupe, { target: host, props: { signalPath: chemin(GROUPE) } });
    flushSync();
    const texte = host.textContent ?? '';
    expect(texte).toContain('Lecture groupée : 2 sorties');
    expect(texte).toContain('SMSL SU-8');
    expect(texte).toContain('TASCAM US-366');
    expect(texte, "l'étage final de la seconde sortie").toContain('PCM 48 kHz/24 bit');
    expect(host.querySelectorAll('[data-sortie-du-groupe]')).toHaveLength(2);
  });

  it('rien hors groupe ni face à un serveur antérieur', () => {
    expect(sortiesDuGroupe(chemin())).toEqual([]);
    expect(sortiesDuGroupe(null)).toEqual([]);
    expect(sortiesDuGroupe(chemin({ outputs: [GROUPE.outputs[0]] }))).toEqual([]);
    expect(etageFinal({ ...GROUPE.outputs[1], final_stage: null })).toBeNull();
  });

  it("l'étage final passe par la traduction des étapes du parent", () => {
    locale.set('fr');
    host = document.createElement('div');
    document.body.appendChild(host);
    monte = mount(SortiesDuGroupe, {
      target: host,
      props: { signalPath: chemin(GROUPE), libelleEtape: (e) => `«${e.description}»` },
    });
    flushSync();
    expect(host.textContent).toContain('«WASAPI exclusif — PCM 48 kHz/24 bit»');
  });
});
