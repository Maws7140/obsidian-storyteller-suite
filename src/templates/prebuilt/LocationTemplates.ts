/**
 * Built-in Location Templates
 * Pre-configured single-entity location templates
 */

import { Template } from '../TemplateTypes';

export const MEDIEVAL_TAVERN_TEMPLATE: Template = {
    id: 'builtin-medieval-tavern',
    name: 'Medieval Tavern',
    description: 'A cozy tavern serving as a social hub for travelers and locals',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['tavern', 'inn', 'social', 'medieval', 'gathering'],
    entities: {
        locations: [{
            templateId: 'TAVERN_LOC_1',
            name: '',
            description: 'A warm and inviting establishment with a crackling fireplace, worn wooden tables, and the smell of hearty stew wafting from the kitchen. Travelers and locals alike gather here to share tales and warm their spirits.',
            history: 'This tavern has stood for generations, witnessing countless stories unfold within its walls. Many famous adventurers have passed through, leaving their mark on its legend.',
            locationType: 'Tavern',
            region: '',
            status: 'Active',
            customFields: {
                capacity: '40 patrons',
                specialty: 'Local ale and hearty stew',
                atmosphere: 'Warm and welcoming'
            }
        }]
    },
    entityTypes: ['location'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const ANCIENT_CASTLE_TEMPLATE: Template = {
    id: 'builtin-ancient-castle',
    name: 'Ancient Castle',
    description: 'A imposing stone fortress with towers and battlements',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['castle', 'fortress', 'nobility', 'medieval', 'stronghold'],
    entities: {
        locations: [{
            templateId: 'CASTLE_LOC_1',
            name: '',
            description: 'A massive stone fortress perched atop a strategic hill, its weathered walls bearing witness to centuries of siege and celebration. Towers reach toward the sky while banners flutter from the battlements.',
            history: 'Built during an age of constant warfare, this castle has served as both a symbol of power and a last refuge for the realm. Its dungeons hold dark secrets, while its great hall has hosted legendary feasts.',
            locationType: 'Castle',
            region: '',
            status: 'Occupied',
            customFields: {
                defenses: 'Thick walls, moat, drawbridge, towers',
                garrison: 'Royal guard and household knights',
                notable_features: 'Great hall, throne room, armory, dungeons'
            }
        }]
    },
    entityTypes: ['location'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const ENCHANTED_FOREST_TEMPLATE: Template = {
    id: 'builtin-enchanted-forest',
    name: 'Enchanted Forest',
    description: 'A mysterious woodland filled with magic and ancient secrets',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['forest', 'magical', 'nature', 'mysterious', 'wilderness'],
    entities: {
        locations: [{
            templateId: 'FOREST_LOC_1',
            name: '',
            description: 'Ancient trees stretch toward a canopy that filters sunlight into ethereal beams. The air hums with latent magic, and strange lights dance between the branches at twilight. Paths shift and change, confounding those who enter without respect.',
            history: 'Long before recorded history, this forest was old. The trees remember when the first peoples walked the land, and they guard secrets that predate civilization itself.',
            locationType: 'Forest',
            region: '',
            status: 'Untamed',
            customFields: {
                magical_properties: 'Reality-bending paths, sentient flora',
                inhabitants: 'Fey creatures, ancient spirits',
                danger_level: 'High for the unwary'
            }
        }]
    },
    entityTypes: ['location'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const BUSTLING_MARKETPLACE_TEMPLATE: Template = {
    id: 'builtin-bustling-marketplace',
    name: 'Bustling Marketplace',
    description: 'A vibrant trading hub filled with merchants and exotic goods',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['market', 'trade', 'city', 'commerce', 'social'],
    entities: {
        locations: [{
            templateId: 'MARKET_LOC_1',
            name: '',
            description: 'A cacophony of voices haggling over prices fills the air as merchants display their wares in colorful stalls. The smell of exotic spices mingles with fresh bread and leather goods. Every corner holds a new discovery.',
            history: 'This marketplace grew from a simple crossroads trading post into the commercial heart of the region. Merchants from distant lands converge here, making it a melting pot of cultures and goods.',
            locationType: 'Marketplace',
            region: '',
            status: 'Thriving',
            customFields: {
                goods_available: 'Food, weapons, armor, exotic items, magical reagents',
                peak_hours: 'Morning to midday',
                notable_merchants: 'Various specialized vendors'
            }
        }]
    },
    entityTypes: ['location'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const ANCIENT_RUINS_TEMPLATE: Template = {
    id: 'builtin-ancient-ruins',
    name: 'Ancient Ruins',
    description: 'Crumbling remnants of a lost civilization holding forgotten treasures',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['ruins', 'ancient', 'exploration', 'mystery', 'dungeon'],
    entities: {
        locations: [{
            templateId: 'RUINS_LOC_1',
            name: '',
            description: 'Weathered stone columns reach toward the sky like skeletal fingers, surrounding collapsed chambers half-buried in earth and vegetation. Faded murals hint at the glory that once was, while darkness pools in the depths below.',
            history: 'Once a magnificent temple or palace of a civilization now lost to time. What catastrophe befell its builders remains a mystery, but their legacy lingers in the form of hidden chambers, ancient traps, and treasures waiting to be discovered.',
            locationType: 'Ruins',
            region: '',
            status: 'Abandoned',
            customFields: {
                age: 'Thousands of years old',
                hazards: 'Unstable structures, ancient traps, guardians',
                treasures: 'Artifacts, knowledge, magical items'
            }
        }]
    },
    entityTypes: ['location'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const CYBERPUNK_NIGHTCLUB_TEMPLATE: Template = {
    id: 'builtin-cyberpunk-nightclub',
    name: 'Cyberpunk Nightclub',
    description: 'A neon-drenched underground club in a dystopian megacity',
    genre: 'scifi',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['nightclub', 'cyberpunk', 'underground', 'social', 'neon'],
    entities: {
        locations: [{
            templateId: 'CLUB_LOC_1',
            name: '',
            description: 'Pulsing neon lights cut through synthetic fog as bass thrums through the floor. Holographic displays advertise designer drugs while chrome-plated bouncers monitor the crowd. In the VIP section, deals that shape the city are made in whispered conversations.',
            history: 'Built in the shell of an old manufacturing plant, this club became the neutral ground where corporate agents, street gangs, and fixers conduct business. Everyone who matters in the underground scene passes through eventually.',
            locationType: 'Nightclub',
            region: '',
            status: 'Active',
            customFields: {
                owner: 'Anonymous syndicate',
                security: 'Armed bouncers, facial recognition, weapon scanners',
                services: 'Entertainment, black market connections, information brokering'
            }
        }]
    },
    entityTypes: ['location'],
    usageCount: 0,
    quickApplyEnabled: true
};

// Export all location templates
export const BUILTIN_LOCATION_TEMPLATES = [
    MEDIEVAL_TAVERN_TEMPLATE,
    ANCIENT_CASTLE_TEMPLATE,
    ENCHANTED_FOREST_TEMPLATE,
    BUSTLING_MARKETPLACE_TEMPLATE,
    ANCIENT_RUINS_TEMPLATE,
    CYBERPUNK_NIGHTCLUB_TEMPLATE
];

