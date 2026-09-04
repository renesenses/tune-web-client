/**
 * Toute clé de traduction citée par un écran v2 doit EXISTER dans fr.ts et en.ts.
 *
 * Pourquoi une garde à part : `check-i18n.mjs` attrape la faute inverse — une
 * chaîne française laissée en dur. Il ne dit rien d'une clé qui n'existe pas,
 * et c'est la panne la plus silencieuse du système : `$t()` retombe sur la clé
 * elle-même, donc l'écran affiche « v2.tool.libraryEmty » à l'utilisateur
 * pendant que les trois portes restent vertes.
 *
 * Le manque côté `en` mord autant que côté `fr`. Le repli sur le français est
 * VOLONTAIRE pour les onze langues traduites partiellement, mais pas pour
 * l'anglais : une clé oubliée dans en.ts laisse du français au milieu de
 * l'interface anglaise, exactement le défaut relevé sur les onglets des
 * Réglages le 01/09/2026.
 *
 * LIMITE ASSUMÉE : seules les clés LITTÉRALES sont vues — `$t('v2.eq.title')`
 * et `labelKey: 'v2.eq.presetFlat'`. Une clé calculée à l'exécution
 * (`$t(`v2.pod.${x}`)`) échappe à ce test comme elle échappe au compilateur.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fr from '../locales/fr';
import en from '../locales/en';

const DOSSIER = join(process.cwd(), 'src/components/v2');

/** `$t('clé')` et `labelKey: 'clé'` — les deux façons de citer une clé ici. */
const MOTIFS = [/\$t\(\s*'([\w.]+)'/g, /labelKey:\s*'([\w.]+)'/g];

function clesCitees(): { fichier: string; cle: string }[] {
  const trouvees: { fichier: string; cle: string }[] = [];
  for (const fichier of readdirSync(DOSSIER).filter((f) => f.endsWith('.svelte'))) {
    const source = readFileSync(join(DOSSIER, fichier), 'utf8');
    for (const motif of MOTIFS) {
      for (const m of source.matchAll(motif)) trouvees.push({ fichier, cle: m[1] });
    }
  }
  return trouvees;
}

describe('Écrans v2 — les clés de traduction citées existent', () => {
  const citees = clesCitees();

  it('le balayage trouve bien des clés (sinon le test ne garde rien)', () => {
    // Sans ce garde-fou, un changement de convention d'appel viderait
    // silencieusement les deux tests suivants, qui passeraient sur zéro clé.
    expect(citees.length).toBeGreaterThan(100);
  });

  it('chaque clé citée existe dans fr.ts', () => {
    const absentes = citees.filter(({ cle }) => !(cle in fr));
    expect(
      absentes.map(({ fichier, cle }) => `${fichier} → ${cle}`),
      'ces clés s’afficheraient telles quelles à l’écran',
    ).toEqual([]);
  });

  it('chaque clé citée existe dans en.ts', () => {
    const absentes = citees.filter(({ cle }) => !(cle in en));
    expect(
      absentes.map(({ fichier, cle }) => `${fichier} → ${cle}`),
      'ces clés laisseraient du français dans l’interface anglaise',
    ).toEqual([]);
  });
});
