export const ALBION_API_BASE_URLS = {
  EUROPE: "https://europe.albion-online-data.com",
  AMERICAS: "https://west.albion-online-data.com",
  ASIA: "https://east.albion-online-data.com",
} as const;

export type AlbionServer = keyof typeof ALBION_API_BASE_URLS;

export const ALBION_CITY_NAMES = [
  "Bridgewatch",
  "Caerleon",
  "Fort Sterling",
  "Lymhurst",
  "Martlock",
  "Thetford",
] as const;

export type AlbionCityName = (typeof ALBION_CITY_NAMES)[number];
export type AlbionMarketLocation = AlbionCityName | "Black Market";

export const ALBION_API_URL_MAX_LENGTH = 4096;
export const DEFAULT_ALBION_API_TIMEOUT_MS = 8000;

export function getAlbionApiBaseUrl(server: AlbionServer): string {
  return ALBION_API_BASE_URLS[server];
}

export function getDefaultAlbionServer(): AlbionServer {
  const configuredServer = process.env.ALBION_DEFAULT_SERVER;

  if (
    configuredServer === "EUROPE" ||
    configuredServer === "AMERICAS" ||
    configuredServer === "ASIA"
  ) {
    return configuredServer;
  }

  return "EUROPE";
}
