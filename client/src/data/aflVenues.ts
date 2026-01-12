export type AFLVenue = {
  id: string;
  name: string;
  query: string;
  fallbackCenter?: [number, number];
};

export const aflVenues: AFLVenue[] = [
  {
    id: "adelaide-oval",
    name: "Adelaide Oval",
    query: "Adelaide Oval, Adelaide SA, Australia",
  },
  {
    id: "barossa-park",
    name: "Barossa Park",
    query: "Barossa Park, Nuriootpa SA, Australia",
  },
  {
    id: "norwood-oval",
    name: "Norwood Oval",
    query: "Norwood Oval, Norwood SA, Australia",
  },
  {
    id: "gabba",
    name: "Gabba",
    query: "The Gabba, Woolloongabba QLD, Australia",
  },
  {
    id: "people-first-stadium",
    name: "People First Stadium",
    query: "People First Stadium, Carrara QLD, Australia",
  },
  {
    id: "optus-stadium",
    name: "Optus Stadium",
    query: "Optus Stadium, Burswood WA, Australia",
  },
  {
    id: "hands-oval",
    name: "Hands Oval",
    query: "Hands Oval, Bunbury WA, Australia",
  },
  {
    id: "corroboree-group-oval-manuka",
    name: "Corroboree Group Oval Manuka",
    query: "Corroboree Group Oval Manuka, Canberra ACT, Australia",
  },
  {
    id: "engie-stadium",
    name: "ENGIE Stadium",
    query: "ENGIE Stadium, Sydney Olympic Park NSW, Australia",
  },
  {
    id: "scg",
    name: "SCG",
    query: "Sydney Cricket Ground, Sydney NSW, Australia",
  },
  {
    id: "mcg",
    name: "MCG",
    query: "MCG, Melbourne VIC, Australia",
  },
  {
    id: "marvel-stadium",
    name: "Marvel Stadium",
    query: "Marvel Stadium, Docklands VIC, Australia",
  },
  {
    id: "gmhba-stadium",
    name: "GMHBA Stadium",
    query: "GMHBA Stadium, South Geelong VIC, Australia",
  },
  {
    id: "mars-stadium",
    name: "Mars Stadium",
    query: "Mars Stadium, Wendouree VIC, Australia",
  },
  {
    id: "ninja-stadium",
    name: "Ninja Stadium",
    query: "Ninja Stadium, Hobart TAS, Australia",
  },
  {
    id: "utas-stadium",
    name: "UTAS Stadium",
    query: "UTAS Stadium, Launceston TAS, Australia",
  },
  {
    id: "tio-stadium",
    name: "TIO Stadium",
    query: "TIO Stadium, Marrara NT, Australia",
  },
  {
    id: "tio-traeger-park",
    name: "TIO Traeger Park",
    query: "TIO Traeger Park, Alice Springs NT, Australia",
  },
];
