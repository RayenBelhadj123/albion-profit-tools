import type { AlbionCity } from "@/app/generated/prisma/enums";

import type { AlbionMarketLocation } from "./config";

const prismaCityByApiName = {
  Bridgewatch: "BRIDGEWATCH",
  "Black Market": "BLACK_MARKET",
  Caerleon: "CAERLEON",
  "Fort Sterling": "FORT_STERLING",
  Lymhurst: "LYMHURST",
  Martlock: "MARTLOCK",
  Thetford: "THETFORD",
} as const satisfies Record<AlbionMarketLocation, AlbionCity>;

const apiNameByPrismaCity = {
  BRIDGEWATCH: "Bridgewatch",
  BLACK_MARKET: "Black Market",
  CAERLEON: "Caerleon",
  FORT_STERLING: "Fort Sterling",
  LYMHURST: "Lymhurst",
  MARTLOCK: "Martlock",
  THETFORD: "Thetford",
} as const satisfies Record<AlbionCity, AlbionMarketLocation>;

export function toPrismaCity(city: string): AlbionCity | null {
  if (city in prismaCityByApiName) {
    return prismaCityByApiName[city as AlbionMarketLocation];
  }

  return null;
}

export function toAlbionApiCity(city: AlbionCity): AlbionMarketLocation {
  return apiNameByPrismaCity[city];
}
