import localFont from "next/font/local";

// Cairo covers Arabic and Latin (body + Arabic headings); Barlow Condensed italic
// echoes the logo for Latin headings and numbers (UX spec "Typography").
// Self-hosted: the exact Google Fonts subsets, rebuilt from the official OFL sources
// (src/assets/fonts/README.md), so a build never downloads fonts.
export const cairo = localFont({
  variable: "--font-cairo",
  // one variable file, declared at the same four weights Google Fonts served
  // (next/font needs literal arguments, hence the repeated path)
  src: [
    { path: "../assets/fonts/cairo/Cairo-Variable.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/cairo/Cairo-Variable.woff2", weight: "600", style: "normal" },
    { path: "../assets/fonts/cairo/Cairo-Variable.woff2", weight: "700", style: "normal" },
    { path: "../assets/fonts/cairo/Cairo-Variable.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
});

export const barlow = localFont({
  variable: "--font-barlow",
  src: [
    { path: "../assets/fonts/barlow-condensed/BarlowCondensed-BoldItalic.woff2", weight: "700", style: "italic" },
    { path: "../assets/fonts/barlow-condensed/BarlowCondensed-ExtraBoldItalic.woff2", weight: "800", style: "italic" },
  ],
  display: "swap",
});

export const fontVariables = `${cairo.variable} ${barlow.variable}`;
