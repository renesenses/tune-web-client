import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { estFichierAudio } from '../fichiersAudio';

describe('estFichierAudio', () => {
  it('reconnaît les formats haute résolution que le navigateur ne type pas', () => {
    for (const n of ['a.flac', 'b.DSF', 'c.dff', 'd.ape', 'e.wv', 'f.aiff']) expect(estFichierAudio(n), n).toBe(true);
  });
  it('écarte le reste, et un nom sans extension', () => {
    for (const n of ['pochette.jpg', 'notes.txt', 'flac', 'archive.flac.zip']) expect(estFichierAudio(n), n).toBe(false);
  });
});

describe('la file v2 accepte un fichier déposé (porté de QueueView)', () => {
  const Q = readFileSync('src/components/v2/QueueV2.svelte', 'utf8');
  const i = Q.indexOf('async function deposerFichiers(');
  const corps = Q.slice(i, Q.indexOf('\n  }\n', i));

  it('le conteneur écoute le dépôt', () => {
    // Borné à la balise ouvrante : `ondragleave={() => …}` contient un `>`, un
    // simple `[^>]*` s'y arrêtait.
    const i = Q.indexOf('<section class="v2-queue tune-v2"');
    expect(i).toBeGreaterThan(-1);
    const balise = Q.slice(i, Q.indexOf('\n  {#if depotSurvol}', i));
    expect(balise).toContain('ondrop={deposerFichiers}');
    expect(balise).toContain('ondragover={survolDepot}');
  });

  it('🔴 le fichier est AJOUTÉ à la file, jamais substitué à la lecture', () => {
    expect(i, 'deposerFichiers introuvable').toBeGreaterThan(-1);
    expect(corps).toContain('api.uploadAudioFile(f)');
    expect(corps).toContain('api.addToQueue(zid,');
    expect(corps).toContain("source: 'upload'");
    expect(corps).not.toMatch(/api\.play\w*\(/);
  });

  it('seuls les fichiers audio partent, et chaque échec est nommé', () => {
    expect(corps).toContain('.filter((f) => estFichierAudio(f.name))');
    expect(corps).toMatch(/notifications\.error\(`\$\{f\.name\}/);
  });
});
