/**
 * Built-in Event Templates
 * Pre-configured single-entity event templates
 */

import { Template } from '../TemplateTypes';

export const EPIC_BATTLE_TEMPLATE: Template = {
    id: 'builtin-epic-battle',
    name: 'Epic Battle',
    description: 'A climactic confrontation between opposing forces',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['battle', 'combat', 'war', 'climax', 'action'],
    entities: {
        events: [{
            templateId: 'BATTLE_EVT_1',
            name: '',
            description: 'A decisive military engagement where the fate of nations hangs in the balance. Armies clash on blood-soaked fields as heroes and villains meet in combat that will be remembered for generations.',
            outcome: 'The battle concludes with significant losses on both sides, forever changing the political landscape and the lives of all who fought.',
            status: 'Planned',
            isMilestone: true,
            customFields: {
                scale: 'Large-scale military engagement',
                stakes: 'Control of territory, political power',
                duration: 'Several hours to multiple days'
            }
        }]
    },
    entityTypes: ['event'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const ROYAL_CELEBRATION_TEMPLATE: Template = {
    id: 'builtin-royal-celebration',
    name: 'Royal Celebration',
    description: 'A grand feast or festival marking an important occasion',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['celebration', 'feast', 'social', 'nobility', 'gathering'],
    entities: {
        events: [{
            templateId: 'CELEBRATION_EVT_1',
            name: '',
            description: 'The great hall blazes with candlelight as nobles and dignitaries gather for a magnificent feast. Musicians play, dancers perform, and political alliances are forged over cups of fine wine. Beneath the merriment, intrigue simmers.',
            outcome: 'The celebration provides opportunities for social advancement, secret meetings, and the planting of seeds that will bloom into future conflicts or alliances.',
            status: 'Planned',
            isMilestone: false,
            customFields: {
                occasion: 'Victory, wedding, coronation, or seasonal festival',
                attendees: 'Nobility, foreign dignitaries, important figures',
                entertainment: 'Music, dancing, tournaments, performances'
            }
        }]
    },
    entityTypes: ['event'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const MYSTERIOUS_DISCOVERY_TEMPLATE: Template = {
    id: 'builtin-mysterious-discovery',
    name: 'Mysterious Discovery',
    description: 'The uncovering of a hidden secret or ancient artifact',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['discovery', 'mystery', 'artifact', 'revelation', 'exploration'],
    entities: {
        events: [{
            templateId: 'DISCOVERY_EVT_1',
            name: '',
            description: 'After extensive searching or by sheer chance, something long hidden comes to light. Ancient texts reveal forbidden knowledge, a sealed chamber opens, or an artifact of immense power is found. Nothing will be the same.',
            outcome: 'The discovery sets in motion a chain of events as various factions seek to claim, destroy, or understand what has been found.',
            status: 'Planned',
            isMilestone: true,
            customFields: {
                discovery_type: 'Artifact, knowledge, location, or truth',
                significance: 'World-changing implications',
                immediate_effects: 'Shifts in power, new quests, dangerous attention'
            }
        }]
    },
    entityTypes: ['event'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const SHOCKING_BETRAYAL_TEMPLATE: Template = {
    id: 'builtin-shocking-betrayal',
    name: 'Shocking Betrayal',
    description: 'A trusted ally reveals their true allegiance',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['betrayal', 'twist', 'drama', 'conflict', 'revelation'],
    entities: {
        events: [{
            templateId: 'BETRAYAL_EVT_1',
            name: '',
            description: 'At the worst possible moment, someone thought to be a loyal friend or ally reveals their true colors. Plans are exposed, secrets are sold, and trust is shattered in an instant of devastating revelation.',
            outcome: 'The betrayal leaves deep wounds, forcing survivors to question everything they thought they knew while dealing with the immediate fallout.',
            status: 'Planned',
            isMilestone: true,
            customFields: {
                betrayer_motivation: 'Power, revenge, ideology, or survival',
                victims: 'Those who trusted the betrayer',
                consequences: 'Loss of resources, lives, or strategic position'
            }
        }]
    },
    entityTypes: ['event'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const PERILOUS_JOURNEY_TEMPLATE: Template = {
    id: 'builtin-perilous-journey',
    name: 'Perilous Journey',
    description: 'A dangerous expedition across treacherous terrain',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['journey', 'travel', 'adventure', 'exploration', 'quest'],
    entities: {
        events: [{
            templateId: 'JOURNEY_EVT_1',
            name: '',
            description: 'The travelers set forth on a path fraught with danger. Whether crossing mountain passes, navigating hostile territories, or traversing magical wastelands, every step brings new challenges and opportunities for heroism.',
            outcome: 'The journey transforms all who survive it, forging bonds of fellowship and revealing the true character of each participant.',
            status: 'Planned',
            isMilestone: false,
            customFields: {
                destination: 'A distant goal requiring significant travel',
                hazards: 'Natural dangers, hostile creatures, enemy forces',
                duration: 'Days to months depending on distance'
            }
        }]
    },
    entityTypes: ['event'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const MURDER_INVESTIGATION_TEMPLATE: Template = {
    id: 'builtin-murder-investigation',
    name: 'Murder Investigation',
    description: 'The discovery of a crime that demands answers',
    genre: 'mystery',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['murder', 'mystery', 'investigation', 'crime', 'detective'],
    entities: {
        events: [{
            templateId: 'MURDER_EVT_1',
            name: '',
            description: 'A body is discovered under suspicious circumstances. As investigators piece together the victim\'s final hours, they uncover a web of secrets, lies, and motives that implicate multiple suspects.',
            outcome: 'The investigation reveals not just the murderer, but hidden truths about the victim and the community that will have lasting repercussions.',
            status: 'Planned',
            isMilestone: true,
            customFields: {
                victim: 'To be determined',
                suspects: 'Multiple parties with means, motive, and opportunity',
                clues: 'Physical evidence, witness testimony, hidden connections'
            }
        }]
    },
    entityTypes: ['event'],
    usageCount: 0,
    quickApplyEnabled: true
};

// Export all event templates
export const BUILTIN_EVENT_TEMPLATES = [
    EPIC_BATTLE_TEMPLATE,
    ROYAL_CELEBRATION_TEMPLATE,
    MYSTERIOUS_DISCOVERY_TEMPLATE,
    SHOCKING_BETRAYAL_TEMPLATE,
    PERILOUS_JOURNEY_TEMPLATE,
    MURDER_INVESTIGATION_TEMPLATE
];

