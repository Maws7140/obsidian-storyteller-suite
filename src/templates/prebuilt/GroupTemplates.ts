/**
 * Built-in Group/Faction Templates
 * Pre-configured single-entity group and organization templates
 */

import { Template } from '../TemplateTypes';

export const THIEVES_GUILD_TEMPLATE: Template = {
    id: 'builtin-thieves-guild',
    name: 'Thieves Guild',
    description: 'A shadowy organization of rogues, smugglers, and criminals',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['guild', 'criminal', 'underground', 'faction', 'rogues'],
    entities: {
        groups: [{
            templateId: 'THIEVES_GROUP_1',
            id: '',
            storyId: '',
            name: '',
            description: 'A network of thieves, smugglers, and information brokers operating from the shadows. Members follow a strict code of conduct and share profits according to guild law.',
            groupType: 'guild',
            history: 'Founded generations ago by legendary thieves who realized cooperation was more profitable than competition. The guild has survived purges and crackdowns through careful planning and well-placed bribes.',
            structure: 'Hierarchical with a Guildmaster at the top, lieutenants managing districts, and specialists handling specific operations.',
            goals: 'Control the criminal underworld, accumulate wealth, protect members from authorities.',
            resources: 'Safehouses, fence networks, blackmail material, skilled operatives.',
            status: 'Active',
            motto: 'What\'s yours is mine, what\'s mine is hidden.',
            members: [],
            customFields: {
                influence: 'Extensive in urban areas',
                reputation: 'Feared and respected in criminal circles',
                services: 'Theft, smuggling, information gathering'
            }
        }]
    },
    entityTypes: ['group'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const KNIGHTLY_ORDER_TEMPLATE: Template = {
    id: 'builtin-knightly-order',
    name: 'Knightly Order',
    description: 'A prestigious military order bound by codes of honor',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['knights', 'military', 'honor', 'faction', 'nobility'],
    entities: {
        groups: [{
            templateId: 'KNIGHTS_GROUP_1',
            id: '',
            storyId: '',
            name: '',
            description: 'An elite brotherhood of warriors sworn to uphold justice and protect the realm. Members undergo rigorous training and adhere to a strict code of chivalry.',
            groupType: 'military',
            history: 'Established by a legendary hero to defend the kingdom against a great threat. The order has since become a symbol of martial excellence and noble virtue.',
            structure: 'Grand Master leads the order, with Knight Commanders overseeing regional chapters. Initiates must prove themselves before earning knighthood.',
            goals: 'Defend the innocent, uphold justice, maintain the peace.',
            resources: 'Fortresses, trained knights, noble patronage, sacred relics.',
            status: 'Active',
            militaryPower: 75,
            politicalInfluence: 60,
            motto: 'Honor above all.',
            members: [],
            customFields: {
                entry_requirements: 'Noble birth or exceptional valor',
                patron_deity: 'God of justice or warfare',
                notable_traditions: 'Vigil before knighting, sacred oaths'
            }
        }]
    },
    entityTypes: ['group'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const MERCHANT_CONSORTIUM_TEMPLATE: Template = {
    id: 'builtin-merchant-consortium',
    name: 'Merchant Consortium',
    description: 'A powerful alliance of wealthy traders and business interests',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['merchants', 'trade', 'economic', 'faction', 'commerce'],
    entities: {
        groups: [{
            templateId: 'MERCHANT_GROUP_1',
            id: '',
            storyId: '',
            name: '',
            description: 'A coalition of the wealthiest and most influential merchants, working together to control trade routes, set prices, and influence policy. Gold is their sword and contracts their shield.',
            groupType: 'organization',
            history: 'Formed when competing merchant families realized cooperation would be more profitable than cutthroat competition. They now wield economic power that rivals noble houses.',
            structure: 'Council of senior merchants makes major decisions, with specialized committees handling different trade sectors.',
            goals: 'Maximize profits, control trade, influence government policy.',
            resources: 'Vast wealth, trade networks, warehouses, ships, political connections.',
            status: 'Active',
            economicPower: 90,
            politicalInfluence: 70,
            motto: 'Prosperity through partnership.',
            members: [],
            customFields: {
                headquarters: 'Major trading hub',
                primary_goods: 'Varied - spices, textiles, metals, exotic goods',
                influence_methods: 'Lobbying, bribes, economic pressure'
            }
        }]
    },
    entityTypes: ['group'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const SECRET_CULT_TEMPLATE: Template = {
    id: 'builtin-secret-cult',
    name: 'Secret Cult',
    description: 'A hidden religious order pursuing forbidden knowledge or dark powers',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['cult', 'secret', 'religious', 'faction', 'dark'],
    entities: {
        groups: [{
            templateId: 'CULT_GROUP_1',
            id: '',
            storyId: '',
            name: '',
            description: 'A clandestine organization devoted to forbidden practices and dark worship. Members are bound by blood oaths and fear of terrible consequences for betrayal.',
            groupType: 'religious',
            history: 'Founded by those who discovered forbidden truths and sought power beyond mortal understanding. The cult has survived persecution by operating in absolute secrecy.',
            structure: 'High Priest leads secret ceremonies, with inner circle members knowing the full truth while outer members are kept ignorant of darker practices.',
            goals: 'Accumulate forbidden power, summon or serve dark entities, achieve transcendence.',
            resources: 'Hidden temples, devoted followers, forbidden artifacts, dark magic.',
            status: 'Active',
            motto: 'In darkness, truth. In sacrifice, power.',
            members: [],
            customFields: {
                deity_or_entity: 'Dark god, demon, or cosmic horror',
                initiation_rites: 'Blood oaths, forbidden knowledge revelation',
                public_facade: 'May appear as legitimate organization'
            }
        }]
    },
    entityTypes: ['group'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const REBEL_MOVEMENT_TEMPLATE: Template = {
    id: 'builtin-rebel-movement',
    name: 'Rebel Movement',
    description: 'A resistance organization fighting against oppressive authority',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['rebels', 'resistance', 'political', 'faction', 'freedom'],
    entities: {
        groups: [{
            templateId: 'REBEL_GROUP_1',
            id: '',
            storyId: '',
            name: '',
            description: 'A loose coalition of freedom fighters, idealists, and the oppressed united against tyranny. They strike from the shadows and vanish before retaliation comes.',
            groupType: 'political',
            history: 'Born from injustice when ordinary people could no longer endure oppression. What began as scattered resistance has grown into a coordinated movement.',
            structure: 'Cell-based organization to prevent infiltration. Leaders known only by code names, with limited contact between cells.',
            goals: 'Overthrow the tyrannical regime, establish just governance, protect the common people.',
            resources: 'Safe houses, sympathizers, guerrilla fighters, stolen supplies.',
            status: 'Active',
            militaryPower: 40,
            politicalInfluence: 30,
            motto: 'Freedom or death.',
            members: [],
            customFields: {
                tactics: 'Guerrilla warfare, sabotage, propaganda',
                support_base: 'Common people, disillusioned soldiers',
                primary_enemy: 'Current regime and its enforcers'
            }
        }]
    },
    entityTypes: ['group'],
    usageCount: 0,
    quickApplyEnabled: true
};

// Export all group templates
export const BUILTIN_GROUP_TEMPLATES = [
    THIEVES_GUILD_TEMPLATE,
    KNIGHTLY_ORDER_TEMPLATE,
    MERCHANT_CONSORTIUM_TEMPLATE,
    SECRET_CULT_TEMPLATE,
    REBEL_MOVEMENT_TEMPLATE
];

