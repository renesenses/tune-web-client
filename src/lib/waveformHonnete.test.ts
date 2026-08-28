import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/// Garde de non-retour pour #2182.
///
/// Le mode « forme d'onde » du lecteur a longtemps dessiné une somme de
/// sinusoïdes plus un tirage aléatoire. Rien n'empêchait de l'y remettre : le
/// module d'historique peut être juste et le composant continuer à inventer.
/// Cette garde lit donc le CODE du chemin « forme d'onde » et refuse d'y voir
/// une source de signal synthétique.
///
/// Piège évité : chercher `Math.random` dans le fichier brut rend la garde
/// verte à tort dès que le motif n'apparaît que dans un COMMENTAIRE — et ce
/// fichier en contient plusieurs qui citent l'ancienne formule pour expliquer
/// ce qu'on a retiré. On dépouille donc les commentaires avant de chercher.

const VISUALIZER = new URL('../components/AudioVisualizer.svelte', import.meta.url);

/** Retire commentaires de ligne, blocs `/* *\/` et chaînes, pour ne garder que du code. */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  let inLine = false;
  let inBlock = false;
  let quote: string | null = null;

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
      i++;
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false;
        i += 2;
      } else {
        if (c === '\n') out += c;
        i++;
      }
      continue;
    }
    if (quote) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      inLine = true;
      i += 2;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlock = true;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Corps de la fonction nommée, accolades équilibrées, commentaires retirés. */
export function functionBody(code: string, name: string): string {
  const start = code.indexOf(`function ${name}(`);
  if (start === -1) return '';
  const open = code.indexOf('{', start);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  return '';
}

describe('la garde elle-même sait lire du code', () => {
  it('dépouille les commentaires mais garde le code', () => {
    const src = `const a = 1; // Math.random() ici est un commentaire\n/* Math.sin() aussi */\nconst b = Math.abs(2);`;
    const out = stripComments(src);
    expect(out).not.toContain('Math.random');
    expect(out).not.toContain('Math.sin');
    expect(out).toContain('Math.abs');
  });

  it('trouverait bien le motif s’il était dans du VRAI code (contre-épreuve)', () => {
    // Sans ce cas, une garde cassée (qui dépouille tout) resterait verte.
    const src = `const x = Math.random(); // rien`;
    expect(stripComments(src)).toContain('Math.random');
  });

  it('isole le corps d’une fonction', () => {
    const src = `function a(){ const z = { q: 1 }; return z; }\nfunction b(){ return 2; }`;
    expect(functionBody(src, 'a')).toContain('q: 1');
    expect(functionBody(src, 'a')).not.toContain('return 2');
  });
});

describe('AudioVisualizer — le mode « forme d’onde » ne fabrique plus de signal', () => {
  const raw = readFileSync(VISUALIZER, 'utf8');
  const code = stripComments(raw);

  it('le fichier est bien celui qu’on croit', () => {
    expect(raw).toContain('waveform');
    expect(code.length).toBeGreaterThan(500);
  });

  it('s’appuie sur l’historique de crête réel', () => {
    // On cherche des IDENTIFIANTS, pas le chemin d'import : celui-ci est une
    // chaîne, et `stripComments` retire aussi les chaînes.
    expect(code).toContain('WaveformHistory');
    expect(code).toContain('waveHistory');
    // …et l'historique est bien nourri par les crêtes du serveur.
    expect(code).toContain('peak_left_db');
    expect(code).toContain('peak_right_db');
  });

  it('ne trace plus la forme d’onde à partir de sinus', () => {
    // Portée VOLONTAIREMENT élargie au fichier entier. Restreinte à
    // `drawWaveform`, l'assertion passait déjà AVANT le correctif — les
    // sinusoïdes vivaient dans `generateTargets()`, pas dans la fonction de
    // tracé. Une garde qui ne peut pas échouer ne garde rien.
    //
    // Après #2182 le composant n'a plus AUCUNE raison d'appeler Math.sin :
    // les quatre occurrences d'avant étaient les trois harmoniques du faux
    // tracé plus la porteuse du repli « niveaux réels ».
    expect(code).not.toContain('Math.sin');

    const body = functionBody(code, 'drawWaveform');
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toContain('Math.random');
  });

  it('ne fabrique plus de cibles « forme d’onde » synthétiques', () => {
    // L'ancien code remplissait `waveTargets` dans `generateTargets()` avec
    // trois harmoniques et du bruit. Ces symboles ne doivent plus exister.
    expect(code).not.toContain('waveTargets');
    expect(code).not.toContain('WAVE_POINTS');
  });

  it('n’utilise plus le profil d’énergie déduit des MÉTADONNÉES pour la forme d’onde', () => {
    // `getEnergyProfile()` déduisait bass/mid/treble de la fréquence
    // d'échantillonnage et de la profondeur : une supposition, pas une mesure.
    const body = functionBody(code, 'drawWaveform');
    expect(body).not.toContain('getEnergyProfile');
  });
});
