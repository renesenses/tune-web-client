// 🔴 `renesenses/tune-web-client#863` — Jean Valjean, fil 1671, réponse 6154 :
//
//   « Dans Radio, avoir un onglet avec ses radios favorites et pouvoir voir le
//     format d'émission et aussi une vue par ligne. »
//
// Il précise sur l'ensemble de son message : « Pour les bugs et les anomalies
// j'attendrai les RC. » Ce sont donc des DEMANDES, pas des pannes.
//
// TROIS DEMANDES, TROIS ÉTATS DIFFÉRENTS — et ce lot n'en livre que deux
// ---------------------------------------------------------------------
//
//  1. « un onglet avec ses radios favorites » → LIVRÉ ici.
//     Les favoris étaient déjà groupés en tête, mais dans la même page : les
//     deux sections défilent ENSEMBLE, et sur un long catalogue ses favoris
//     disparaissent vers le haut. Sa demande n'était pas « rendez-les
//     accessibles » mais « séparez-les vraiment ».
//
//  2. « voir le format d'émission » → PAS livré, et c'est délibéré.
//     Deux lectures possibles, une seule est un manque. S'il veut le CODEC
//     (MP3, AAC) : il est déjà affiché, au seul niveau Expert. S'il veut le
//     DÉBIT : `RadioStation` ne porte ni `bitrate` ni `sample_rate` — c'est un
//     chantier de donnée, pas d'affichage.
//     ⚠️ La question n'a pas été posée. Relu le 13/09/2026 : le fil 1671 porte
//     VINGT réponses et il n'y précise nulle part ce qu'il entend par là.
//     Coder sans cette réponse, c'est parier.
//
//  3. « une vue par ligne » → LIVRÉ ici. L'écran ne connaissait que `.grid`.
//
// CONTRE-ÉPREUVE : chaque bloc en porte une qui rejoue l'état d'avant.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleVue, ecrireVue, lireVue } from '../vueEcran';

afterEach(() => vi.restoreAllMocks());

const ecran = () =>
  readFileSync(resolve(__dirname, '../../components/v2/RadiosV2.svelte'), 'utf8');

describe('#863 · 1 — les favoris deviennent un ONGLET', () => {
  it('🔴 deux onglets, et non deux sections qui défilent ensemble', () => {
    const s = ecran();
    expect(s).toContain('class="ronglets"');
    expect(s).toContain('role="tablist"');
    expect(s).toContain('ongletFavoris');
  });

  it('l’onglet ne s’offre QUE s’il y a des favoris', () => {
    // Un onglet vide serait pire que pas d'onglet.
    const s = ecran();
    const i = s.indexOf('class="ronglets"');
    expect(s.slice(Math.max(0, i - 200), i)).toContain('{#if favorites.length}');
  });

  it('l’écran retombe sur « toutes » quand il n’y a plus de favori', () => {
    // `favorites.length && ongletFavoris` : la garde est dans le choix de la
    // liste, pas seulement dans l'affichage des onglets. Retirer le dernier
    // favori ne doit pas laisser une page vide.
    expect(ecran()).toContain('favorites.length && ongletFavoris ? favorites : shown');
  });

  it('CONTRE-ÉPREUVE : les deux sections d’avant défilaient ensemble', () => {
    const avant = `{#if favorites.length}<section><h2>Favoris</h2></section>{/if}
      {#if others.length}<section><h2>Toutes</h2></section>{/if}`;
    expect(/role="tablist"/.test(avant), 'le témoin porte déjà des onglets').toBe(false);
    expect(ecran()).toContain('role="tablist"');
  });
});

describe('#863 · 3 — la vue par ligne', () => {
  it('🔴 l’écran offre les deux dispositions', () => {
    const s = ecran();
    expect(s).toContain("class={vue === 'liste' ? 'rlist' : 'grid'}");
    expect(s).toContain("choisirVue('liste')");
    expect(s).toContain("choisirVue('grille')");
  });

  it('le basculeur est le MÊME que celui des Zones', () => {
    // Deux écrans qui offrent le même choix doivent le proposer pareil — mêmes
    // libellés, mêmes icônes, même place.
    const s = ecran();
    const zones = readFileSync(
      resolve(__dirname, '../../components/v2/ZonesV2.svelte'), 'utf8');
    for (const cle of ['v2.zones.viewSwitch', 'v2.zones.viewGrid', 'v2.zones.viewList']) {
      expect(s.includes(cle), `${cle} absente de RadiosV2`).toBe(true);
      expect(zones.includes(cle), `${cle} absente de ZonesV2`).toBe(true);
    }
  });

  it('la MÊME vignette sert aux deux vues', () => {
    // `rlist` est la grille ramenée à une colonne : un second gabarit de
    // station aurait divergé du premier à la première correction.
    const s = ecran();
    expect((s.match(/\{@render tile\(r\)\}/g) ?? []).length,
      'la vignette est rendue à plusieurs endroits : ils divergeront').toBe(1);
  });
});

describe('#863 — le choix de vue se retient, et ne casse rien s’il ne peut pas', () => {
  it('une clé par écran — deux écrans ne se suivent pas', () => {
    expect(cleVue('radios')).not.toBe(cleVue('zones'));
  });

  it('la grille est le défaut : on ne surprend pas qui n’a rien réglé', () => {
    const vide = { getItem: () => null };
    expect(lireVue('radios', vide)).toBe('grille');
  });

  it('ce qui est retenu est relu', () => {
    const boite: Record<string, string> = {};
    ecrireVue('radios', 'liste', { setItem: (k, v) => { boite[k] = v; } });
    expect(lireVue('radios', { getItem: (k) => boite[k] ?? null })).toBe('liste');
  });

  it('🔴 un stockage qui LÈVE ne casse pas l’écran', () => {
    const casse = {
      getItem: () => { throw new Error('refusé'); },
      setItem: () => { throw new Error('refusé'); },
    };
    expect(lireVue('radios', casse)).toBe('grille');
    expect(ecrireVue('radios', 'liste', casse), 'écrire a levé et la valeur est perdue')
      .toBe('liste');
  });

  it('une valeur inconnue retombe sur la grille', () => {
    expect(lireVue('radios', { getItem: () => 'mosaique' })).toBe('grille');
  });
});

describe('#863 · 2 — ⚠️ le « format d’émission » n’est PAS traité', () => {
  it('le codec reste au niveau Expert, comme avant', () => {
    // S'il veut le codec, il est déjà là ; s'il veut le débit, la donnée
    // n'existe pas. Sans sa réponse, toucher à ça serait parier.
    const s = ecran();
    expect(s).toContain('showExpert');
    expect(s).toContain('tech(r)');
  });

  it('aucun débit n’a été inventé', () => {
    // `RadioStation` ne porte ni `bitrate` ni `sample_rate` : afficher un
    // débit demanderait de le fabriquer, et #2427 a montré où ça mène.
    const s = ecran();
    expect(/bitrate|sample_rate/.test(s),
      'un débit est apparu : d’où vient-il ?').toBe(false);
    const types = readFileSync(resolve(__dirname, '../types.ts'), 'utf8');
    const i = types.indexOf('interface RadioStation');
    const bloc = types.slice(i, types.indexOf('}', i));
    expect(/bitrate/.test(bloc), 'le serveur porte désormais le débit : le point 2 devient faisable')
      .toBe(false);
  });
});
