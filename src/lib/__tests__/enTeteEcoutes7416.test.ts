/**
 * tune-server-rust#7416 — l'EN-TÊTE de la colonne ÉCOUTES dit l'ordre des
 * deux nombres (« Tous · moi ») dès qu'une piste de la liste porte les deux
 * compteurs des titres phares ; ailleurs il garde « Écoutes ».
 */
import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { cleEnTeteColonne } from '../colonnesPistes';
import { locale, t } from '../i18n';
import type { Track } from '../types';

const PLAYS = { cle: 'plays', cleI18n: 'v2.tcol.plays' } as const;
const TITRE = { cle: 'title', cleI18n: 'v2.tcol.title' } as const;
const TITRE_PHARE = { title: 'Love & Hate', play_count: 112, play_count_scope: 'community', local_play_count: 107 } as unknown as Track;
const LOCAL_SEUL = { title: 'Home Again', local_play_count: 25 } as unknown as Track;
const BIBLIOTHEQUE = { id: 7, title: 'So What', play_count: 4 } as unknown as Track;

describe('#7416 — légende d\'en-tête de la colonne ÉCOUTES', () => {
  it('titres phares : l\'en-tête dit « tous · moi »', () => {
    expect(cleEnTeteColonne(PLAYS, [BIBLIOTHEQUE, TITRE_PHARE])).toBe('v2.tcol.playsTwoCounters');
    expect(cleEnTeteColonne(PLAYS, [LOCAL_SEUL])).toBe('v2.tcol.playsTwoCounters');
  });

  it('liste de la bibliothèque ou autre colonne : rien ne change', () => {
    expect(cleEnTeteColonne(PLAYS, [BIBLIOTHEQUE])).toBe('v2.tcol.plays');
    expect(cleEnTeteColonne(PLAYS, [])).toBe('v2.tcol.plays');
    expect(cleEnTeteColonne(TITRE, [TITRE_PHARE])).toBe('v2.tcol.title');
  });

  it('le libellé existe dans les 15 langues', () => {
    const vus = new Set<string>();
    for (const l of ['fr', 'en', 'de', 'es', 'el', 'it', 'hu', 'ro', 'nb', 'ja', 'ko', 'zh', 'pl', 'vi', 'sv'] as const) {
      locale.set(l as never);
      const texte = String(get(t)('v2.tcol.playsTwoCounters' as never));
      expect(texte, l).not.toBe('v2.tcol.playsTwoCounters');
      vus.add(texte);
    }
    expect(vus.size, 'une traduction par langue').toBe(15);
    locale.set('fr' as never);
  });
});
