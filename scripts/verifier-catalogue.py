"""Contrôle du vocabulaire du catalogue dans les fichiers suivis par Git."""
from functools import lru_cache
import hmac
import os
from pathlib import Path
import re
import subprocess
import sys

CLE = os.environ.get("CATALOGUE_HMAC_KEY", "").encode()

PROFILS = {
    "095e7fe1e300ce6b96085d36ea967a683bf8fc7f84e00260f71e52e431605a9d",
    "c4be9e8e91a1bcc2d835d9a4d412535afe636a405bc86b98a26d3c84d912d0d5",
    "c19d17c35482c9154a569019ea6bb2d8b6e092b8e7ccf64b6af179c07ac29608",
}
AXES = {
    "60253bdf8d55e1706f195dd8948c8aa575fe57c068601a39e748394434ce58b7",
    "22aabfe754e0cbc3e573c97b268f0c95b43bb745bd29ec9fc3fd1fb2ab5591ff",
    "54be74f6ff3d75b03e8586381a7b3aaaaafad6fff861bb06c8577d9ff38295be",
    "c8a58672d53d191b9e428631375e6c2d2d381767d099c0bdac7ceeef48490eee",
}

# Une déclaration peut être du JSON, un champ Rust, un exemple de
# configuration ou une énumération dans la documentation.
CONTEXTE = re.compile(
    r"(?<![^\W_])(?P<nom>profils?|profiles?|catalog(?:ue)?s?|axes?|"
    r"d[ée]clarations?)(?![^\W_])"
    r"(?:[_ -](?:id|name|nom|disponibles?|pris en charge|du catalogue|"
    r"de cadence|de sur[ée]chantillonnage|par d[ée]faut|defaults?))*"
    r"""[\x20\t"'`\]]*(?:(?:=>|[:=|])[ \t]*|\.(?=[A-Za-z_])|[ \t]+)""",
    re.IGNORECASE,
)
# Dans une constante typée, les valeurs suivent le type et l'affectation.
TYPE_TABLEAU = re.compile(r"(?:&?\[[^\]\n]*\]|(?:Vec|Option)<[^>\n]+>)\s*=\s*&?")
JETON = re.compile(r"[A-Za-z_][A-Za-z_0-9]*")
MOT = r"""(?:«[ \t]*)?["'`*]*[A-Za-z_][A-Za-z_0-9]*["'`»*]*"""
VALEURS = re.compile(rf"{MOT}(?:(?:[ \t]*[,|/][ \t]*|[ \t]+(?:ou|et|or|and)[ \t]+){MOT})*")
PAIRES = {"[": "]", "{": "}", "(": ")"}
STRUCTURE = re.compile(r"""[\[\]{}()"\\]""")


def fin_bloc(texte, debut):
    """Respecte les chaînes JSON et les délimiteurs imbriqués."""
    fins = [PAIRES[texte[debut]]]
    chaine = False
    ignorer = -1
    for marque in STRUCTURE.finditer(texte, debut + 1):
        pos = marque.start()
        if pos == ignorer:
            continue
        signe = marque.group()
        if signe == "\\" and chaine:
            ignorer = pos + 1
        elif signe == '"':
            chaine = not chaine
        elif not chaine:
            if signe in PAIRES:
                fins.append(PAIRES[signe])
            elif signe == fins[-1]:
                fins.pop()
                if not fins:
                    return pos
    return texte.find("\n", debut) if "\n" in texte[debut:] else len(texte)


# Exemples autonomes et déclarations de réglages dans le code ou les schémas.
EXEMPLE = re.compile(
    r"""\s*(?:["'`](?P<profil>\w+)["'`]|"""
    r"""\{\s*["'](?P<axe>\w+)["']\s*:\s*["'][^"'\n]*["']\s*\})\s*"""
)
REGLAGES = re.compile(r"\b(?:UpsamplerSettings|ReglagesSurechantillonnage)\s*\{")
CHAMP = re.compile(r"""(?<!\w)["']?(?P<cle>[A-Za-z_][A-Za-z_0-9]*)["']?\s*:(?!:)""")
PUCES = re.compile(r"(?:[-*][ \t]+" + MOT + r"[ \t]*(?:\r?\n[ \t]*|$))+")


