/**
 * La biblioteca de ejemplo: 40 juegos reales para girar sin pegar un perfil (la ruleta de la
 * portada y la vista previa del modo streamer). Las horas son de ejemplo, así los filtros de
 * horas jugadas también responden. Tiene que coincidir con _MOCK_LIBRARY del backend
 * (backend/app/routers/games.py): lo revisa tests/test_demo_library.py.
 */
export function steamHeader(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

// Biblioteca de ejemplo para quien entra sin cuenta: variada (cortos, cooperativos, indies y grandes)
// para que el rodillo se vea lleno y la primera prueba ya sirva.
export const DEMO_GAMES = [
  { appid: 1091500, name: "Cyberpunk 2077", image: steamHeader(1091500), playtime_forever_minutes: 2760 },
  { appid: 1245620, name: "ELDEN RING", image: steamHeader(1245620), playtime_forever_minutes: 5400 },
  { appid: 413150, name: "Stardew Valley", image: steamHeader(413150), playtime_forever_minutes: 90 },
  { appid: 1174180, name: "Red Dead Redemption 2", image: steamHeader(1174180), playtime_forever_minutes: 1980 },
  { appid: 1145360, name: "Hades", image: steamHeader(1145360), playtime_forever_minutes: 0 },
  { appid: 367520, name: "Hollow Knight", image: steamHeader(367520), playtime_forever_minutes: 0 },
  { appid: 504230, name: "Celeste", image: steamHeader(504230), playtime_forever_minutes: 45 },
  { appid: 105600, name: "Terraria", image: steamHeader(105600), playtime_forever_minutes: 1260 },
  { appid: 620, name: "Portal 2", image: steamHeader(620), playtime_forever_minutes: 0 },
  { appid: 220, name: "Half-Life 2", image: steamHeader(220), playtime_forever_minutes: 75 },
  { appid: 292030, name: "The Witcher 3: Wild Hunt", image: steamHeader(292030), playtime_forever_minutes: 3120 },
  { appid: 1086940, name: "Baldur's Gate 3", image: steamHeader(1086940), playtime_forever_minutes: 0 },
  { appid: 632470, name: "Disco Elysium", image: steamHeader(632470), playtime_forever_minutes: 0 },
  { appid: 753640, name: "Outer Wilds", image: steamHeader(753640), playtime_forever_minutes: 30 },
  { appid: 304430, name: "INSIDE", image: steamHeader(304430), playtime_forever_minutes: 0 },
  { appid: 1426210, name: "It Takes Two", image: steamHeader(1426210), playtime_forever_minutes: 600 },
  { appid: 548430, name: "Deep Rock Galactic", image: steamHeader(548430), playtime_forever_minutes: 2100 },
  { appid: 892970, name: "Valheim", image: steamHeader(892970), playtime_forever_minutes: 840 },
  { appid: 550, name: "Left 4 Dead 2", image: steamHeader(550), playtime_forever_minutes: 1500 },
  { appid: 264710, name: "Subnautica", image: steamHeader(264710), playtime_forever_minutes: 0 },
  { appid: 646570, name: "Slay the Spire", image: steamHeader(646570), playtime_forever_minutes: 960 },
  { appid: 588650, name: "Dead Cells", image: steamHeader(588650), playtime_forever_minutes: 110 },
  { appid: 268910, name: "Cuphead", image: steamHeader(268910), playtime_forever_minutes: 0 },
  { appid: 391540, name: "Undertale", image: steamHeader(391540), playtime_forever_minutes: 0 },
  { appid: 1092790, name: "Inscryption", image: steamHeader(1092790), playtime_forever_minutes: 20 },
  { appid: 1794680, name: "Vampire Survivors", image: steamHeader(1794680), playtime_forever_minutes: 720 },
  { appid: 2379780, name: "Balatro", image: steamHeader(2379780), playtime_forever_minutes: 0 },
  { appid: 1966720, name: "Lethal Company", image: steamHeader(1966720), playtime_forever_minutes: 300 },
  { appid: 814380, name: "Sekiro: Shadows Die Twice", image: steamHeader(814380), playtime_forever_minutes: 0 },
  { appid: 782330, name: "DOOM Eternal", image: steamHeader(782330), playtime_forever_minutes: 480 },
  { appid: 489830, name: "The Elder Scrolls V: Skyrim Special Edition", image: steamHeader(489830), playtime_forever_minutes: 4200 },
  { appid: 1687950, name: "Persona 5 Royal", image: steamHeader(1687950), playtime_forever_minutes: 0 },
  { appid: 1055540, name: "A Short Hike", image: steamHeader(1055540), playtime_forever_minutes: 0 },
  { appid: 1135690, name: "Unpacking", image: steamHeader(1135690), playtime_forever_minutes: 60 },
  { appid: 383870, name: "Firewatch", image: steamHeader(383870), playtime_forever_minutes: 0 },
  { appid: 501300, name: "What Remains of Edith Finch", image: steamHeader(501300), playtime_forever_minutes: 0 },
  { appid: 653530, name: "Return of the Obra Dinn", image: steamHeader(653530), playtime_forever_minutes: 0 },
  { appid: 427520, name: "Factorio", image: steamHeader(427520), playtime_forever_minutes: 180 },
  { appid: 632360, name: "Risk of Rain 2", image: steamHeader(632360), playtime_forever_minutes: 0 },
  { appid: 728880, name: "Overcooked! 2", image: steamHeader(728880), playtime_forever_minutes: 95 },
];
