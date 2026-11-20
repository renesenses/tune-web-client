// tune-server-rust#9216 — une session de service enregistrée que le serveur
// ne relit plus (jetons chiffrés, clé `tune-secrets.cle` absente, illisible
// ou autre) : l'état du service porte `session_unreadable`, et l'écran des
// services le dit dans la langue de l'interface au lieu d'un simple « non
// connecté ».
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import de from '../locales/de';
import el from '../locales/el';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import nb from '../locales/nb';
import pl from '../locales/pl';
import ro from '../locales/ro';
import sv from '../locales/sv';
import tr from '../locales/tr';
import vi from '../locales/vi';
import zh from '../locales/zh';

const LANGUES: Record<string, Record<string, string>> = {
  de, el, en, es, fr, hu, it: it_, ja, ko, nb, pl, ro, sv, tr, vi, zh,
} as any;
const CODES = ['key_missing', 'key_unreadable', 'key_mismatch'] as const;

describe('session illisible (#9216)', () => {
  it('chaque code a sa phrase dans les 16 langues, qui nomme la clé', () => {
    expect(Object.keys(LANGUES)).toHaveLength(16);
    for (const [langue, table] of Object.entries(LANGUES)) {
      for (const code of CODES) {
        const phrase = table[`v2.set.sessionUnreadable.${code}`];
        expect(phrase, `${langue} ${code}`).toBeTruthy();
        expect(phrase, `${langue} ${code}`).toContain('tune-secrets.cle');
      }
    }
    // Les trois phrases se distinguent (une cause, une phrase).
    expect(new Set(CODES.map((c) => fr[`v2.set.sessionUnreadable.${c}` as keyof typeof fr])).size).toBe(3);
  });

  it("l'écran des services affiche l'avis tant que le service n'est pas reconnecté", () => {
    const source = readFileSync(resolve(__dirname, '../../components/v2/SettingsV2.svelte'), 'utf8');
    expect(source).toContain('{#if st.session_unreadable && !st.authenticated}');
    expect(source).toContain('v2.set.sessionUnreadable.${st.session_unreadable}');
  });
});
