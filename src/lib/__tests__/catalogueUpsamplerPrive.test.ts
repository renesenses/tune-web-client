import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('la configuration publique ne définit aucun choix propre au greffon', () => {
  const locales = 'src/lib/locales';
  for (const fichier of readdirSync(locales).filter(nom => nom.endsWith('.ts'))) {
    expect(readFileSync(join(locales, fichier), 'utf8'), fichier)
      .not.toMatch(/['"]upsampling\.(profile|declaration)\./);
  }
});
