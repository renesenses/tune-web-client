import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * #4184 — choisir ASIO force `local_exclusive_mode: true` ; en quittant
 * ASIO, le client répétait ce `true` en écho, et le serveur ne le remettait
 * jamais à `false` : le « WASAPI » d'après un aller-retour ASIO était devenu
 * WASAPI exclusif sans que l'écran le dise. Le serveur désarme désormais ce
 * qu'ASIO avait armé et RÉPOND `local_exclusive_mode` : les deux écrans
 * doivent lire cette réponse au lieu de croire ce qu'ils ont envoyé.
 */
const lire = (p: string) => fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

describe('#4184 — le sélecteur exclusif lit ce que le serveur a écrit', () => {
  it('nouvelle interface : patch() applique local_exclusive_mode de la réponse', () => {
    const src = lire('../../components/v2/SettingsV2.svelte');
    expect(src).toMatch(/const r = await api\.updateConfig\(fields\)/);
    expect(src).toMatch(/typeof r\?\.local_exclusive_mode === 'boolean'\) exclusiveMode = r\.local_exclusive_mode/);
  });
  it('ancienne interface : la bascule de backend lit la réponse du PATCH', () => {
    const src = lire('../../components/SettingsView.svelte');
    expect(src).toMatch(/typeof ecrit\?\.local_exclusive_mode === 'boolean' \? ecrit\.local_exclusive_mode : newExclusive/);
  });
});