# Une garde ou un export peut énumérer les identifiants sans nommer le
# catalogue. Reconnaître aussi ces listes littérales et alternatives de regex.
LISTE = re.compile(
    r"""(?<=[/(])(?:[A-Za-z]+\|)+[A-Za-z]+(?=[/)])"""
    r"""|["'`][A-Za-z]+["'`](?:[ \t]*,[ \t]*["'`][A-Za-z]+["'`])+"""
)


@lru_cache(maxsize=8192)
def empreinte(mot):
    return hmac.digest(CLE, mot.lower().encode("utf-8"), "sha256").hex()


def correspond(mot, empreintes):
    return empreinte(mot) in empreintes


def infractions(texte):
    for liste in LISTE.finditer(texte):
        mots = set(JETON.findall(liste.group().lower()))
        for groupe in (PROFILS, AXES):
            if sum(correspond(mot, groupe) for mot in mots) >= 2:
                for mot in sorted(mots):
                    if correspond(mot, groupe):
                        yield texte.count("\n", 0, liste.start()) + 1, mot
                break

    exemple = EXEMPLE.fullmatch(texte)
    if exemple:
        groupe = exemple.lastgroup
        if correspond(exemple[groupe], PROFILS if groupe == "profil" else AXES):
            yield texte.count("\n", 0, exemple.start(groupe)) + 1, exemple[groupe]

    for structure in REGLAGES.finditer(texte):
        fin = fin_bloc(texte, structure.end() - 1)
        for champ in CHAMP.finditer(texte, structure.end(), fin):
            if correspond(champ["cle"], AXES):
                yield texte.count("\n", 0, champ.start("cle")) + 1, champ["cle"]

    for contexte in CONTEXTE.finditer(texte):
        nom = contexte["nom"].lower()
        empreintes = PROFILS if nom.startswith("prof") else AXES
        if nom.startswith("catalog"):
            if not any(c in contexte.group() for c in ":=|."):
                continue
            empreintes = PROFILS | AXES
        debut = contexte.end()
        while debut < len(texte) and texte[debut].isspace():
            debut += 1
        if (type_tableau := TYPE_TABLEAU.match(texte, debut)):
            debut = type_tableau.end()
        if texte[debut:debut + 1] in PAIRES:
            fin = fin_bloc(texte, debut)
        elif (puces := PUCES.match(texte, debut)):
            fin = puces.end()
        else:
            # Les énumérations libres sont limitées à la ligne du champ.
            fin_ligne = texte.find("\n", debut)
            valeur = VALEURS.match(texte, debut, len(texte) if fin_ligne < 0 else fin_ligne)
            if not valeur:
                continue
            fin = valeur.end()
        for jeton in JETON.finditer(texte, debut, fin):
            if correspond(jeton.group(), empreintes):
                yield texte.count("\n", 0, jeton.start()) + 1, jeton.group()


def main():
    if not CLE:
        print("::warning::Garde du catalogue désactivée, secret CATALOGUE_HMAC_KEY absent.", file=sys.stderr)
        return 0
    racine = Path(os.fsdecode(subprocess.check_output(
        ["git", "rev-parse", "--show-toplevel"]
    ).rstrip(b"\r\n")))
    fichiers = subprocess.check_output(["git", "-C", racine, "ls-files", "-z"])
    problemes = False
    for nom in fichiers.split(b"\0")[:-1]:
        chemin = racine / os.fsdecode(nom)
        contenu = os.fsencode(os.readlink(chemin)) if chemin.is_symlink() else chemin.read_bytes()
        for ligne, mot in sorted(set(infractions(contenu.decode("utf-8", errors="replace")))):
            print(f"{os.fsdecode(nom)}:{ligne} — référence au catalogue privé ({mot})", file=sys.stderr)
            problemes = True
    return int(problemes)


if __name__ == "__main__":
    sys.exit(main())
