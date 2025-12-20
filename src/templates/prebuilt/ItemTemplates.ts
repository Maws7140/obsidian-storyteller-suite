/**
 * Built-in Item Templates
 * Pre-configured single-entity item (PlotItem) templates
 */

import { Template } from '../TemplateTypes';

export const LEGENDARY_SWORD_TEMPLATE: Template = {
    id: 'builtin-legendary-sword',
    name: 'Legendary Sword',
    description: 'A mythical blade of immense power and storied history',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['weapon', 'sword', 'legendary', 'magical', 'artifact'],
    entities: {
        items: [{
            templateId: 'SWORD_ITEM_1',
            yamlContent: `name: ""
isPlotCritical: true
material: "Enchanted steel, dragon bone hilt"
abilities: "Enhanced cutting power, magical resistance"
curse_or_blessing: "Only responds to those deemed worthy"`,
            markdownContent: `## Description

A blade of extraordinary craftsmanship that gleams with an inner light. Runes etched along its length pulse with ancient magic, and it feels perfectly balanced in the hand of its destined wielder.

## History

Forged in ages past by master smiths using techniques now lost to time, this sword has been wielded by heroes throughout history. Each bearer has added to its legend, and it is said to choose its own master.`
        }]
    },
    entityTypes: ['item'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const ANCIENT_TOME_TEMPLATE: Template = {
    id: 'builtin-ancient-tome',
    name: 'Ancient Tome',
    description: 'A book containing forbidden knowledge or powerful spells',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['book', 'knowledge', 'magical', 'artifact', 'forbidden'],
    entities: {
        items: [{
            templateId: 'TOME_ITEM_1',
            yamlContent: `name: ""
isPlotCritical: true
contents: "Forbidden spells, lost history, prophecies"
danger_level: "High - corrupting influence"
protection: "Magical locks, guardian enchantments"`,
            markdownContent: `## Description

Bound in weathered leather that seems to absorb light, this tome is filled with dense script in an ancient language. Some pages are blank to most eyes but reveal their secrets to those who know the proper rituals.

## History

Written by a powerful sorcerer who sought to preserve dangerous knowledge, this tome has been hidden, stolen, and fought over for centuries. Many who have read its contents have been changed forever.`
        }]
    },
    entityTypes: ['item'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const ROYAL_CROWN_TEMPLATE: Template = {
    id: 'builtin-royal-crown',
    name: 'Royal Crown',
    description: 'A symbol of legitimate rule and sovereign power',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['crown', 'royalty', 'symbol', 'power', 'political'],
    entities: {
        items: [{
            templateId: 'CROWN_ITEM_1',
            yamlContent: `name: ""
isPlotCritical: true
materials: "Gold, precious gems, ancient metals"
symbolic_power: "Legitimacy, divine right, authority"
magical_properties: "May grant wisdom or protection to true rulers"`,
            markdownContent: `## Description

A masterwork of the jeweler's art, this crown is set with precious gems that catch the light with every movement. More than mere decoration, it is the physical embodiment of the right to rule.

## History

Passed down through generations of rulers, this crown has witnessed the rise and fall of dynasties. To possess it is to hold a claim to the throne that many would kill for.`
        }]
    },
    entityTypes: ['item'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const MYSTERIOUS_KEY_TEMPLATE: Template = {
    id: 'builtin-mysterious-key',
    name: 'Mysterious Key',
    description: 'A key that opens something of great importance',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['key', 'mystery', 'unlock', 'quest', 'artifact'],
    entities: {
        items: [{
            templateId: 'KEY_ITEM_1',
            yamlContent: `name: ""
isPlotCritical: true
material: "Unknown alloy, possibly magical"
unlocks: "Unknown - requires investigation"
clues: "Symbols match ancient ruins or prophecy"`,
            markdownContent: `## Description

An ornate key of unusual design, crafted from a metal that never tarnishes. Its teeth form a pattern that seems to shift when viewed from different angles, and it is warm to the touch.

## History

The lock this key opens has been lost to memory, but legends speak of a sealed vault, a forbidden door, or a prison meant to hold something terrible. Finding what it unlocks may be a blessing or a curse.`
        }]
    },
    entityTypes: ['item'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const HEALING_POTION_TEMPLATE: Template = {
    id: 'builtin-healing-potion',
    name: 'Healing Potion',
    description: 'A magical elixir that restores health and vitality',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['potion', 'healing', 'consumable', 'magical', 'alchemy'],
    entities: {
        items: [{
            templateId: 'POTION_ITEM_1',
            yamlContent: `name: ""
isPlotCritical: false
ingredients: "Rare herbs, phoenix tears, blessed water"
effects: "Rapid healing of wounds, restoration of energy"
side_effects: "None when properly brewed"`,
            markdownContent: `## Description

A crystal vial containing a luminescent red liquid that swirls with its own inner light. The potion smells faintly of herbs and honey, and a single sip can close wounds and restore strength.

## History

Brewed by skilled alchemists using rare ingredients, healing potions are valuable commodities in a world where injury and illness are constant threats.`
        }]
    },
    entityTypes: ['item'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const CURSED_ARTIFACT_TEMPLATE: Template = {
    id: 'builtin-cursed-artifact',
    name: 'Cursed Artifact',
    description: 'A powerful but dangerous object bearing a dark enchantment',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['artifact', 'cursed', 'dangerous', 'magical', 'dark'],
    entities: {
        items: [{
            templateId: 'CURSED_ITEM_1',
            yamlContent: `name: ""
isPlotCritical: true
curse_effects: "Misfortune, corruption, obsession"
benefits: "Enhanced abilities or forbidden knowledge"
breaking_the_curse: "Requires specific conditions or sacrifice"`,
            markdownContent: `## Description

An object of dark beauty that draws the eye despite an instinctive sense of wrongness. Those who possess it find themselves reluctant to part with it, even as misfortune begins to gather around them.

## History

Created through forbidden rituals or tainted by tragic events, this artifact carries a curse that affects all who claim ownership. Some seek it for its power, willing to pay any price.`
        }]
    },
    entityTypes: ['item'],
    usageCount: 0,
    quickApplyEnabled: true
};

// Export all item templates
export const BUILTIN_ITEM_TEMPLATES = [
    LEGENDARY_SWORD_TEMPLATE,
    ANCIENT_TOME_TEMPLATE,
    ROYAL_CROWN_TEMPLATE,
    MYSTERIOUS_KEY_TEMPLATE,
    HEALING_POTION_TEMPLATE,
    CURSED_ARTIFACT_TEMPLATE
];

