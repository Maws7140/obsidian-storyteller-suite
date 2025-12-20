/**
 * Built-in Character Templates
 * Pre-configured single-entity character templates
 */

import { Template } from '../TemplateTypes';

export const MEDIEVAL_KING_TEMPLATE: Template = {
    id: 'builtin-medieval-king',
    name: 'Medieval King',
    description: 'A noble ruler of a medieval kingdom',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['king', 'ruler', 'noble', 'royalty', 'medieval'],
    entities: {
        characters: [{
            templateId: 'KING_1',
            yamlContent: `name: ""
status: "Alive"
traits: ["Wise", "Authoritative", "Strategic", "Diplomatic"]
title: "King"
age: "50"
reign: "25 years"`,
            markdownContent: `## Description

A wise and experienced ruler who has led the kingdom through many challenges.

## Backstory

Born into royalty, trained from youth in the arts of leadership and warfare.`
        }]
    },
    entityTypes: ['character'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const TAVERN_KEEPER_TEMPLATE: Template = {
    id: 'builtin-tavern-keeper',
    name: 'Tavern Keeper',
    description: 'A friendly tavern owner who knows all the local gossip',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['tavern', 'innkeeper', 'npc', 'social', 'common'],
    entities: {
        characters: [{
            templateId: 'TAVERN_1',
            yamlContent: `name: ""
status: "Alive"
traits: ["Friendly", "Observant", "Talkative", "Resourceful"]
occupation: "Tavern Keeper"
specialty: "Ale brewing and local gossip"`,
            markdownContent: `## Description

A jovial and welcoming tavern keeper with a knack for remembering faces and stories.

## Backstory

Has run the local tavern for many years, hearing countless tales from travelers.`
        }]
    },
    entityTypes: ['character'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const WISE_MENTOR_TEMPLATE: Template = {
    id: 'builtin-wise-mentor',
    name: 'Wise Mentor',
    description: 'An experienced teacher or guide for the protagonist',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['mentor', 'teacher', 'wise', 'guide', 'elder'],
    entities: {
        characters: [{
            templateId: 'MENTOR_1',
            yamlContent: `name: ""
status: "Alive"
traits: ["Wise", "Patient", "Knowledgeable", "Mysterious"]
age: "70"
specialization: "Ancient knowledge and combat training"`,
            markdownContent: `## Description

An elderly figure with vast knowledge and experience, dedicated to guiding the next generation.

## Backstory

A former hero/scholar who now passes on their wisdom to worthy students.`
        }]
    },
    entityTypes: ['character'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const CYBERPUNK_HACKER_TEMPLATE: Template = {
    id: 'builtin-cyberpunk-hacker',
    name: 'Cyberpunk Hacker',
    description: 'A skilled netrunner navigating the digital underworld',
    genre: 'scifi',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['hacker', 'netrunner', 'cyberpunk', 'tech', 'cyber'],
    entities: {
        characters: [{
            templateId: 'HACKER_1',
            yamlContent: `name: ""
status: "Alive"
traits: ["Tech-savvy", "Paranoid", "Resourceful", "Anti-authority"]
occupation: "Freelance Netrunner"
augmentations: "Neural implants, enhanced reflexes"
specialty: "Corporate data extraction"`,
            markdownContent: `## Description

A cybernetically enhanced hacker who moves effortlessly through virtual and physical spaces.

## Backstory

Grew up in the neon-lit streets of the megacity, learning to survive through code and cunning.`
        }]
    },
    entityTypes: ['character'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const DETECTIVE_TEMPLATE: Template = {
    id: 'builtin-detective',
    name: 'Detective',
    description: 'A sharp investigator solving mysteries and crimes',
    genre: 'mystery',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['detective', 'investigator', 'sleuth', 'mystery', 'police'],
    entities: {
        characters: [{
            templateId: 'DETECTIVE_1',
            yamlContent: `name: ""
status: "Alive"
traits: ["Observant", "Analytical", "Persistent", "Cynical"]
occupation: "Detective"
specialty: "Homicide investigations"
cases_solved: "47"`,
            markdownContent: `## Description

A methodical investigator with an eye for detail and a knack for uncovering the truth.

## Backstory

Years of experience on the force have honed their investigative skills and jaded their worldview.`
        }]
    },
    entityTypes: ['character'],
    usageCount: 0,
    quickApplyEnabled: true
};

// Export all character templates
export const BUILTIN_CHARACTER_TEMPLATES = [
    MEDIEVAL_KING_TEMPLATE,
    TAVERN_KEEPER_TEMPLATE,
    WISE_MENTOR_TEMPLATE,
    CYBERPUNK_HACKER_TEMPLATE,
    DETECTIVE_TEMPLATE
];
