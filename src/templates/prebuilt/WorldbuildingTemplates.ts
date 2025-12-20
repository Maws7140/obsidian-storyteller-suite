/**
 * Built-in Worldbuilding Templates
 * Pre-configured templates for Culture, Economy, and MagicSystem entities
 */

import { Template } from '../TemplateTypes';

// ============================================
// CULTURE TEMPLATES
// ============================================

export const MEDIEVAL_FEUDAL_CULTURE_TEMPLATE: Template = {
    id: 'builtin-medieval-feudal-culture',
    name: 'Medieval Feudal Culture',
    description: 'A hierarchical society based on land ownership and noble obligations',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['culture', 'medieval', 'feudal', 'european', 'nobility'],
    entities: {
        cultures: [{
            templateId: 'FEUDAL_CULTURE_1',
            yamlContent: `name: ""
languages: ["Common tongue", "High speech for nobility", "Church Latin"]
techLevel: "medieval"
governmentType: "monarchy"
status: "thriving"
calendar: "Based on religious festivals and seasons"
warfare: "Knights in armor, siege warfare, levied peasants"
art_forms: "Illuminated manuscripts, tapestries, heraldry"`,
            markdownContent: `## Description

A stratified society where nobility rules over peasant farmers, bound together by oaths of fealty and tradition. Honor, land, and lineage determine one's place in the world.

## Values

Honor, loyalty, family lineage, martial prowess, religious devotion.

## Religion

A dominant church with significant political power, local saints and shrines, religious festivals marking the seasons.

## Social Structure

King/Queen at apex, followed by high nobility (dukes, counts), lesser nobility (barons, knights), clergy, merchants, and peasants at the base.

## History

Emerged from the chaos following the fall of an ancient empire, when local strongmen offered protection in exchange for service and loyalty.

## Naming Conventions

First name followed by family name or place of origin. Nobility use titles and house names.

## Customs

Tournaments and jousting, feasting in great halls, arranged marriages for alliance, primogeniture inheritance.`
        }]
    },
    entityTypes: ['culture'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const NOMADIC_TRIBAL_CULTURE_TEMPLATE: Template = {
    id: 'builtin-nomadic-tribal-culture',
    name: 'Nomadic Tribal Culture',
    description: 'A mobile society following herds and seasons across vast territories',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['culture', 'nomadic', 'tribal', 'wilderness', 'horses'],
    entities: {
        cultures: [{
            templateId: 'NOMAD_CULTURE_1',
            yamlContent: `name: ""
languages: ["Steppe tongue", "Trade pidgin"]
techLevel: "bronze age"
governmentType: "tribal"
status: "thriving"
economy: "Herding, raiding, trade"
warfare: "Horse archery, lightning raids"
sacred_animals: "Horses, eagles, wolves"`,
            markdownContent: `## Description

A proud people who follow the great herds across endless steppes. They live by the horse and bow, respecting strength and wisdom above birth or wealth.

## Values

Freedom, hospitality, martial skill, ancestor reverence, harmony with nature.

## Religion

Shamanic traditions, ancestor spirits, nature deities, sky worship.

## Social Structure

Clans led by chiefs, united under a Great Khan in times of need. Status earned through deeds, not birth.

## History

Ancient people of the grasslands who have resisted all attempts at conquest, their mobility and archery making them masters of their domain.

## Naming Conventions

Personal name plus clan name. Earned titles replace birth names for great deeds.

## Customs

Seasonal gatherings for trade and marriage, horse racing competitions, ritual hunts, storytelling around campfires.`
        }]
    },
    entityTypes: ['culture'],
    usageCount: 0,
    quickApplyEnabled: true
};

// ============================================
// ECONOMY TEMPLATES
// ============================================

export const FEUDAL_ECONOMY_TEMPLATE: Template = {
    id: 'builtin-feudal-economy',
    name: 'Feudal Economy',
    description: 'An agricultural economy based on land ownership and peasant labor',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['economy', 'feudal', 'agricultural', 'medieval', 'trade'],
    entities: {
        economies: [{
            templateId: 'FEUDAL_ECON_1',
            yamlContent: `name: ""
economicSystem: "feudal"
status: "stable"
currencies:
  - name: "Gold Crown"
    exchangeRate: 1
    description: "Royal currency for major transactions"
  - name: "Silver Penny"
    exchangeRate: 0.1
    description: "Common currency for daily use"
  - name: "Copper Farthing"
    exchangeRate: 0.01
    description: "Smallest denomination"
resources:
  - name: "Grain"
    availability: "abundant"
    description: "Staple food crop"
  - name: "Iron"
    availability: "common"
    description: "For tools and weapons"
  - name: "Wool"
    availability: "common"
    description: "Major trade good"
tradeRoutes:
  - name: "King's Road"
    origin: "Capital"
    destination: "Port City"
    goods: ["Wool", "Grain", "Iron goods"]
wealth_distribution: "Highly concentrated among nobility and church"
social_mobility: "Very limited - birth determines occupation"
major_exports: "Wool, grain, timber"`,
            markdownContent: `## Description

An economy where land is wealth and peasants work fields they can never own. Trade exists but is secondary to agricultural production and noble obligations.

## Industries

Agriculture dominates, with localized crafts (blacksmithing, weaving, pottery) serving immediate needs. Guilds control urban production.

## Taxation

Peasants owe portion of harvest to lords, lords owe military service to crown. Church collects tithes. Toll roads and market taxes.`
        }]
    },
    entityTypes: ['economy'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const MERCANTILE_ECONOMY_TEMPLATE: Template = {
    id: 'builtin-mercantile-economy',
    name: 'Mercantile Economy',
    description: 'A trade-focused economy where merchants wield significant power',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['economy', 'mercantile', 'trade', 'commerce', 'banking'],
    entities: {
        economies: [{
            templateId: 'MERCANTILE_ECON_1',
            yamlContent: `name: ""
economicSystem: "market"
status: "growing"
currencies:
  - name: "Trade Ducat"
    exchangeRate: 1
    description: "Standardized gold coin accepted everywhere"
  - name: "Silver Mark"
    exchangeRate: 0.2
    description: "Regional currency"
  - name: "Letters of Credit"
    exchangeRate: 1
    description: "Banking instruments for large transactions"
resources:
  - name: "Spices"
    availability: "rare"
    value: "High"
    description: "Imported luxury goods"
  - name: "Silk"
    availability: "rare"
    value: "High"
    description: "Luxury fabric"
  - name: "Salt"
    availability: "common"
    value: "Moderate"
    description: "Essential for preservation"
tradeRoutes:
  - name: "Spice Route"
    origin: "Eastern Lands"
    destination: "Trading Hub"
    goods: ["Spices", "Silk", "Gems"]
  - name: "Northern Trade"
    origin: "Trading Hub"
    destination: "Northern Kingdoms"
    goods: ["Manufactured goods", "Wine", "Salt"]
banking_services: "Loans, currency exchange, safe deposit"
trade_wars: "Common between rival merchant houses"
insurance: "Maritime insurance for shipping"`,
            markdownContent: `## Description

An economy where trade is king and merchants rival nobility in power. Banks, trading companies, and guilds drive prosperity while ships carry wealth across seas.

## Industries

Shipbuilding, banking, textile production, luxury goods manufacturing. Strong guild system controls quality and prices.

## Taxation

Import/export duties, merchant licenses, property taxes. Relatively low compared to feudal systems to encourage trade.`
        }]
    },
    entityTypes: ['economy'],
    usageCount: 0,
    quickApplyEnabled: true
};

// ============================================
// MAGIC SYSTEM TEMPLATES
// ============================================

export const ELEMENTAL_MAGIC_TEMPLATE: Template = {
    id: 'builtin-elemental-magic',
    name: 'Elemental Magic',
    description: 'A magic system based on commanding the fundamental forces of nature',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['magic', 'elemental', 'nature', 'wizardry', 'spells'],
    entities: {
        magicSystems: [{
            templateId: 'ELEMENTAL_MAGIC_1',
            yamlContent: `name: ""
systemType: "elemental"
rarity: "uncommon"
powerLevel: "moderate"
status: "active"
categories:
  - name: "Pyromancy"
    description: "Fire and heat magic"
    difficulty: "moderate"
  - name: "Hydromancy"
    description: "Water and ice magic"
    difficulty: "moderate"
  - name: "Geomancy"
    description: "Earth and stone magic"
    difficulty: "hard"
  - name: "Aeromancy"
    description: "Air and lightning magic"
    difficulty: "hard"
abilities:
  - name: "Fireball"
    category: "Pyromancy"
    powerLevel: 5
    cost: "Moderate fatigue"
    description: "Launch explosive fire"
  - name: "Ice Shield"
    category: "Hydromancy"
    powerLevel: 4
    cost: "Low fatigue"
    description: "Create protective ice barrier"
  - name: "Stone Skin"
    category: "Geomancy"
    powerLevel: 6
    cost: "High fatigue"
    description: "Harden skin like stone"
consistencyRules:
  - name: "Conservation of Energy"
    description: "Cannot create energy from nothing - must draw from surroundings or self"
    priority: "critical"
  - name: "Elemental Opposition"
    description: "Opposing elements (fire/water, earth/air) cannot be used simultaneously"
    priority: "important"
common_practitioners: "Battle mages, elementalists, druids"
magical_items: "Elemental focuses, enchanted staffs"
legendary_spells: "Meteor strike, tsunami wave, earthquake"`,
            markdownContent: `## Description

Magic that draws upon the primal elements - fire, water, earth, and air. Practitioners attune themselves to one or more elements, channeling raw natural forces.

## Rules

Mages must attune to elements through meditation and study. Stronger effects require more energy. Opposing elements are difficult to combine.

## Source

The elemental planes that underlie physical reality. Raw elemental energy flows through ley lines and concentrates in natural phenomena.

## Costs

Mental fatigue, physical exhaustion. Overuse can cause elemental backlash - frostbite from ice magic, burns from fire.

## Limitations

Effectiveness depends on environmental conditions. Fire magic weakens underwater. Earth magic struggles in the air. Requires concentration.

## Training

Apprenticeship with master mages, academy education, or self-discovery through natural affinity.

## History

As old as civilization itself, elemental magic was the first sorcery mastered by mortals who observed and mimicked natural forces.`
        }]
    },
    entityTypes: ['magicSystem'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const DIVINE_MAGIC_TEMPLATE: Template = {
    id: 'builtin-divine-magic',
    name: 'Divine Magic',
    description: 'Holy power granted by deities to their faithful servants',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['magic', 'divine', 'holy', 'clerical', 'faith'],
    entities: {
        magicSystems: [{
            templateId: 'DIVINE_MAGIC_1',
            yamlContent: `name: ""
systemType: "divine"
rarity: "uncommon"
powerLevel: "moderate"
status: "active"
categories:
  - name: "Healing"
    description: "Restoration and curing"
    difficulty: "easy"
  - name: "Protection"
    description: "Wards and blessings"
    difficulty: "moderate"
  - name: "Smiting"
    description: "Holy wrath against evil"
    difficulty: "moderate"
  - name: "Divination"
    description: "Seeking divine guidance"
    difficulty: "hard"
abilities:
  - name: "Lay on Hands"
    category: "Healing"
    powerLevel: 4
    cost: "Daily limit"
    description: "Heal wounds through touch"
  - name: "Turn Undead"
    category: "Smiting"
    powerLevel: 5
    cost: "Holy symbol required"
    description: "Repel undead with divine light"
  - name: "Divine Shield"
    category: "Protection"
    powerLevel: 6
    cost: "Concentration"
    description: "Protective barrier of holy energy"
consistencyRules:
  - name: "Faith Requirement"
    description: "Power scales with genuine faith - doubt weakens miracles"
    priority: "critical"
  - name: "Divine Will"
    description: "Cannot perform miracles opposed to deity's nature"
    priority: "critical"
common_practitioners: "Clerics, priests, paladins, prophets"
holy_symbols: "Required focus for channeling"
forbidden_acts: "Vary by deity - murder, lies, etc."`,
            markdownContent: `## Description

Power channeled from divine beings through faith and devotion. Clerics, priests, and paladins serve as conduits for their deity's will.

## Rules

Power flows from deity to worshipper based on faith and adherence to divine principles. Miracles are requests granted, not spells commanded.

## Source

The gods themselves, channeling their power through the faithful. Different deities grant different types of miracles.

## Costs

Divine favor - must maintain faith and follow deity's tenets. Sins can block divine power until atonement.

## Limitations

Cannot be used against deity's will. Holy symbols required as focus. Acts against faith can revoke powers.

## Training

Religious instruction, ordination ceremonies, years of devoted service. Some receive spontaneous calling.

## History

Since mortals first prayed, the gods have answered. Divine magic is as old as faith itself.`
        }]
    },
    entityTypes: ['magicSystem'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const RUNIC_MAGIC_TEMPLATE: Template = {
    id: 'builtin-runic-magic',
    name: 'Runic Magic',
    description: 'Ancient power encoded in mystical symbols and inscriptions',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['magic', 'runes', 'inscription', 'enchantment', 'ancient'],
    entities: {
        magicSystems: [{
            templateId: 'RUNIC_MAGIC_1',
            yamlContent: `name: ""
systemType: "runic"
rarity: "rare"
powerLevel: "high"
status: "active"
materials: ["Enchanted ink", "Runestones", "Sacred metals", "Dragon blood"]
categories:
  - name: "Warding"
    description: "Protective inscriptions"
    difficulty: "moderate"
  - name: "Binding"
    description: "Containment and restriction"
    difficulty: "hard"
  - name: "Enchantment"
    description: "Imbuing objects with power"
    difficulty: "hard"
  - name: "True Names"
    description: "Command through naming"
    difficulty: "master"
abilities:
  - name: "Rune of Shielding"
    category: "Warding"
    powerLevel: 5
    cost: "Carved stone required"
    description: "Create protective ward"
  - name: "Binding Circle"
    category: "Binding"
    powerLevel: 7
    cost: "Blood and silver"
    description: "Trap entities within"
  - name: "Weapon Enchantment"
    category: "Enchantment"
    powerLevel: 6
    cost: "Rare materials"
    description: "Grant magical properties to weapons"
consistencyRules:
  - name: "Precision Required"
    description: "Even small errors in rune carving cause failure or dangerous effects"
    priority: "critical"
  - name: "Material Limitations"
    description: "Runes must be carved into physical medium - cannot exist in pure energy"
    priority: "important"
common_practitioners: "Runesmiths, enchanters, artificers"
rune_alphabets: "Multiple ancient systems with different powers"
permanent_vs_temporary: "Carved runes last; drawn runes are temporary"`,
            markdownContent: `## Description

Power contained within ancient symbols, carved or drawn with precise patterns. Runes store magic for later release, enabling even non-mages to use enchanted items.

## Rules

Each rune has specific meaning and effect. Combinations create complex effects. Precision is critical - flawed runes fail or backfire.

## Source

The runes themselves are said to be fragments of the language used to create the world. They tap into fundamental reality.

## Costs

Time and materials for inscription. Activation may require blood, sacrifice, or spoken words of power.

## Limitations

Must be physically inscribed. Complex effects require many runes. Runes can be damaged or erased.

## Training

Years of study memorizing rune meanings and combinations. Mathematical precision required.

## History

Discovered carved into ancient monoliths predating known civilizations. Scholars have spent millennia deciphering their secrets.`
        }]
    },
    entityTypes: ['magicSystem'],
    usageCount: 0,
    quickApplyEnabled: true
};

// Export all worldbuilding templates by type
export const BUILTIN_CULTURE_TEMPLATES = [
    MEDIEVAL_FEUDAL_CULTURE_TEMPLATE,
    NOMADIC_TRIBAL_CULTURE_TEMPLATE
];

export const BUILTIN_ECONOMY_TEMPLATES = [
    FEUDAL_ECONOMY_TEMPLATE,
    MERCANTILE_ECONOMY_TEMPLATE
];

export const BUILTIN_MAGIC_SYSTEM_TEMPLATES = [
    ELEMENTAL_MAGIC_TEMPLATE,
    DIVINE_MAGIC_TEMPLATE,
    RUNIC_MAGIC_TEMPLATE
];

// Combined export for convenience
export const BUILTIN_WORLDBUILDING_TEMPLATES = [
    ...BUILTIN_CULTURE_TEMPLATES,
    ...BUILTIN_ECONOMY_TEMPLATES,
    ...BUILTIN_MAGIC_SYSTEM_TEMPLATES
];

