import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('la configuration publique ne définit aucun choix propre au greffon', () => {
  const fichiers = [
    'src/components/v2/SurechantillonnageV2.svelte',
    'src/lib/surechantillonnage.ts',
    'src/lib/__tests__/profilUpsamplerPro.svelte.test.ts',
  ];
  const profils = /\b(natural|impact|texture)\b/i;
  const axes = /['"](device|brand|family|interface)['"]|\b(device|brand|family|interface)\??:/;
  for (const fichier of fichiers) {
    const source = readFileSync(fichier, 'utf8');
    expect(source, fichier).not.toMatch(profils);
    expect(source.replaceAll('font-family:', ''), fichier).not.toMatch(axes);
  }
  const locales = 'src/lib/locales';
  for (const fichier of readdirSync(locales).filter(nom => nom.endsWith('.ts'))) {
    expect(readFileSync(join(locales, fichier), 'utf8'), fichier)
      .not.toMatch(/['"]upsampling\.(profile|declaration)\./);
  }
});
