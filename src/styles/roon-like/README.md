# Theme « Roon-like »

The Roon-like theme of the Tune web client: a light, airy layout with large serif titles, big artwork and a library sidebar, chosen in Settings › General › Interface. It is inspired by the interface of Roon.

**Roon is a trademark of Roon Labs. Tune is not affiliated with or endorsed by Roon Labs.** This theme uses only the name, in this text and in the settings description. It contains no logo, font, icon or image from Roon: the fonts are Playfair Display and Inter (OFL), the interface icons are Lucide, the zone icons are Tune's own (`src/assets/zone-icons/`, CC0).

| File | Role |
|---|---|
| `jetons-roon-like.css` | the theme's design tokens (colours, fonts, sizes, radii, shadows), light and dark |
| `mise-en-page.css` | layout helpers of the Salon shell (no colours) |
| `reglages.css` | Settings screen re-layout inside the shell (no colours) |
| `ecrans-tune.css` | common layer that gives every other Tune screen, dialog and menu the theme's look |

Everything is scoped to `<html data-interface="roon-like">` (set by `ShellV2`) or to `.salon[data-jeu="roon-like"]`. A preference saved with the old name `salon` switches to `roon-like` (`ALIAS_INTERFACES` in `src/lib/interfaceSalon.ts`).

Handover for designers: `~/DEV/coordination/interface-facon-roon/PASSATION-LEVENTE.md`.
