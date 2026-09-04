/**
 * Le client v2 sait CRÉER une collection et AJOUTER une radio.
 *
 * Les deux gestes manquaient, et l'écran le disait lui-même : « Créez-en une
 * depuis l'écran Collections actuel », « Ajoutez-en depuis l'écran Radio
 * actuel ». Un client qu'on veut livrer seul ne peut pas renvoyer vers celui
 * qu'il remplace — c'est ce qui l'empêchait, plus que du code manquant :
 * `api.createCollection` et `api.createRadio` existent depuis toujours et
 * n'avaient qu'un appelant chacune, dans le client actuel (mesuré le
 * 04/09/2026).
 *
 * CE QUE CE TEST NE PROUVE PAS : que le bouton s'affiche, ni que la création
 * aboutit côté serveur. Il prouve que l'appel est BRANCHÉ — c'est précisément
 * ce qui manquait.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lire = (f: string) => readFileSync(join(process.cwd(), 'src/components/v2', f), 'utf8');

describe('v2 — créer une collection', () => {
  const src = lire('CollectionsV2.svelte');

  it('appelle api.createCollection', () => {
    expect(src).toContain('api.createCollection(');
  });

  it('réutilise la modale de modification plutôt qu’une seconde', () => {
    // Deux modales pour deux champs identiques divergeraient à la première
    // correction.
    expect(src).toContain('RenommerModale');
    expect(
      (src.match(/<RenommerModale/g) ?? []).length,
      'la création et la modification ne partagent plus la même modale',
    ).toBe(2);
  });

  it('ne le propose PAS sur l’onglet intelligent', () => {
    // Une collection intelligente se définit par des règles, pas par un nom :
    // le même bouton y promettrait une création qui ne produit pas ce qu'on
    // regarde.
    expect(src).toMatch(/\{#if onglet === 'manuelle'\}[\s\S]{0,400}v2\.col\.create/);
  });
});

describe('v2 — ajouter une radio', () => {
  const ecran = lire('RadiosV2.svelte');
  const modale = lire('RadioEditModale.svelte');

  it('la modale appelle api.createRadio', () => {
    expect(modale).toContain('api.createRadio(');
  });

  it('elle distingue création et modification par l’absence d’`id`', () => {
    expect(modale).toContain('radio.id == null');
    expect(modale).toMatch(/creation\s*\n?\s*\?\s*await api\.createRadio/);
  });

  it('l’écran ouvre la modale sur un gabarit sans `id`', () => {
    expect(ecran).toContain('function nouvelleStation(');
    expect(ecran).toMatch(/id: null/);
  });

  it('une station créée rejoint la liste au lieu d’être cherchée dedans', () => {
    // Un `map` seul ne trouverait rien : la nouvelle station n'apparaîtrait
    // qu'au prochain chargement de l'écran.
    expect(ecran).toMatch(/cible\.id == null[\s\S]{0,120}\.\.\.radios/);
  });
});
