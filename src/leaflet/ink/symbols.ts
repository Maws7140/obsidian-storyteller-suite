/**
 * Map Ink symbol library: the stamps used for doors, stairs, settlements, sites,
 * terrain patterns and map markers.
 *
 * Every symbol is drawn on a 24 by 24 grid in the Lucide style: 1.75 stroke,
 * round caps and joins, 2 units of padding inside the grid. A body is inner SVG
 * markup that uses only currentColor and none, so the same glyph can be drawn in
 * any colour. The wrapper from symbolSvg() sets the stroke and fill defaults.
 *
 * Pure TypeScript: no Obsidian or DOM imports, and no imports from outside this folder.
 */

export type SymbolCategory = 'dungeon' | 'overland' | 'settlements' | 'sites' | 'nature' | 'markers';

export interface InkSymbol {
    id: string;
    name: string;
    category: SymbolCategory;
    keywords: string[];
    /** Inner SVG markup on a 24 by 24 viewBox. Colours: currentColor or none only. */
    body: string;
}

export const SYMBOL_CATEGORIES: readonly { id: SymbolCategory; name: string }[] = [
    { id: 'dungeon', name: 'Dungeon' },
    { id: 'overland', name: 'Overland' },
    { id: 'settlements', name: 'Settlements' },
    { id: 'sites', name: 'Sites' },
    { id: 'nature', name: 'Nature' },
    { id: 'markers', name: 'Markers' },
];

