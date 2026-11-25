# Self-hosted fonts

The app's two typefaces are served from these files (`src/app/fonts.ts`, `next/font/local`), so a
build never downloads fonts. They are the same glyphs, features and character coverage that
`next/font/google` used to fetch from Google Fonts.

| File | Family / style | Version | Characters | Bytes |
|---|---|---|---|---|
| `cairo/Cairo-Variable.woff2` | Cairo, variable `wght` 200–1000, used at 400/600/700/800 | 3.130 | 656 (Arabic, Latin, Latin-Ext) | 69 588 |
| `barlow-condensed/BarlowCondensed-BoldItalic.woff2` | Barlow Condensed Bold Italic (700) | 1.408 | 471 (Latin, Latin-Ext, Vietnamese) | 21 444 |
| `barlow-condensed/BarlowCondensed-ExtraBoldItalic.woff2` | Barlow Condensed ExtraBold Italic (800) | 1.408 | 471 (Latin, Latin-Ext, Vietnamese) | 21 388 |

## Licences
Both families are licensed under the **SIL Open Font License, Version 1.1**:
- Cairo: `cairo/OFL.txt`, "Copyright 2009 The Cairo Project Authors (https://github.com/Gue3bara/Cairo)".
- Barlow Condensed: `barlow-condensed/OFL.txt`, "Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)".

The `OFL.txt` files are byte-for-byte copies from the official Google Fonts repository
(`google/fonts`, `ofl/cairo/OFL.txt` and `ofl/barlowcondensed/OFL.txt`). Neither declares a
Reserved Font Name. The subset files are Modified Versions under the OFL. They keep the
original copyright (name ID 0), licence description (ID 13) and licence URL (ID 14), and stay
under the OFL.

## Provenance and how the files were made
Sources: `google/fonts` (main), the files Google Fonts serves:

| Source file | sha256 |
|---|---|
| `ofl/cairo/Cairo[slnt,wght].ttf` | `667c987182391c91f4e57a2f455b1794fb5e3ee6ca4ef3383e86bb690fa9c964` |
| `ofl/barlowcondensed/BarlowCondensed-BoldItalic.ttf` | `d8694f65cd70c3e5e600ead37657aab0adb5f63b275d0c1f6f4a7046de222145` |
| `ofl/barlowcondensed/BarlowCondensed-ExtraBoldItalic.ttf` | `331783dae9ec0c398f4d32c9fd5a56d4c602caa0c1628c2b9cbfe93f48eb68c9` |

Processing used fontTools 4.60.1, mirroring what Google Fonts serves for the previous
`next/font/google` configuration:

1. **Cairo only:** `varLib.instancer`, pin `slnt=0` (Google serves only the `wght` axis).
2. **Subset each face** to exactly the union of codepoints in the files Google served for that configuration:
   - Cairo: subsets arabic, latin and latin-ext.
   - Barlow Condensed: subsets latin, latin-ext and vietnamese.
3. **Keep Google's OpenType features.**
   - Cairo: `ccmp dnom fina frac init locl medi numr rlig rvrn kern mark mkmk`.
   - Barlow Condensed: `ccmp dnom frac liga locl numr pnum tnum kern mark mkmk`.
4. **Remove hinting and `DSIG`/`MVAR`.** This matches Google's files.
5. **Output woff2;** all name records are kept.

Checked against the files Google served:
- Same version strings, axes, tables, features and codepoint sets.
- A Chromium render of Arabic, English, Latin-Ext, Vietnamese and tabular figures at every used weight was byte-identical with both sets of files.

| Output | sha256 |
|---|---|
| `Cairo-Variable.woff2` | `5faa5eb54f259bb0e77c2b8283490d655ecbb8e306c03837e86ebb6435afbf0d` |
| `BarlowCondensed-BoldItalic.woff2` | `851e3fc7ccf6395887f429c803161e8fc56d3fb801fff6eb3b937655f4384209` |
| `BarlowCondensed-ExtraBoldItalic.woff2` | `3ee3619fe7932069d4ebd58edfee1ddb947eab22edca34d9c911126421c64b80` |

`tests/unit/fonts.test.ts` keeps it this way: no remote font loading, files and licences present.
