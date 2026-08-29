export const ZONE_GRAPH_VERSION = "nus-zones-v1";

export const nusZones = Object.freeze([
  { id: "utown", name: "UTown", aliases: ["UTown", "University Town", "ERC"] },
  { id: "museum-ucc", name: "Museum/UCC", aliases: ["Museum", "NUS Museum", "UCC", "University Cultural Centre", "SRC"] },
  { id: "cde", name: "CDE", aliases: ["CDE", "College of Design and Engineering", "Engineering", "EA"] },
  { id: "central", name: "Central", aliases: ["Central", "YIH", "Yusof Ishak House", "CLB", "Central Library"] },
  { id: "fass", name: "FASS", aliases: ["FASS", "Arts", "AS5"] },
  { id: "business", name: "Business", aliases: ["Business", "Biz", "BIZ2"] },
  { id: "computing", name: "Computing", aliases: ["Computing", "SoC", "COM2", "COM3"] },
  { id: "pgp", name: "PGP", aliases: ["PGP", "PGPR", "Prince George's Park"] },
  { id: "science", name: "Science", aliases: ["Science", "LT27", "S17"] },
  { id: "medicine-kent-ridge", name: "Medicine/Kent Ridge MRT", aliases: ["Medicine", "YLL", "NUH", "Kent Ridge MRT"] },
]);

export const zoneEdges = Object.freeze([
  ["utown", "museum-ucc"], ["utown", "cde"],
  ["museum-ucc", "cde"], ["museum-ucc", "central"], ["museum-ucc", "fass"],
  ["cde", "central"], ["cde", "business"],
  ["central", "fass"], ["central", "business"], ["central", "computing"], ["central", "science"],
  ["fass", "business"],
  ["business", "computing"], ["business", "pgp"],
  ["computing", "pgp"], ["computing", "science"],
  ["pgp", "science"], ["pgp", "medicine-kent-ridge"],
  ["science", "medicine-kent-ridge"],
]);

const normalize = (value) => String(value || "").normalize("NFKC").trim().toLocaleLowerCase("en-SG");
const aliases = new Map(nusZones.flatMap((zone) => zone.aliases.map((alias) => [normalize(alias), zone])));

export const resolveZoneAlias = (value) => aliases.get(normalize(value)) || null;
export const adjacentZoneIds = (zoneId) => zoneEdges.flatMap(([left, right]) => left === zoneId ? [right] : right === zoneId ? [left] : []);
export const publicZones = () => nusZones.map((zone) => ({ ...zone, adjacent: adjacentZoneIds(zone.id) }));
