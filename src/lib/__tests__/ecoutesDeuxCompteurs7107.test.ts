/**
 * #7107 — la colonne ÉCOUTES des titres phares montre les DEUX compteurs :
 * le total de la communauté et les écoutes de ce serveur (locales et du
 * service). Kiwanuka, 26/10/2026 : Qobuz rend les pistes de FUDGE, seules
 * deux portaient un total, et les écoutes du serveur ne s'affichaient pas.
 */
import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { cleInfobulleColonne, ecoutesDeuxCompteurs, valeurColonne } from '../colonnesPistes';
import { locale, t } from '../i18n';
import type { Track } from '../types';

const AVEC_LES_DEUX = { title: 'Summer Clothes', play_count: 7, play_count_scope: 'community', local_play_count: 4 } as unknown as Track;
const LOCAL_SEUL = { title: 'Just Another Moment', local_play_count: 2 } as unknown as Track;
const COMMUNAUTE_SEULE = { title: 'Stars', play_count: 12, play_count_scope: 'community' } as unknown as Track;
const AUCUN = { title: 'Steve\'s Paradise' } as unknown as Track;
const BIBLIOTHEQUE = { id: 7, title: 'So What', play_count: 4 } as unknown as Track;

describe('#7107 — deux compteurs dans la colonne ÉCOUTES', () => {
  it('communauté et vous, côte à côte', () => {
    expect(valeurColonne(AVEC_LES_DEUX, 'plays')).toBe('7 · 4');
  });

  it('écoutes du serveur sans total de la communauté : un tiret à gauche', () => {
    expect(valeurColonne(LOCAL_SEUL, 'plays')).toBe('– · 2');
  });

  it('total sans écoute locale : zéro à droite', () => {
    expect(valeurColonne(COMMUNAUTE_SEULE, 'plays')).toBe('12 · 0');
  });

  it('un titre sans aucun compteur reste vide, une piste de bibliothèque garde son nombre seul', () => {
    expect(ecoutesDeuxCompteurs(AUCUN)).toBeNull();
    expect(valeurColonne(AUCUN, 'plays')).toBeNull();
    expect(valeurColonne(BIBLIOTHEQUE, 'plays')).toBe('4');
    expect(cleInfobulleColonne(BIBLIOTHEQUE, 'plays')).toBeNull();
  });

  it('l\'infobulle dit lequel est lequel, dans les 15 langues', () => {
    expect(cleInfobulleColonne(LOCAL_SEUL, 'plays')).toBe('v2.tcol.playsCommunity');
    const vus = new Set<string>();
    for (const l of ['fr', 'en', 'de', 'es', 'el', 'it', 'hu', 'ro', 'nb', 'ja', 'ko', 'zh', 'pl', 'vi', 'sv'] as const) {
      locale.set(l as never);
      const texte = String(get(t)('v2.tcol.playsCommunity' as never));
      expect(texte, l).not.toBe('v2.tcol.playsCommunity');
      expect(texte, l).toMatch(/Tune/);
      vus.add(texte);
    }
    expect(vus.size, 'une traduction par langue').toBe(15);
    locale.set('fr' as never);
  });
});
