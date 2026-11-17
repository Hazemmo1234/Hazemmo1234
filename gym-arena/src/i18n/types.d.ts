import type messages from "@/messages/ar.json";
import type { Locale } from "./config";

// Type-safe message keys: a key missing from the catalog is a compile error.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
