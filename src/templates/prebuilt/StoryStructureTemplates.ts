/**
 * Built-in Story Structure Templates
 * Pre-configured templates for Chapters, Scenes, and References
 */

import { Template } from '../TemplateTypes';

// ============================================
// CHAPTER TEMPLATES
// ============================================

export const OPENING_CHAPTER_TEMPLATE: Template = {
    id: 'builtin-opening-chapter',
    name: 'Opening Chapter',
    description: 'An engaging first chapter that hooks readers and establishes the story',
    genre: 'custom',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['chapter', 'opening', 'beginning', 'hook', 'introduction'],
    entities: {
        chapters: [{
            templateId: 'OPENING_CHAP_1',
            name: '',
            number: 1,
            summary: 'Introduce the protagonist in their ordinary world, establish the setting\'s tone and atmosphere, and plant the seeds of the central conflict. End with an inciting incident that disrupts normalcy.',
            tags: ['opening', 'introduction', 'inciting-incident']
        }]
    },
    entityTypes: ['chapter'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const CLIMAX_CHAPTER_TEMPLATE: Template = {
    id: 'builtin-climax-chapter',
    name: 'Climax Chapter',
    description: 'The peak of dramatic tension where the main conflict reaches its crisis point',
    genre: 'custom',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['chapter', 'climax', 'crisis', 'turning-point', 'dramatic'],
    entities: {
        chapters: [{
            templateId: 'CLIMAX_CHAP_1',
            name: '',
            summary: 'All story threads converge as the protagonist faces their greatest challenge. Stakes are at their highest, and the outcome will determine everything. This is the point of no return.',
            tags: ['climax', 'crisis', 'confrontation']
        }]
    },
    entityTypes: ['chapter'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const RESOLUTION_CHAPTER_TEMPLATE: Template = {
    id: 'builtin-resolution-chapter',
    name: 'Resolution Chapter',
    description: 'The final chapter that ties up loose ends and shows the new status quo',
    genre: 'custom',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['chapter', 'resolution', 'ending', 'conclusion', 'denouement'],
    entities: {
        chapters: [{
            templateId: 'RESOLUTION_CHAP_1',
            name: '',
            summary: 'Show the aftermath of the climax and how the world has changed. Resolve remaining subplots, demonstrate character growth, and leave readers with a satisfying sense of closure (or setup for sequel).',
            tags: ['resolution', 'aftermath', 'conclusion']
        }]
    },
    entityTypes: ['chapter'],
    usageCount: 0,
    quickApplyEnabled: true
};

// ============================================
// SCENE TEMPLATES
// ============================================

export const ACTION_SCENE_TEMPLATE: Template = {
    id: 'builtin-action-scene',
    name: 'Action Scene',
    description: 'A high-energy scene featuring combat, chase, or physical conflict',
    genre: 'custom',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['scene', 'action', 'combat', 'chase', 'conflict'],
    entities: {
        scenes: [{
            templateId: 'ACTION_SCENE_1',
            name: '',
            status: 'Draft',
            content: '',
            beats: [
                'Setup: Establish stakes and combatants',
                'Escalation: Initial clash and complications',
                'Crisis: Moment when defeat seems likely',
                'Turn: Protagonist finds advantage or makes sacrifice',
                'Resolution: Outcome and immediate consequences'
            ]
        }]
    },
    entityTypes: ['scene'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const DIALOGUE_SCENE_TEMPLATE: Template = {
    id: 'builtin-dialogue-scene',
    name: 'Dialogue Scene',
    description: 'A conversation-driven scene revealing character and advancing plot',
    genre: 'custom',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['scene', 'dialogue', 'conversation', 'character', 'exposition'],
    entities: {
        scenes: [{
            templateId: 'DIALOGUE_SCENE_1',
            name: '',
            status: 'Draft',
            content: '',
            beats: [
                'Context: Establish setting and why characters are meeting',
                'Opening: Initial exchange sets tone',
                'Development: Core information or conflict emerges',
                'Tension: Disagreement, revelation, or emotional peak',
                'Conclusion: Resolution or cliff-hanger, characters part with changed dynamic'
            ]
        }]
    },
    entityTypes: ['scene'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const REVELATION_SCENE_TEMPLATE: Template = {
    id: 'builtin-revelation-scene',
    name: 'Revelation Scene',
    description: 'A scene where crucial information is discovered or revealed',
    genre: 'custom',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['scene', 'revelation', 'discovery', 'twist', 'mystery'],
    entities: {
        scenes: [{
            templateId: 'REVELATION_SCENE_1',
            name: '',
            status: 'Draft',
            content: '',
            beats: [
                'Setup: Character pursues information or stumbles onto clues',
                'Building: Pieces come together, tension mounts',
                'The Reveal: Truth comes to light - show don\'t tell',
                'Reaction: Character processes implications',
                'New Direction: How this changes the protagonist\'s goals or understanding'
            ]
        }]
    },
    entityTypes: ['scene'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const EMOTIONAL_SCENE_TEMPLATE: Template = {
    id: 'builtin-emotional-scene',
    name: 'Emotional Scene',
    description: 'A character-focused scene exploring feelings and relationships',
    genre: 'custom',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['scene', 'emotional', 'character', 'relationship', 'drama'],
    entities: {
        scenes: [{
            templateId: 'EMOTIONAL_SCENE_1',
            name: '',
            status: 'Draft',
            content: '',
            beats: [
                'Trigger: Something prompts emotional response',
                'Internal: Character\'s thoughts and feelings',
                'Expression: How emotions manifest externally',
                'Interaction: Other characters respond or contribute',
                'Processing: Character reaches understanding or decision'
            ]
        }]
    },
    entityTypes: ['scene'],
    usageCount: 0,
    quickApplyEnabled: true
};

// ============================================
// REFERENCE TEMPLATES
// ============================================

export const LANGUAGE_REFERENCE_TEMPLATE: Template = {
    id: 'builtin-language-reference',
    name: 'Language Reference',
    description: 'A reference document for a fictional language or naming conventions',
    genre: 'custom',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['reference', 'language', 'naming', 'worldbuilding', 'linguistics'],
    entities: {
        references: [{
            templateId: 'LANGUAGE_REF_1',
            name: '',
            category: 'Language',
            tags: ['language', 'names', 'worldbuilding'],
            content: '## Overview\nDescribe the language family, influences, and where it is spoken.\n\n## Phonetics\nCommon sounds, forbidden combinations, accent patterns.\n\n## Naming Conventions\n- Male names:\n- Female names:\n- Family/clan names:\n- Place names:\n\n## Common Words\n| Word | Meaning |\n|------|--------|\n| | |\n\n## Grammar Notes\nBasic structure and rules for constructing phrases.'
        }]
    },
    entityTypes: ['reference'],
    usageCount: 0,
    quickApplyEnabled: true
};

export const TIMELINE_REFERENCE_TEMPLATE: Template = {
    id: 'builtin-timeline-reference',
    name: 'Timeline Reference',
    description: 'A chronological reference document for historical events',
    genre: 'custom',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: ['reference', 'timeline', 'history', 'chronology', 'worldbuilding'],
    entities: {
        references: [{
            templateId: 'TIMELINE_REF_1',
            name: '',
            category: 'History',
            tags: ['timeline', 'history', 'chronology'],
            content: '## Calendar System\nDescribe how time is measured in your world.\n\n## Ages/Eras\n### First Age\nKey events and characteristics.\n\n### Second Age\nKey events and characteristics.\n\n## Major Events Timeline\n| Date | Event | Significance |\n|------|-------|-------------|\n| | | |\n\n## Current Year\nWhere the story takes place in the timeline.'
        }]
    },
    entityTypes: ['reference'],
    usageCount: 0,
    quickApplyEnabled: true
};

// Export all story structure templates by type
export const BUILTIN_CHAPTER_TEMPLATES = [
    OPENING_CHAPTER_TEMPLATE,
    CLIMAX_CHAPTER_TEMPLATE,
    RESOLUTION_CHAPTER_TEMPLATE
];

export const BUILTIN_SCENE_TEMPLATES = [
    ACTION_SCENE_TEMPLATE,
    DIALOGUE_SCENE_TEMPLATE,
    REVELATION_SCENE_TEMPLATE,
    EMOTIONAL_SCENE_TEMPLATE
];

export const BUILTIN_REFERENCE_TEMPLATES = [
    LANGUAGE_REFERENCE_TEMPLATE,
    TIMELINE_REFERENCE_TEMPLATE
];

// Combined export for convenience
export const BUILTIN_STORY_STRUCTURE_TEMPLATES = [
    ...BUILTIN_CHAPTER_TEMPLATES,
    ...BUILTIN_SCENE_TEMPLATES,
    ...BUILTIN_REFERENCE_TEMPLATES
];

