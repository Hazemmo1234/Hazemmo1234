import { Barlow_Condensed, Cairo } from "next/font/google";

// Cairo covers Arabic and Latin (body + Arabic headings); Barlow Condensed italic
// echoes the logo for Latin headings and numbers (UX spec "Typography").
export const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700", "800"],
});

export const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["700", "800"],
  style: ["italic"],
});

export const fontVariables = `${cairo.variable} ${barlow.variable}`;