const DEFAULT_SIZE = 24;
const DEFAULT_STROKE_WIDTH = 1.75;
const COLOUR_PATTERN = /^[#a-zA-Z0-9(),.%\s/-]+$/;

function sym(id: string, name: string, category: SymbolCategory, keywords: string, body: string): InkSymbol {
    return {
        id,
        name,
        category,
        keywords: keywords.split(',').map(word => word.trim()).filter(word => word.length > 0),
        body,
    };
}

export const SYMBOLS: readonly InkSymbol[] = [
    // Dungeon: openings, level changes, traps and fixtures
    sym('door', 'Door', 'dungeon', 'way through, opening, entrance, gate, portal',
        '<path d="M2 12h5M17 12h5"/><rect x="7" y="8" width="10" height="8"/>'),
    sym('double', 'Double door', 'dungeon', 'double, pair, two doors, wide, twin',
        '<path d="M2 12h3M19 12h3"/><rect x="5" y="8" width="7" height="8"/><rect x="12" y="8" width="7" height="8"/>'),
    sym('window', 'Window', 'dungeon', 'window, see through, glass, climb, sill',
        '<path d="M2 12h5M17 12h5M7 12h10M7 9.5v5M17 9.5v5"/>'),
    sym('passage', 'Open passage', 'dungeon', 'gap, opening, archway, doorway, open, empty',
        '<path d="M2 12h5M17 12h5"/>'),
    sym('collapsed', 'Collapsed passage', 'dungeon', 'rubble, blocked, fallen, collapse, cave-in',
        '<path d="M2 12h5M17 12h5M7 12l2-3 2 6 2-6 2 6 2-3"/>'),
    sym('door-locked', 'Locked door', 'dungeon', 'locked, shut, bolted, lock, sealed, closed',
        '<path d="M2 12h5M17 12h5"/><rect x="7" y="8" width="10" height="8" fill="currentColor"/>'),
    sym('door-secret', 'Secret door', 'dungeon', 'secret, hidden, concealed, search, find, dashed',
        '<path d="M2 12h5M17 12h5"/><rect x="7" y="8" width="10" height="8" stroke-dasharray="2 1.6"/>'),
    sym('door-barred', 'Barred door', 'dungeon', 'barred, bars, portcullis, gate, grille, blocked',
        '<path d="M2 12h5M17 12h5M10 7.5v9M14 7.5v9"/>'),
    sym('door-trapped', 'Trapped door', 'dungeon', 'trapped, trap, danger, booby trap, snare, warning',
        '<path d="M2 12h5M17 12h5"/><rect x="7" y="8" width="10" height="8"/><path d="M12 18.5 9.2 21.5h5.6z" fill="currentColor"/>'),
    sym('door-oneway', 'One-way door', 'dungeon', 'one way, arrow, direction, only, push, exit',
        '<path d="M2 12h5M17 12h5M12 16.5V8M9.5 10.5 12 8l2.5 2.5"/>'),
    sym('stairs-up', 'Stairs up', 'dungeon', 'stairs, steps, ascend, up, climb, upper level',
        '<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M7 7.5h10M7 12h10M7 16.5h10"/>'),
    sym('stairs-down', 'Stairs down', 'dungeon', 'stairs, steps, descend, down, lower level',
        '<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M7 7.5h10M7 12h7M7 16.5h4"/>'),
    sym('spiral', 'Spiral stairs', 'dungeon', 'spiral, winding, stairs, turn, tower, twist',
        '<circle cx="12" cy="12" r="9"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6M12 9a3 3 0 1 0 3 3"/>'),
    sym('slope', 'Slope', 'dungeon', 'slope, ramp, chute, incline, steep, slide, down',
        '<path d="M6 6l6 4 6-4M6 11.5l6 4 6-4M6 17l6 4 6-4"/>'),
    sym('shaft', 'Shaft', 'dungeon', 'shaft, hole, vertical, drop, well, pit, plunge',
        '<circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>'),
    sym('shaft-up', 'Shaft overhead', 'dungeon', 'shaft, ceiling, up, hole, overhead, climb, rise',
        '<circle cx="11" cy="13" r="7"/><path d="M8 10l6 6M14 10l-6 6M19.5 9.5V3.5M17 6l2.5-2.5L22 6"/>'),
    sym('trap', 'Trap', 'dungeon', 'trap, danger, warning, hazard, snare, peril',
        '<path d="M12 4 21 19.5H3Z"/><path d="M12 10v4M12 16.8h.01"/>'),
    sym('pit', 'Pit', 'dungeon', 'pit, hole, drop, open, floor, chasm',
        '<rect x="3" y="3" width="18" height="18" rx="1"/><rect x="8" y="8" width="8" height="8" fill="currentColor"/>'),
    sym('pit-covered', 'Covered pit', 'dungeon', 'pit, covered, grate, lid, hidden, hole, cover',
        '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18"/>'),
    sym('trapdoor', 'Trapdoor', 'dungeon', 'trapdoor, hatch, floor, hole, pit cover',
        '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 12h6"/>'),
    sym('trapdoor-secret', 'Secret trapdoor', 'dungeon', 'trapdoor, secret, hidden, hatch, concealed, dashed',
        '<rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="2 1.6"/><path d="M9 12h6"/>'),
    sym('trapdoor-ceiling', 'Ceiling trapdoor', 'dungeon', 'trapdoor, ceiling, overhead, up, hatch, opens up',
        '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M12 16.5V8M9.5 10.5 12 8l2.5 2.5"/>'),
    sym('column', 'Column', 'dungeon', 'column, pillar, post, support, pillar',
        '<rect x="8" y="8" width="8" height="8" fill="currentColor"/>'),
    sym('statue', 'Statue', 'dungeon', 'statue, figure, sculpture, idol, effigy',
        '<circle cx="12" cy="12" r="9"/><path d="M12 7l1.2 3.3 3.5.15-2.7 2.2.9 3.4-2.9-2-2.9 2 .9-3.4-2.7-2.2 3.5-.15z"/>'),
    sym('well', 'Well', 'dungeon', 'well, fountain, water, spring, wellspring, basin',
        '<circle cx="12" cy="12" r="9"/><path d="M7 12q1.25-1.5 2.5 0t2.5 0t2.5 0t2.5 0"/>'),
    sym('altar', 'Altar', 'dungeon', 'altar, shrine, offering, sacred, table, worship',
        '<rect x="5" y="11" width="14" height="10"/><path d="M12 4v7M10 6.5h4"/>'),
    sym('light', 'Light', 'dungeon', 'light, brazier, torch, lamp, glow, crystal, lit, fire',
        '<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.34 6.34l2.12 2.12M15.54 15.54l2.12 2.12M6.34 17.66l2.12-2.12M15.54 8.46l2.12-2.12"/>'),

    // Overland: peaks, passes and crossings
    sym('peak', 'Peak', 'overland', 'peak, mountain, summit, high point, snow, named mountain',
        '<path d="M2.5 20 12 4l9.5 16z"/><path d="M9.5 9.5 12 4l2.5 5.5z" fill="currentColor"/>'),
    sym('pass', 'Pass', 'overland', 'pass, gap, mountain pass, saddle, col, way through hills',
        '<path d="M9 5Q3 12 9 19M15 5Q21 12 15 19"/>'),
    sym('bridge', 'Bridge', 'overland', 'bridge, crossing, span, deck, river crossing',
        '<rect x="9" y="5" width="6" height="14"/><path d="M2 12q1.75-1.5 3.5 0t3.5 0M15 12q1.75-1.5 3.5 0t3.5 0"/>'),
    sym('ford', 'Ford', 'overland', 'ford, shallows, wade, crossing, stepping stones, river',
        '<path d="M2 17q2.5-2 5 0t5 0t5 0t5 0"/><circle cx="7" cy="11" r="1.8" fill="currentColor"/><circle cx="12" cy="11" r="1.8" fill="currentColor"/><circle cx="17" cy="11" r="1.8" fill="currentColor"/>'),
    sym('ferry', 'Ferry', 'overland', 'ferry, boat, crossing, river, ship, sail',
        '<path d="M2 21q2.5-2 5 0t5 0t5 0t5 0"/><path d="M5 13h14l-2.5 4h-9z"/><path d="M12 13V4M12 4.5l5 2.5-5 2.5"/>'),

    // Settlements
    sym('homestead', 'Homestead', 'settlements', 'farm, house, dwelling, cottage, single house, homestead',
        '<path d="M5 20v-9l7-6 7 6v9z"/><path d="M10 20v-4h4v4"/>'),
    sym('hamlet', 'Hamlet', 'settlements', 'hamlet, small settlement, few houses, dot, cluster',
        '<circle cx="12" cy="12" r="4.5" fill="currentColor"/>'),
    sym('village', 'Village', 'settlements', 'village, settlement, small town, ring',
        '<circle cx="12" cy="12" r="8"/>'),
    sym('town', 'Town', 'settlements', 'town, settlement, large village, rings',
        '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/>'),
    sym('city', 'City', 'settlements', 'city, metropolis, large settlement, capital, rings',
        '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2.5"/>'),
    sym('castle', 'Castle', 'settlements', 'castle, keep, fortress, walls, gate, stronghold',
        '<path d="M4 20V8h4v2h2V8h4v2h2V8h4v12z"/><path d="M10 20v-4a2 2 0 0 1 4 0v4"/>'),
    sym('tower', 'Tower', 'settlements', 'tower, fort, watchtower, lone tower, battlements',
        '<path d="M8 21V5h3v2h2V5h3v16z"/><path d="M11 21v-4h2v4"/>'),
    sym('inn', 'Inn', 'settlements', 'inn, tavern, waystation, lodging, sign, rest, hostel',
        '<path d="M3 20v-9l7-6 7 6v9z"/><path d="M8 20v-4h4v4M16 9.5h5M20 9.5v2"/><rect x="18.5" y="11.5" width="3" height="3"/>'),
    sym('village-port', 'Village with port', 'settlements', 'port, harbour, anchor, coast, village, dock, quay',
        '<circle cx="9" cy="10" r="6"/><circle cx="18" cy="13.5" r="1.3"/><path d="M18 14.8V21M15.5 16.5h5M15 18.5q0 3 3 3t3-3"/>'),
    sym('town-port', 'Town with port', 'settlements', 'port, harbour, anchor, coast, town, dock, quay',
        '<circle cx="9" cy="10" r="6"/><circle cx="9" cy="10" r="3"/><circle cx="18" cy="13.5" r="1.3"/><path d="M18 14.8V21M15.5 16.5h5M15 18.5q0 3 3 3t3-3"/>'),
    sym('city-port', 'City with port', 'settlements', 'port, harbour, anchor, coast, city, dock, quay',
        '<circle cx="9" cy="10" r="6"/><circle cx="9" cy="10" r="3.8"/><circle cx="9" cy="10" r="1.6" fill="currentColor"/><circle cx="18" cy="13.5" r="1.3"/><path d="M18 14.8V21M15.5 16.5h5M15 18.5q0 3 3 3t3-3"/>'),

    // Sites: places of interest
    sym('entrance', 'Entrance', 'sites', 'entrance, cave, mine, dungeon entrance, way in, arch, link',
        '<path d="M5 21V11a7 7 0 0 1 14 0v10"/><path d="M10 21v-6h4v6" fill="currentColor"/>'),
    sym('ruin', 'Ruin', 'sites', 'ruin, broken wall, fallen, rubble, old building, decay',
        '<path d="M3 21V12h4V8l4 2 3.5-4L18 8v13"/>'),
    sym('tomb', 'Tomb', 'sites', 'tomb, grave, barrow, crypt, graveyard, cross, burial',
        '<path d="M7 21V11a5 5 0 0 1 10 0v10z"/><path d="M12 9v7M9.5 11.5h5"/>'),
    sym('stones', 'Standing stones', 'sites', 'standing stones, monument, henge, megalith, lintel, circle',
        '<rect x="5" y="10" width="4" height="11" fill="currentColor"/><rect x="15" y="10" width="4" height="11" fill="currentColor"/><rect x="3" y="6" width="18" height="3"/>'),
    sym('shrine', 'Shrine', 'sites', 'shrine, holy place, temple, torii, sacred, gate, chapel',
        '<path d="M3 9.5 12 4l9 5.5"/><path d="M7 10v11M17 10v11"/><circle cx="12" cy="15" r="1.5" fill="currentColor"/>'),
    sym('lair', 'Lair', 'sites', 'lair, den, nest, claws, monster, danger, beast, creature',
        '<path d="M6 5Q4 12 7.5 19M12 4Q10 12 13.5 20M18 5Q16 12 19.5 19"/>'),

    // Nature: terrain patterns and single features (pattern-friendly, kept off the edges)
    sym('water', 'Water', 'nature', 'water, sea, lake, ocean, pool, waves, wavy, sea',
        '<path d="M2 7q2.5-2 5 0t5 0t5 0t5 0M2 12q2.5-2 5 0t5 0t5 0t5 0M2 17q2.5-2 5 0t5 0t5 0t5 0"/>'),
    sym('plains', 'Plains', 'nature', 'plains, grassland, steppe, meadow, open country, field',
        '<path d="M7 18l-1.5-3.5M7 18V14.5M7 18l1.5-3.5M17 20l-1.5-3.5M17 20v-3.5M17 20l1.5-3.5"/>'),
    sym('forest', 'Forest', 'nature', 'forest, woods, trees, woodland, grove, wood',
        '<circle cx="8" cy="8" r="3.5"/><path d="M8 11.5V18"/><circle cx="16" cy="14" r="3.5"/><path d="M16 17.5V21"/>'),
    sym('jungle', 'Jungle', 'nature', 'jungle, palm trees, tropical, rainforest, palms',
        '<path d="M6 21Q4.5 17 7 14M7 14Q4 11 2.5 13M7 14Q10 11 11 13M7 14Q6.5 10.5 8 9M17 21Q15.5 17 18 14M18 14Q15 11 13 13M18 14Q21 11 22 13M18 14Q17.5 10.5 16 9"/>'),
    sym('hills', 'Hills', 'nature', 'hills, hillside, rolling hills, humps, downs, rise',
        '<path d="M2 19Q6.5 9 11 19M10 21Q15.5 11 21 21"/>'),
    sym('mountains', 'Mountains', 'nature', 'mountains, peaks, range, alps, high ground, rock',
        '<path d="M2 20 8 9l6 11M10 20l6-14 6 14"/>'),
    sym('desert', 'Desert', 'nature', 'desert, sand, dunes, dust, arid, wasteland',
        '<path d="M3 19Q8 13 13 19M11 21Q16 14 21 20"/><circle cx="8" cy="10" r="1" fill="currentColor"/><circle cx="16" cy="9" r="1" fill="currentColor"/><circle cx="12" cy="5.5" r="1" fill="currentColor"/>'),
    sym('swamp', 'Swamp', 'nature', 'swamp, marsh, bog, fen, wetland, reeds, mire',
        '<path d="M3 20h4M14 21h6M6 19v-8M9 19l-1-5M16 19v-7M19 19l-1.5-5"/>'),
    sym('ice', 'Ice', 'nature', 'ice, tundra, glacier, snowfield, frozen, frost',
        '<path d="M8 5v6M5.4 6.5l5.2 3M5.4 9.5l5.2-3M16 13v6M13.4 14.5l5.2 3M13.4 17.5l5.2-3"/>'),
    sym('wave', 'Wave', 'nature', 'wave, waves, sea, surf, ripple, water, swell',
        '<path d="M3 12q2.25-2.5 4.5 0t4.5 0t4.5 0t4.5 0"/>'),
    sym('tree', 'Tree', 'nature', 'tree, oak, broadleaf, deciduous, woods, canopy',
        '<circle cx="12" cy="9" r="6"/><path d="M12 15v6"/>'),
    sym('pine', 'Pine', 'nature', 'pine, conifer, evergreen, fir, spruce, tree',
        '<path d="M12 3 17 9h-2.5L19 14H5l4.5-5H7z"/><path d="M12 14v7"/>'),
    sym('palm', 'Palm', 'nature', 'palm, palm tree, tropical, coconut, beach, oasis',
        '<path d="M11 21Q9 15 12.5 9M12.5 9Q8 6 3.5 8M12.5 9Q17 6 21.5 8M12.5 9Q12 5 12.5 2.5"/>'),
    sym('hill', 'Hill', 'nature', 'hill, rise, mound, knoll, slope, rounded',
        '<path d="M3 19Q12 5 21 19"/>'),
    sym('mountain', 'Mountain', 'nature', 'mountain, peak, summit, alp, high, rocky',
        '<path d="M3 19 9.5 7.5 13 13l2.5-3.5L21 19z"/>'),
    sym('reeds', 'Reeds', 'nature', 'reeds, rushes, cattails, marsh, grass, swamp, bulrush',
        '<path d="M7 21V8M11 21V4M15 21V7M7 21q0-6-2-8M15 21q0-7 2-9"/>'),
    sym('rock', 'Rock', 'nature', 'rock, boulder, stone, cliff, outcrop, crag',
        '<path d="M4.5 18 6.5 11 11 8l6.5 1.5L19.5 14 18 18z"/><path d="M9 18l1.5-4.5L17 14"/>'),
    sym('dune', 'Dune', 'nature', 'dune, sand, desert, crescent, sand dune, drift',
        '<path d="M3 18Q11 8 21 16Q12 12 3 18Z"/>'),
    sym('grass', 'Grass', 'nature', 'grass, tuft, meadow, lawn, field, green',
        '<path d="M12 20V8M12 20Q8 14 6 9M12 20Q16 14 18 9"/>'),
    sym('snowflake', 'Snowflake', 'nature', 'snow, snowflake, frost, winter, cold, ice, flake',
        '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M10.6 4.4 12 3l1.4 1.4M10.6 19.6 12 21l1.4-1.4M4.7 9.4l-.5-1.9 1.9-.5M19.3 14.6l.5 1.9-1.9.5M6.1 17l-1.9-.5.5-1.9M17.9 7l1.9.5-.5 1.9"/>'),

    // Markers: pins, signs and written marks
    sym('pin', 'Pin', 'markers', 'pin, marker, location, place, point of interest, map pin',
        '<path d="M12 21C12 21 6 15.5 6 10a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>'),
    sym('star', 'Star', 'markers', 'star, favourite, notable, highlight, landmark, special',
        '<path d="M12 3l2.17 6.01 6.39.21-5.04 3.92 1.77 6.14-5.29-3.58-5.29 3.58 1.77-6.14-5.04-3.92 6.39-.21z"/>'),
    sym('flag', 'Flag', 'markers', 'flag, banner, claim, territory, marker, pennant, standard',
        '<path d="M5 21V3"/><path d="M5 4h13l-3 4.5 3 4.5H5"/>'),
    sym('skull', 'Skull', 'markers', 'skull, death, danger, poison, bones, dead, peril, deadly',
        '<path d="M4 11a8 8 0 0 1 16 0v3.5l-2 2.5v2.5H6V17l-2-2.5z"/><circle cx="9" cy="11" r="1.5" fill="currentColor"/><circle cx="15" cy="11" r="1.5" fill="currentColor"/><path d="M10 17v2.5M14 17v2.5"/>'),
    sym('x-mark', 'X mark', 'markers', 'x, cross, mark, marks the spot, wrong, no, blocked, cancel',
        '<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>'),
    sym('compass-rose', 'Compass rose', 'markers', 'compass, rose, direction, north, bearings, wind rose',
        '<circle cx="12" cy="12" r="9"/><path d="M12 5l2 7-2 7-2-7z"/><path d="M5 12h14"/><path d="M12 5l2 7h-4z" fill="currentColor"/>'),
    sym('scale-bar', 'Scale bar', 'markers', 'scale, distance, measure, ruler, miles, leagues, bar',
        '<rect x="3" y="14" width="9" height="3" fill="currentColor"/><path d="M3 15.5h18M3 12v7M12 12v7M21 12v7"/>'),
    sym('campfire', 'Campfire', 'markers', 'campfire, fire, camp, bonfire, rest, flame, camp site',
        '<path d="M12 4c1.5 2.5 4.5 4.5 4.5 8.5a4.5 4.5 0 0 1-9 0C7.5 9.5 10.5 7.5 12 4z"/><path d="M5 20.5 19 15.5M19 20.5 5 15.5"/>'),
    sym('treasure', 'Treasure', 'markers', 'treasure, chest, loot, hoard, reward, gold, cache',
        '<path d="M3 10V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v3"/><rect x="3" y="10" width="18" height="11" rx="1"/><path d="M3 14h18"/><rect x="10.5" y="12" width="3" height="4" fill="currentColor"/>'),
    sym('question', 'Question', 'markers', 'question, unknown, mystery, riddle, puzzle, quest, query',
        '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7v.5"/><path d="M12 17.5h.01"/>'),
    sym('exclamation', 'Exclamation', 'markers', 'exclamation, alert, danger, important, warning, attention, event',
        '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.5h.01"/>'),
    sym('crossed-swords', 'Crossed swords', 'markers', 'crossed swords, battle, combat, fight, war, enemy, encounter, swords',
        '<path d="M4.5 4.5 16 16M19.5 4.5 8 16M14 18l4-4M10 18l-4-4"/>'),
    sym('eye', 'Eye', 'markers', 'eye, watch, see, observe, vision, watcher, spy, sight',
        '<path d="M2 12Q12 3 22 12Q12 21 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
    sym('key', 'Key', 'markers', 'key, lock, unlock, door key, clue, access, opens',
        '<circle cx="7" cy="12" r="4"/><path d="M11 12h10M18 12v3M21 12v2"/>'),
    sym('north', 'North arrow', 'markers', 'north, arrow, direction, compass, orientation, up',
        '<path d="M8.5 7V2.5L15.5 7V2.5"/><path d="M12 11v10M8.5 14.5 12 11l3.5 3.5"/>'),
    sym('text', 'Text label', 'markers', 'text, label, name, words, caption, title, write in',
        '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
    sym('place-id', 'Room code', 'markers', 'room, hex, code, id, number, tag, cell, label, reference',
        '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M9.5 9.5v5M14.5 9.5v5M7.5 11h9M7.5 13.5h9"/>'),
];

const SYMBOLS_BY_ID: ReadonlyMap<string, InkSymbol> = new Map(
    SYMBOLS.map((symbol): [string, InkSymbol] => [symbol.id, symbol]),
);

const CATEGORY_NAMES: ReadonlyMap<SymbolCategory, string> = new Map(
    SYMBOL_CATEGORIES.map((category): [SymbolCategory, string] => [category.id, category.name]),
);

/** The symbol with this id, or undefined when there is none. */
export function getSymbol(id: string): InkSymbol | undefined {
    return SYMBOLS_BY_ID.get(id);
}

function searchTokens(symbol: InkSymbol): string[] {
    const categoryName = CATEGORY_NAMES.get(symbol.category) ?? '';
    const haystack = `${symbol.id} ${symbol.name} ${symbol.keywords.join(' ')} ${categoryName}`.toLowerCase();
    return haystack.split(/[^a-z0-9]+/).filter(token => token.length > 0);
}

/**
 * Symbols where every word of the query starts a word in the name, id, keywords
 * or category name. "secret door" finds Secret door but not Secret trapdoor's
 * "door" inside "trapdoor". An empty query returns every symbol in library order.
 */
export function searchSymbols(query: string): InkSymbol[] {
    const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 0);
    if (words.length === 0) return [...SYMBOLS];
    return SYMBOLS.filter(symbol => {
        const tokens = searchTokens(symbol);
        return words.every(word => tokens.some(token => token.indexOf(word) === 0));
    });
}

/** Every category in display order, with its symbols. Categories with no symbols are kept, empty. */
export function symbolsByCategory(): { category: { id: SymbolCategory; name: string }; symbols: InkSymbol[] }[] {
    return SYMBOL_CATEGORIES.map(category => ({
        category: { id: category.id, name: category.name },
        symbols: SYMBOLS.filter(symbol => symbol.category === category.id),
    }));
}

export interface SymbolSvgOptions {
    /** Rendered width and height in CSS pixels. Defaults to 24. */
    size?: number;
    /** Stroke and fill colour. Defaults to the surrounding CSS colour (currentColor). */
    color?: string;
    /** Stroke width in grid units. Defaults to 1.75. */
    strokeWidth?: number;
}

function escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * A complete SVG element for a symbol, with the Lucide-style wrapper attributes.
 * Returns an empty string for an unknown id. An invalid colour or size falls back to the default.
 */
export function symbolSvg(id: string, opts: SymbolSvgOptions = {}): string {
    const symbol = getSymbol(id);
    if (!symbol) return '';
    const size = typeof opts.size === 'number' && Number.isFinite(opts.size) && opts.size > 0 ? opts.size : DEFAULT_SIZE;
    const strokeWidth = typeof opts.strokeWidth === 'number' && Number.isFinite(opts.strokeWidth) && opts.strokeWidth > 0
        ? opts.strokeWidth
        : DEFAULT_STROKE_WIDTH;
    const colour = opts.color && COLOUR_PATTERN.test(opts.color) ? opts.color : '';
    const colourAttr = colour ? ` color="${escapeAttr(colour)}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"`
        + ` fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round"`
        + ` stroke-linejoin="round"${colourAttr} role="img" aria-label="${escapeAttr(symbol.name)}"`
        + ` data-symbol="${escapeAttr(symbol.id)}">${symbol.body}</svg>`;
}
