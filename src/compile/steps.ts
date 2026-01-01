/**
 * Built-in compile steps for manuscript generation
 * Inspired by Obsidian Longform plugin
 */

import { App, TFile, normalizePath } from 'obsidian';
import type {
    CompileStepDefinition,
    CompileContext,
    SceneCompileInput,
    ManuscriptCompileInput
} from '../types';

// ============================================================
// Strip Frontmatter Step
// ============================================================
const stripFrontmatterStep: CompileStepDefinition = {
    id: 'strip-frontmatter',
    name: 'Strip Frontmatter',
    description: 'Removes YAML frontmatter from the beginning of scenes or manuscript',
    availableKinds: ['scene', 'manuscript'],
    options: [],
    compile: async (input, context) => {
        const stripFm = (text: string): string => {
            // Match YAML frontmatter at the start of the document
            const fmRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
            return text.replace(fmRegex, '');
        };

        if (context.kind === 'scene') {
            const scenes = input as SceneCompileInput[];
            return scenes.map(scene => ({
                ...scene,
                contents: stripFm(scene.contents)
            }));
        } else {
            const manuscript = input as ManuscriptCompileInput;
            return {
                contents: stripFm(manuscript.contents)
            };
        }
    }
};

// ============================================================
// Prepend Scene Title Step
// ============================================================
const prependSceneTitleStep: CompileStepDefinition = {
    id: 'prepend-scene-title',
    name: 'Prepend Scene Title',
    description: 'Adds the scene title as a header before each scene\'s content',
    availableKinds: ['scene'],
    options: [
        {
            id: 'format',
            name: 'Title Format',
            description: 'Format string for the title. $1 = scene name, $2 = scene number, $3{text} = repeat text by indent level + 1',
            type: 'text',
            default: '## $1'
        },
        {
            id: 'separator',
            name: 'Separator',
            description: 'Text to insert between the title and scene content',
            type: 'text',
            default: '\n\n'
        }
    ],
    compile: async (input, context) => {
        const scenes = input as SceneCompileInput[];
        const format = (context.optionValues.format as string) || '## $1';
        const separator = (context.optionValues.separator as string) || '\n\n';

        return scenes.map(scene => {
            let title = format
                .replace(/\$1/g, scene.name)
                .replace(/\$2/g, scene.sceneNumber || String(scene.index + 1));
            
            // Handle $3{text} pattern - repeat text by indent level + 1
            title = title.replace(/\$3\{([^}]+)\}/g, (_, text) => {
                return text.repeat(scene.indentLevel + 1);
            });

            return {
                ...scene,
                contents: title + separator + scene.contents
            };
        });
    }
};

// ============================================================
// Prepend Chapter Title Step
// ============================================================
const prependChapterTitleStep: CompileStepDefinition = {
    id: 'prepend-chapter-title',
    name: 'Prepend Chapter Title',
    description: 'Adds the chapter title as a header before scenes that start a new chapter',
    availableKinds: ['scene'],
    options: [
        {
            id: 'format',
            name: 'Title Format',
            description: 'Format string for the chapter title. $1 = chapter name',
            type: 'text',
            default: '# $1'
        },
        {
            id: 'separator',
            name: 'Separator',
            description: 'Text to insert after the chapter title',
            type: 'text',
            default: '\n\n'
        }
    ],
    compile: async (input, context) => {
        const scenes = input as SceneCompileInput[];
        const format = (context.optionValues.format as string) || '# $1';
        const separator = (context.optionValues.separator as string) || '\n\n';

        let lastChapter = '';
        return scenes.map(scene => {
            if (scene.chapterName && scene.chapterName !== lastChapter) {
                lastChapter = scene.chapterName;
                const chapterHeader = format.replace(/\$1/g, scene.chapterName);
                return {
                    ...scene,
                    contents: chapterHeader + separator + scene.contents
                };
            }
            return scene;
        });
    }
};

// ============================================================
// Remove Wikilinks Step
// ============================================================
const removeWikilinksStep: CompileStepDefinition = {
    id: 'remove-wikilinks',
    name: 'Remove Wikilinks',
    description: 'Converts [[wikilinks]] to plain text or removes them entirely',
    availableKinds: ['scene', 'manuscript'],
    options: [
        {
            id: 'keepLinkText',
            name: 'Keep Link Text',
            description: 'If enabled, keeps the display text of the link. Otherwise removes entirely.',
            type: 'boolean',
            default: true
        },
        {
            id: 'removeExternalLinks',
            name: 'Remove External Links',
            description: 'Also remove [text](url) style links',
            type: 'boolean',
            default: false
        }
    ],
    compile: async (input, context) => {
        const keepLinkText = context.optionValues.keepLinkText !== false;
        const removeExternal = context.optionValues.removeExternalLinks === true;

        const processText = (text: string): string => {
            let result = text;
            
            // Handle wikilinks: [[link]] or [[link|display]]
            if (keepLinkText) {
                result = result.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2'); // [[link|display]] -> display
                result = result.replace(/\[\[([^\]]+)\]\]/g, '$1'); // [[link]] -> link
            } else {
                result = result.replace(/\[\[[^\]]+\]\]/g, '');
            }

            // Handle external links if requested
            if (removeExternal) {
                if (keepLinkText) {
                    result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // [text](url) -> text
                } else {
                    result = result.replace(/\[[^\]]+\]\([^)]+\)/g, '');
                }
            }

            return result;
        };

        if (context.kind === 'scene') {
            const scenes = input as SceneCompileInput[];
            return scenes.map(scene => ({
                ...scene,
                contents: processText(scene.contents)
            }));
        } else {
            const manuscript = input as ManuscriptCompileInput;
            return {
                contents: processText(manuscript.contents)
            };
        }
    }
};

// ============================================================
// Remove Comments Step
// ============================================================
const removeCommentsStep: CompileStepDefinition = {
    id: 'remove-comments',
    name: 'Remove Comments',
    description: 'Removes markdown (%% %%) and/or HTML (<!-- -->) comments',
    availableKinds: ['scene', 'manuscript'],
    options: [
        {
            id: 'removeMarkdownComments',
            name: 'Remove Markdown Comments',
            description: 'Remove %% comment %% style comments',
            type: 'boolean',
            default: true
        },
        {
            id: 'removeHtmlComments',
            name: 'Remove HTML Comments',
            description: 'Remove <!-- comment --> style comments',
            type: 'boolean',
            default: true
        }
    ],
    compile: async (input, context) => {
        const removeMd = context.optionValues.removeMarkdownComments !== false;
        const removeHtml = context.optionValues.removeHtmlComments !== false;

        const processText = (text: string): string => {
            let result = text;
            
            if (removeMd) {
                result = result.replace(/%%[\s\S]*?%%/g, '');
            }
            
            if (removeHtml) {
                result = result.replace(/<!--[\s\S]*?-->/g, '');
            }

            return result;
        };

        if (context.kind === 'scene') {
            const scenes = input as SceneCompileInput[];
            return scenes.map(scene => ({
                ...scene,
                contents: processText(scene.contents)
            }));
        } else {
            const manuscript = input as ManuscriptCompileInput;
            return {
                contents: processText(manuscript.contents)
            };
        }
    }
};

// ============================================================
// Remove Strikethroughs Step
// ============================================================
const removeStrikethroughsStep: CompileStepDefinition = {
    id: 'remove-strikethroughs',
    name: 'Remove Strikethroughs',
    description: 'Removes ~~strikethrough~~ text entirely',
    availableKinds: ['scene', 'manuscript'],
    options: [],
    compile: async (input, context) => {
        const processText = (text: string): string => {
            return text.replace(/~~[^~]+~~/g, '');
        };

        if (context.kind === 'scene') {
            const scenes = input as SceneCompileInput[];
            return scenes.map(scene => ({
                ...scene,
                contents: processText(scene.contents)
            }));
        } else {
            const manuscript = input as ManuscriptCompileInput;
            return {
                contents: processText(manuscript.contents)
            };
        }
    }
};

// ============================================================
// Insert Separator Step
// ============================================================
const insertSeparatorStep: CompileStepDefinition = {
    id: 'insert-separator',
    name: 'Insert Separator',
    description: 'Adds a separator (like ***) between scenes',
    availableKinds: ['scene'],
    options: [
        {
            id: 'separator',
            name: 'Separator Text',
            description: 'Text to insert between scenes',
            type: 'text',
            default: '\n\n***\n\n'
        },
        {
            id: 'skipFirst',
            name: 'Skip First Scene',
            description: 'Don\'t add separator before the first scene',
            type: 'boolean',
            default: true
        }
    ],
    compile: async (input, context) => {
        const scenes = input as SceneCompileInput[];
        const separator = (context.optionValues.separator as string) || '\n\n***\n\n';
        const skipFirst = context.optionValues.skipFirst !== false;

        return scenes.map((scene, index) => {
            if (index === 0 && skipFirst) {
                return scene;
            }
            return {
                ...scene,
                contents: separator + scene.contents
            };
        });
    }
};

// ============================================================
// Concatenate Step (Join)
// ============================================================
const concatenateStep: CompileStepDefinition = {
    id: 'concatenate',
    name: 'Concatenate Scenes',
    description: 'Joins all scenes into a single manuscript document',
    availableKinds: ['join'],
    options: [
        {
            id: 'separator',
            name: 'Separator',
            description: 'Text to put between joined scenes',
            type: 'text',
            default: '\n\n'
        }
    ],
    compile: async (input, context) => {
        const scenes = input as SceneCompileInput[];
        const separator = (context.optionValues.separator as string) || '\n\n';

        const combined = scenes.map(s => s.contents).join(separator);
        
        return {
            contents: combined
        };
    }
};

// ============================================================
// Add Title Page Step
// ============================================================
const addTitlePageStep: CompileStepDefinition = {
    id: 'add-title-page',
    name: 'Add Title Page',
    description: 'Adds a title page with story metadata at the beginning of the manuscript',
    availableKinds: ['manuscript'],
    options: [
        {
            id: 'format',
            name: 'Title Page Format',
            description: 'Format for the title page. $title = story title, $date = compile date',
            type: 'text',
            default: '# $title\n\n*Compiled on $date*\n\n---\n\n'
        },
        {
            id: 'includeWordCount',
            name: 'Include Word Count',
            description: 'Add word count to the title page',
            type: 'boolean',
            default: true
        }
    ],
    compile: async (input, context) => {
        const manuscript = input as ManuscriptCompileInput;
        const format = (context.optionValues.format as string) || '# $title\n\n*Compiled on $date*\n\n---\n\n';
        const includeWordCount = context.optionValues.includeWordCount !== false;

        const date = new Date().toLocaleDateString();
        let titlePage = format
            .replace(/\$title/g, context.story.name)
            .replace(/\$date/g, date);

        if (includeWordCount) {
            const wordCount = manuscript.contents.split(/\s+/).filter(w => w.length > 0).length;
            titlePage = titlePage.replace(/---\n\n$/, `\n*Word count: ${wordCount.toLocaleString()}*\n\n---\n\n`);
        }

        return {
            contents: titlePage + manuscript.contents
        };
    }
};

// ============================================================
// Chapter-Based Concatenate Step (Join by Chapter)
// ============================================================
const concatenateByChapterStep: CompileStepDefinition = {
    id: 'concatenate-by-chapter',
    name: 'Concatenate by Chapter',
    description: 'Groups scenes by chapter and creates a chapter-structured manuscript',
    availableKinds: ['join'],
    options: [
        {
            id: 'chapterFormat',
            name: 'Chapter Header Format',
            description: 'Format for chapter headers. $number = chapter number, $name = chapter name, $wordcount = chapter word count',
            type: 'text',
            default: '# Chapter $number: $name'
        },
        {
            id: 'numberStyle',
            name: 'Chapter Number Style',
            description: 'How to format chapter numbers',
            type: 'select',
            default: 'arabic',
            choices: [
                { value: 'arabic', label: 'Arabic (1, 2, 3)' },
                { value: 'roman', label: 'Roman (I, II, III)' },
                { value: 'word', label: 'Word (One, Two, Three)' },
                { value: 'ordinal', label: 'Ordinal (1st, 2nd, 3rd)' },
                { value: 'none', label: 'None' }
            ]
        },
        {
            id: 'sceneSeparator',
            name: 'Scene Separator',
            description: 'Text between scenes within a chapter',
            type: 'text',
            default: '\n\n'
        },
        {
            id: 'chapterSeparator',
            name: 'Chapter Separator',
            description: 'Text between chapters',
            type: 'text',
            default: '\n\n---\n\n'
        },
        {
            id: 'includeUnassigned',
            name: 'Include Unassigned Scenes',
            description: 'Include scenes not assigned to any chapter',
            type: 'boolean',
            default: true
        },
        {
            id: 'unassignedLabel',
            name: 'Unassigned Section Label',
            description: 'Header for unassigned scenes section',
            type: 'text',
            default: '# Additional Scenes'
        }
    ],
    compile: async (input, context) => {
        const scenes = input as SceneCompileInput[];
        const chapterFormat = (context.optionValues.chapterFormat as string) || '# Chapter $number: $name';
        const numberStyle = (context.optionValues.numberStyle as string) || 'arabic';
        const sceneSeparator = (context.optionValues.sceneSeparator as string) || '\n\n';
        const chapterSeparator = (context.optionValues.chapterSeparator as string) || '\n\n---\n\n';
        const includeUnassigned = context.optionValues.includeUnassigned !== false;
        const unassignedLabel = (context.optionValues.unassignedLabel as string) || '# Additional Scenes';

        // Group scenes by chapter
        const chapterMap = new Map<string, { name: string; number: number; scenes: SceneCompileInput[] }>();
        const unassigned: SceneCompileInput[] = [];
        let chapterCounter = 0;

        for (const scene of scenes) {
            if (scene.chapterName) {
                if (!chapterMap.has(scene.chapterName)) {
                    chapterCounter++;
                    chapterMap.set(scene.chapterName, {
                        name: scene.chapterName,
                        number: chapterCounter,
                        scenes: []
                    });
                }
                chapterMap.get(scene.chapterName)!.scenes.push(scene);
            } else {
                unassigned.push(scene);
            }
        }

        // Format chapter number based on style
        const formatNumber = (num: number): string => {
            switch (numberStyle) {
                case 'roman':
                    return toRoman(num);
                case 'word':
                    return numberToWord(num);
                case 'ordinal':
                    return toOrdinal(num);
                case 'none':
                    return '';
                default:
                    return String(num);
            }
        };

        // Build manuscript
        const parts: string[] = [];

        for (const chapter of chapterMap.values()) {
            const chapterContent = chapter.scenes.map(s => s.contents).join(sceneSeparator);
            const wordCount = chapterContent.split(/\s+/).filter(w => w.length > 0).length;
            
            let header = chapterFormat
                .replace(/\$number/g, formatNumber(chapter.number))
                .replace(/\$name/g, chapter.name)
                .replace(/\$wordcount/g, wordCount.toLocaleString());
            
            // Clean up if number style is 'none'
            if (numberStyle === 'none') {
                header = header.replace(/Chapter\s*:\s*/g, '').replace(/\s*:\s*$/g, '');
            }
            
            parts.push(header + '\n\n' + chapterContent);
        }

        // Add unassigned scenes if requested
        if (includeUnassigned && unassigned.length > 0) {
            const unassignedContent = unassigned.map(s => s.contents).join(sceneSeparator);
            parts.push(unassignedLabel + '\n\n' + unassignedContent);
        }

        return {
            contents: parts.join(chapterSeparator)
        };
    }
};

// ============================================================
// Strip Scene Titles Step
// ============================================================
const stripSceneTitlesStep: CompileStepDefinition = {
    id: 'strip-scene-titles',
    name: 'Strip Scene Titles',
    description: 'Removes scene-level headings, keeping only chapter structure and prose',
    availableKinds: ['scene', 'manuscript'],
    options: [
        {
            id: 'headerLevels',
            name: 'Header Levels to Remove',
            description: 'Which heading levels to strip (comma-separated: 1,2,3)',
            type: 'text',
            default: '2,3'
        },
        {
            id: 'keepFirstParagraph',
            name: 'Keep First Paragraph After Header',
            description: 'Preserve the paragraph immediately after removed headers',
            type: 'boolean',
            default: true
        }
    ],
    compile: async (input, context) => {
        const levels = ((context.optionValues.headerLevels as string) || '2,3')
            .split(',')
            .map(l => parseInt(l.trim()))
            .filter(l => !isNaN(l));
        
        const stripHeaders = (text: string): string => {
            let result = text;
            for (const level of levels) {
                const hashes = '#'.repeat(level);
                // Match header line and preserve content after
                const regex = new RegExp(`^${hashes} .+$\\n?`, 'gm');
                result = result.replace(regex, '');
            }
            // Clean up multiple consecutive newlines
            result = result.replace(/\n{3,}/g, '\n\n');
            return result.trim();
        };

        if (context.kind === 'scene') {
            const scenes = input as SceneCompileInput[];
            return scenes.map(scene => ({
                ...scene,
                contents: stripHeaders(scene.contents)
            }));
        } else {
            const manuscript = input as ManuscriptCompileInput;
            return {
                contents: stripHeaders(manuscript.contents)
            };
        }
    }
};

// ============================================================
// Extract Content Section Step
// ============================================================
const extractContentSectionStep: CompileStepDefinition = {
    id: 'extract-content-section',
    name: 'Extract Content Section',
    description: 'Extracts only the Content section from scene notes, removing Beats, Beat Sheet, and other metadata sections. Perfect for novel export.',
    availableKinds: ['scene'],
    options: [
        {
            id: 'contentHeaders',
            name: 'Content Section Headers',
            description: 'Headers that mark content sections (comma-separated). Will extract text after these headers.',
            type: 'text',
            default: 'Content'
        },
        {
            id: 'excludeHeaders',
            name: 'Exclude Section Headers',
            description: 'Headers to exclude (comma-separated). Text under these will be removed.',
            type: 'text',
            default: 'Beats,Beat Sheet,Notes,Outline,Summary,Synopsis'
        },
        {
            id: 'headerLevel',
            name: 'Section Header Level',
            description: 'The markdown header level used for sections (1-6)',
            type: 'number',
            default: 2
        },
        {
            id: 'fallbackToAll',
            name: 'Fallback to Full Content',
            description: 'If no Content section found, use all text (after removing excluded sections)',
            type: 'boolean',
            default: true
        }
    ],
    compile: async (input, context) => {
        const scenes = input as SceneCompileInput[];
        const contentHeaders = ((context.optionValues.contentHeaders as string) || 'Content')
            .split(',')
            .map(h => h.trim().toLowerCase())
            .filter(h => h.length > 0);
        const excludeHeaders = ((context.optionValues.excludeHeaders as string) || 'Beats,Beat Sheet')
            .split(',')
            .map(h => h.trim().toLowerCase())
            .filter(h => h.length > 0);
        const headerLevel = Math.max(1, Math.min(6, (context.optionValues.headerLevel as number) || 2));
        const fallbackToAll = context.optionValues.fallbackToAll !== false;
        
        const hashes = '#'.repeat(headerLevel);
        // Match section header pattern
        const sectionPattern = new RegExp(`^${hashes}\\s+(.+)$`, 'gm');

        const extractContent = (text: string): string => {
            // First, strip frontmatter if present
            let content = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
            
            // Find all sections
            const sections: { header: string; startIndex: number; endIndex: number }[] = [];
            let match;
            const regex = new RegExp(`^${hashes}\\s+(.+)$`, 'gm');
            
            while ((match = regex.exec(content)) !== null) {
                sections.push({
                    header: match[1].toLowerCase().trim(),
                    startIndex: match.index + match[0].length,
                    endIndex: content.length // Will be updated
                });
            }
            
            // Update end indices
            for (let i = 0; i < sections.length - 1; i++) {
                // Find the start of the next section header
                const nextSectionMatch = content.substring(sections[i].startIndex).match(
                    new RegExp(`\n${hashes}\\s+`)
                );
                if (nextSectionMatch) {
                    sections[i].endIndex = sections[i].startIndex + nextSectionMatch.index!;
                }
            }
            
            // If we found sections, extract content sections
            if (sections.length > 0) {
                const contentParts: string[] = [];
                
                for (const section of sections) {
                    const headerLower = section.header;
                    
                    // Check if this is a content section
                    const isContentSection = contentHeaders.some(ch => 
                        headerLower === ch || headerLower.includes(ch)
                    );
                    
                    // Check if this is an excluded section
                    const isExcludedSection = excludeHeaders.some(eh => 
                        headerLower === eh || headerLower.includes(eh)
                    );
                    
                    if (isContentSection && !isExcludedSection) {
                        const sectionContent = content
                            .substring(section.startIndex, section.endIndex)
                            .trim();
                        if (sectionContent) {
                            contentParts.push(sectionContent);
                        }
                    }
                }
                
                if (contentParts.length > 0) {
                    return contentParts.join('\n\n');
                }
            }
            
            // Fallback: remove excluded sections and return rest
            if (fallbackToAll) {
                let result = content;
                
                // Remove excluded sections
                for (const section of sections) {
                    const isExcluded = excludeHeaders.some(eh => 
                        section.header === eh || section.header.includes(eh)
                    );
                    if (isExcluded) {
                        // Build pattern to match this section and its content
                        const sectionText = content.substring(
                            content.lastIndexOf('\n', content.indexOf(section.header)) + 1,
                            section.endIndex
                        );
                        result = result.replace(sectionText, '');
                    }
                }
                
                // Clean up multiple newlines
                result = result.replace(/\n{3,}/g, '\n\n').trim();
                return result;
            }
            
            return content.trim();
        };

        return scenes.map(scene => ({
            ...scene,
            contents: extractContent(scene.contents)
        }));
    }
};

// ============================================================
// Extract Beat Sheet Section Step
// ============================================================
const extractBeatSheetStep: CompileStepDefinition = {
    id: 'extract-beat-sheet',
    name: 'Extract Beat Sheet',
    description: 'Extracts Beat Sheet and Beats sections from scene notes for outline/planning compilation.',
    availableKinds: ['scene'],
    options: [
        {
            id: 'beatHeaders',
            name: 'Beat Section Headers',
            description: 'Headers that mark beat sections (comma-separated)',
            type: 'text',
            default: 'Beat Sheet,Beats,Outline,Story Beats'
        },
        {
            id: 'headerLevel',
            name: 'Section Header Level',
            description: 'The markdown header level used for sections (1-6)',
            type: 'number',
            default: 2
        },
        {
            id: 'includeSceneName',
            name: 'Include Scene Name',
            description: 'Add scene name as header before beats',
            type: 'boolean',
            default: true
        },
        {
            id: 'sceneNameFormat',
            name: 'Scene Name Format',
            description: 'Format for scene name header. $name = scene name',
            type: 'text',
            default: '### $name'
        },
        {
            id: 'emptyBeatText',
            name: 'Empty Beat Text',
            description: 'Text to show if no beats found (leave empty to skip scene)',
            type: 'text',
            default: '*(No beats defined)*'
        }
    ],
    compile: async (input, context) => {
        const scenes = input as SceneCompileInput[];
        const beatHeaders = ((context.optionValues.beatHeaders as string) || 'Beat Sheet,Beats')
            .split(',')
            .map(h => h.trim().toLowerCase())
            .filter(h => h.length > 0);
        const headerLevel = Math.max(1, Math.min(6, (context.optionValues.headerLevel as number) || 2));
        const includeSceneName = context.optionValues.includeSceneName !== false;
        const sceneNameFormat = (context.optionValues.sceneNameFormat as string) || '### $name';
        const emptyBeatText = (context.optionValues.emptyBeatText as string) || '';
        
        const hashes = '#'.repeat(headerLevel);

        const extractBeats = (text: string, sceneName: string): string => {
            // Strip frontmatter
            let content = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
            
            // Find all sections
            const sections: { header: string; startIndex: number; endIndex: number }[] = [];
            const regex = new RegExp(`^${hashes}\\s+(.+)$`, 'gm');
            let match;
            
            while ((match = regex.exec(content)) !== null) {
                sections.push({
                    header: match[1].toLowerCase().trim(),
                    startIndex: match.index + match[0].length,
                    endIndex: content.length
                });
            }
            
            // Update end indices
            for (let i = 0; i < sections.length - 1; i++) {
                const nextSectionMatch = content.substring(sections[i].startIndex).match(
                    new RegExp(`\n${hashes}\\s+`)
                );
                if (nextSectionMatch) {
                    sections[i].endIndex = sections[i].startIndex + nextSectionMatch.index!;
                }
            }
            
            // Extract beat sections
            const beatParts: string[] = [];
            
            for (const section of sections) {
                const isBeatSection = beatHeaders.some(bh => 
                    section.header === bh || section.header.includes(bh)
                );
                
                if (isBeatSection) {
                    const sectionContent = content
                        .substring(section.startIndex, section.endIndex)
                        .trim();
                    if (sectionContent) {
                        beatParts.push(sectionContent);
                    }
                }
            }
            
            // Build output
            let result = '';
            
            if (beatParts.length > 0) {
                if (includeSceneName) {
                    result = sceneNameFormat.replace(/\$name/g, sceneName) + '\n\n';
                }
                result += beatParts.join('\n\n');
            } else if (emptyBeatText) {
                if (includeSceneName) {
                    result = sceneNameFormat.replace(/\$name/g, sceneName) + '\n\n';
                }
                result += emptyBeatText;
            }
            
            return result;
        };

        return scenes.map(scene => ({
            ...scene,
            contents: extractBeats(scene.contents, scene.name)
        })).filter(scene => scene.contents.trim().length > 0);
    }
};

// ============================================================
// Clean Content Step
// ============================================================
const cleanContentStep: CompileStepDefinition = {
    id: 'clean-content',
    name: 'Clean Content',
    description: 'Removes metadata, notes, and formatting artifacts for clean prose output',
    availableKinds: ['scene', 'manuscript'],
    options: [
        {
            id: 'removeCallouts',
            name: 'Remove Callouts',
            description: 'Remove Obsidian callout blocks (> [!note], etc.)',
            type: 'boolean',
            default: true
        },
        {
            id: 'removeCodeBlocks',
            name: 'Remove Code Blocks',
            description: 'Remove fenced code blocks',
            type: 'boolean',
            default: true
        },
        {
            id: 'removeTags',
            name: 'Remove Tags',
            description: 'Remove #hashtags',
            type: 'boolean',
            default: true
        },
        {
            id: 'removeBlockIds',
            name: 'Remove Block IDs',
            description: 'Remove ^block-id references',
            type: 'boolean',
            default: true
        },
        {
            id: 'normalizeWhitespace',
            name: 'Normalize Whitespace',
            description: 'Convert multiple spaces/newlines to single',
            type: 'boolean',
            default: true
        }
    ],
    compile: async (input, context) => {
        const removeCallouts = context.optionValues.removeCallouts !== false;
        const removeCodeBlocks = context.optionValues.removeCodeBlocks !== false;
        const removeTags = context.optionValues.removeTags !== false;
        const removeBlockIds = context.optionValues.removeBlockIds !== false;
        const normalizeWs = context.optionValues.normalizeWhitespace !== false;

        const cleanText = (text: string): string => {
            let result = text;

            if (removeCodeBlocks) {
                result = result.replace(/```[\s\S]*?```/g, '');
            }

            if (removeCallouts) {
                // Remove callout blocks
                result = result.replace(/^>\s*\[![^\]]+\].*$(\n>.*$)*/gm, '');
            }

            if (removeTags) {
                result = result.replace(/#[a-zA-Z0-9_-]+/g, '');
            }

            if (removeBlockIds) {
                result = result.replace(/\s*\^[a-zA-Z0-9-]+$/gm, '');
            }

            if (normalizeWs) {
                result = result.replace(/[ \t]+/g, ' ');
                result = result.replace(/\n{3,}/g, '\n\n');
            }

            return result.trim();
        };

        if (context.kind === 'scene') {
            const scenes = input as SceneCompileInput[];
            return scenes.map(scene => ({
                ...scene,
                contents: cleanText(scene.contents)
            }));
        } else {
            const manuscript = input as ManuscriptCompileInput;
            return {
                contents: cleanText(manuscript.contents)
            };
        }
    }
};

// ============================================================
// Apply Template Step
// ============================================================
const applyTemplateStep: CompileStepDefinition = {
    id: 'apply-template',
    name: 'Apply Manuscript Template',
    description: 'Wraps the manuscript content in a customizable template structure',
    availableKinds: ['manuscript'],
    options: [
        {
            id: 'template',
            name: 'Template',
            description: 'Template with placeholders: $title, $author, $date, $wordcount, $content, $chapters',
            type: 'text',
            default: '# $title\n\nby $author\n\n---\n\n$content'
        },
        {
            id: 'author',
            name: 'Author Name',
            description: 'Author name for template',
            type: 'text',
            default: ''
        },
        {
            id: 'includeTableOfContents',
            name: 'Include Table of Contents',
            description: 'Add a table of contents before the content',
            type: 'boolean',
            default: false
        }
    ],
    compile: async (input, context) => {
        const manuscript = input as ManuscriptCompileInput;
        const template = (context.optionValues.template as string) || '# $title\n\n$content';
        const author = (context.optionValues.author as string) || 'Unknown Author';
        const includeToc = context.optionValues.includeTableOfContents === true;

        const date = new Date().toLocaleDateString();
        const wordCount = manuscript.contents.split(/\s+/).filter(w => w.length > 0).length;

        // Extract chapter headings for TOC
        let toc = '';
        if (includeToc) {
            const headings = manuscript.contents.match(/^# .+$/gm) || [];
            if (headings.length > 0) {
                toc = '## Table of Contents\n\n' + 
                    headings.map((h, i) => `${i + 1}. ${h.replace(/^# /, '')}`).join('\n') +
                    '\n\n---\n\n';
            }
        }

        let result = template
            .replace(/\$title/g, context.story.name)
            .replace(/\$author/g, author)
            .replace(/\$date/g, date)
            .replace(/\$wordcount/g, wordCount.toLocaleString())
            .replace(/\$chapters/g, String((manuscript.contents.match(/^# /gm) || []).length))
            .replace(/\$content/g, toc + manuscript.contents);

        return {
            contents: result
        };
    }
};

// ============================================================
// Convert to Plain Text Step
// ============================================================
const convertToPlainTextStep: CompileStepDefinition = {
    id: 'convert-to-plain-text',
    name: 'Convert to Plain Text',
    description: 'Strips all markdown formatting for a plain text output',
    availableKinds: ['manuscript'],
    options: [
        {
            id: 'preserveHeaders',
            name: 'Preserve Headers',
            description: 'Keep header text (without # symbols)',
            type: 'boolean',
            default: true
        },
        {
            id: 'preserveParagraphs',
            name: 'Preserve Paragraphs',
            description: 'Keep paragraph breaks',
            type: 'boolean',
            default: true
        },
        {
            id: 'indentParagraphs',
            name: 'Indent Paragraphs',
            description: 'Add indentation to start of paragraphs',
            type: 'boolean',
            default: false
        }
    ],
    compile: async (input, context) => {
        const manuscript = input as ManuscriptCompileInput;
        const preserveHeaders = context.optionValues.preserveHeaders !== false;
        const preserveParagraphs = context.optionValues.preserveParagraphs !== false;
        const indentParagraphs = context.optionValues.indentParagraphs === true;

        let text = manuscript.contents;

        // Remove horizontal rules
        text = text.replace(/^---+$/gm, '');
        text = text.replace(/^\*\*\*+$/gm, '');

        // Handle headers
        if (preserveHeaders) {
            text = text.replace(/^#{1,6} (.+)$/gm, '\n$1\n');
        } else {
            text = text.replace(/^#{1,6} .+$/gm, '');
        }

        // Remove markdown formatting
        text = text.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
        text = text.replace(/\*\*(.+?)\*\*/g, '$1');
        text = text.replace(/\*(.+?)\*/g, '$1');
        text = text.replace(/_(.+?)_/g, '$1');
        text = text.replace(/~~(.+?)~~/g, '$1');
        text = text.replace(/`(.+?)`/g, '$1');

        // Remove links - keep text only
        text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
        text = text.replace(/\[\[([^\]]+)\]\]/g, '$1');

        // Remove images
        text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');

        // Clean up whitespace
        if (preserveParagraphs) {
            text = text.replace(/\n{3,}/g, '\n\n');
        } else {
            text = text.replace(/\n+/g, ' ');
        }

        // Indent paragraphs if requested
        if (indentParagraphs && preserveParagraphs) {
            const paragraphs = text.split(/\n\n+/);
            text = paragraphs.map(p => '    ' + p.trim()).join('\n\n');
        }

        return {
            contents: text.trim()
        };
    }
};

// ============================================================
// Normalize Scene Separators Step
// ============================================================
const normalizeSceneSeparatorsStep: CompileStepDefinition = {
    id: 'normalize-scene-separators',
    name: 'Normalize Scene Separators',
    description: 'Replaces varied scene break markers with a consistent separator',
    availableKinds: ['scene', 'manuscript'],
    options: [
        {
            id: 'separator',
            name: 'New Separator',
            description: 'The separator to use (use \\n for newlines)',
            type: 'text',
            default: '* * *'
        },
        {
            id: 'addBlankLines',
            name: 'Add Blank Lines',
            description: 'Number of blank lines before/after separator',
            type: 'number',
            default: 1
        }
    ],
    compile: async (input, context) => {
        const separator = ((context.optionValues.separator as string) || '* * *').replace(/\\n/g, '\n');
        const blankLines = Math.max(0, (context.optionValues.addBlankLines as number) || 1);
        const padding = '\n'.repeat(blankLines + 1);
        const fullSeparator = padding + separator + padding;

        const normalize = (text: string): string => {
            // Match common scene break patterns
            return text
                .replace(/^---+$/gm, fullSeparator)
                .replace(/^\*\s*\*\s*\*$/gm, fullSeparator)
                .replace(/^#\s*#\s*#$/gm, fullSeparator)
                .replace(/^~~~+$/gm, fullSeparator)
                .replace(/\n{4,}/g, fullSeparator);
        };

        if (context.kind === 'scene') {
            const scenes = input as SceneCompileInput[];
            return scenes.map(scene => ({
                ...scene,
                contents: normalize(scene.contents)
            }));
        } else {
            const manuscript = input as ManuscriptCompileInput;
            return {
                contents: normalize(manuscript.contents)
            };
        }
    }
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Convert number to Roman numerals
 */
function toRoman(num: number): string {
    const romanNumerals: [number, string][] = [
        [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
        [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
        [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
    ];
    
    let result = '';
    for (const [value, numeral] of romanNumerals) {
        while (num >= value) {
            result += numeral;
            num -= value;
        }
    }
    return result;
}

/**
 * Convert number to English word (1-100)
 */
function numberToWord(num: number): string {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    if (num < 20) return ones[num];
    if (num < 100) {
        const t = Math.floor(num / 10);
        const o = num % 10;
        return tens[t] + (o ? '-' + ones[o] : '');
    }
    return String(num);
}

/**
 * Convert number to ordinal (1st, 2nd, 3rd, etc.)
 */
function toOrdinal(num: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = num % 100;
    return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============================================================
// Export to Markdown Step
// ============================================================
const exportMarkdownStep: CompileStepDefinition = {
    id: 'export-markdown',
    name: 'Export to Markdown',
    description: 'Saves the compiled manuscript as a Markdown file in the vault',
    availableKinds: ['manuscript'],
    options: [
        {
            id: 'outputPath',
            name: 'Output Path',
            description: 'Path relative to story folder. $1 = story title, $2 = draft name, $date = current date',
            type: 'text',
            default: 'manuscript.md'
        },
        {
            id: 'openAfterExport',
            name: 'Open After Export',
            description: 'Open the exported file in a new pane',
            type: 'boolean',
            default: true
        }
    ],
    compile: async (input, context) => {
        const manuscript = input as ManuscriptCompileInput;
        let outputPath = (context.optionValues.outputPath as string) || 'manuscript.md';
        const openAfter = context.optionValues.openAfterExport !== false;

        // Replace placeholders
        const date = new Date().toISOString().split('T')[0];
        outputPath = outputPath
            .replace(/\$1/g, context.story.name)
            .replace(/\$2/g, context.draft.name)
            .replace(/\$date/g, date);

        // Ensure .md extension
        if (!outputPath.endsWith('.md')) {
            outputPath += '.md';
        }

        // Build full path
        const fullPath = normalizePath(`${context.projectPath}/${outputPath}`);

        // Create or update file
        const app = context.app as App;
        const existingFile = app.vault.getAbstractFileByPath(fullPath);
        
        if (existingFile instanceof TFile) {
            await app.vault.modify(existingFile, manuscript.contents);
        } else {
            // Ensure parent folder exists
            const parentPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
            if (parentPath) {
                const parentFolder = app.vault.getAbstractFileByPath(parentPath);
                if (!parentFolder) {
                    await app.vault.createFolder(parentPath);
                }
            }
            await app.vault.create(fullPath, manuscript.contents);
        }

        // Open if requested
        if (openAfter) {
            const file = app.vault.getAbstractFileByPath(fullPath);
            if (file instanceof TFile) {
                app.workspace.openLinkText(fullPath, '', true);
            }
        }

        return manuscript;
    }
};

// ============================================================
// Export to HTML Step
// ============================================================
const exportHtmlStep: CompileStepDefinition = {
    id: 'export-html',
    name: 'Export to HTML',
    description: 'Saves the compiled manuscript as an HTML file',
    availableKinds: ['manuscript'],
    options: [
        {
            id: 'outputPath',
            name: 'Output Path',
            description: 'Path for the HTML file. $1 = story title',
            type: 'text',
            default: 'manuscript.html'
        },
        {
            id: 'includeStyles',
            name: 'Include Styles',
            description: 'Embed basic CSS styling in the HTML',
            type: 'boolean',
            default: true
        },
        {
            id: 'wrapInDocument',
            name: 'Full HTML Document',
            description: 'Wrap content in complete HTML document structure',
            type: 'boolean',
            default: true
        }
    ],
    compile: async (input, context) => {
        const manuscript = input as ManuscriptCompileInput;
        let outputPath = (context.optionValues.outputPath as string) || 'manuscript.html';
        const includeStyles = context.optionValues.includeStyles !== false;
        const wrapInDocument = context.optionValues.wrapInDocument !== false;

        // Replace placeholders
        outputPath = outputPath.replace(/\$1/g, context.story.name);

        // Ensure .html extension
        if (!outputPath.endsWith('.html')) {
            outputPath += '.html';
        }

        // Convert markdown to HTML (basic conversion)
        let html = convertMarkdownToHtml(manuscript.contents);

        if (wrapInDocument) {
            const styles = includeStyles ? `
    <style>
        body {
            font-family: Georgia, 'Times New Roman', serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
            color: #333;
        }
        h1 { font-size: 2.5rem; margin-bottom: 1rem; }
        h2 { font-size: 1.8rem; margin-top: 2rem; margin-bottom: 0.8rem; }
        h3 { font-size: 1.4rem; margin-top: 1.5rem; }
        p { margin-bottom: 1rem; text-indent: 1.5rem; }
        p:first-of-type { text-indent: 0; }
        hr { margin: 2rem 0; border: none; border-top: 1px solid #ccc; }
        blockquote { 
            margin: 1rem 2rem; 
            padding-left: 1rem; 
            border-left: 3px solid #ccc; 
            font-style: italic;
        }
    </style>` : '';

            html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${context.story.name}</title>${styles}
</head>
<body>
${html}
</body>
</html>`;
        }

        // Build full path
        const fullPath = normalizePath(`${context.projectPath}/${outputPath}`);

        // Create or update file
        const app = context.app as App;
        const existingFile = app.vault.getAbstractFileByPath(fullPath);
        
        if (existingFile instanceof TFile) {
            await app.vault.modify(existingFile, html);
        } else {
            const parentPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
            if (parentPath) {
                const parentFolder = app.vault.getAbstractFileByPath(parentPath);
                if (!parentFolder) {
                    await app.vault.createFolder(parentPath);
                }
            }
            await app.vault.create(fullPath, html);
        }

        return manuscript;
    }
};

/**
 * Basic markdown to HTML conversion
 */
function convertMarkdownToHtml(markdown: string): string {
    let html = markdown;

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr>');
    html = html.replace(/^\*\*\*+$/gm, '<hr>');

    // Blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Paragraphs - wrap non-empty lines that aren't already HTML
    const lines = html.split('\n');
    const processed: string[] = [];
    let inParagraph = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            if (inParagraph) {
                processed.push('</p>');
                inParagraph = false;
            }
            processed.push('');
        } else if (trimmed.startsWith('<h') || trimmed.startsWith('<hr') || 
                   trimmed.startsWith('<blockquote') || trimmed.startsWith('</')) {
            if (inParagraph) {
                processed.push('</p>');
                inParagraph = false;
            }
            processed.push(line);
        } else {
            if (!inParagraph) {
                processed.push('<p>' + line);
                inParagraph = true;
            } else {
                processed.push(line);
            }
        }
    }

    if (inParagraph) {
        processed.push('</p>');
    }

    return processed.join('\n');
}

// ============================================================
// Custom Regex Step
// ============================================================
const customRegexStep: CompileStepDefinition = {
    id: 'custom-regex',
    name: 'Custom Regex Replace',
    description: 'Apply a custom regex find-and-replace pattern',
    availableKinds: ['scene', 'manuscript'],
    options: [
        {
            id: 'pattern',
            name: 'Regex Pattern',
            description: 'Regular expression pattern to find',
            type: 'text',
            default: ''
        },
        {
            id: 'replacement',
            name: 'Replacement',
            description: 'Replacement text ($1, $2, etc. for capture groups)',
            type: 'text',
            default: ''
        },
        {
            id: 'flags',
            name: 'Regex Flags',
            description: 'Regex flags (g = global, i = case-insensitive, m = multiline)',
            type: 'text',
            default: 'g'
        }
    ],
    compile: async (input, context) => {
        const pattern = context.optionValues.pattern as string;
        const replacement = context.optionValues.replacement as string;
        const flags = (context.optionValues.flags as string) || 'g';

        if (!pattern) {
            return input;
        }

        const regex = new RegExp(pattern, flags);
        const processText = (text: string): string => {
            return text.replace(regex, replacement);
        };

        if (context.kind === 'scene') {
            const scenes = input as SceneCompileInput[];
            return scenes.map(scene => ({
                ...scene,
                contents: processText(scene.contents)
            }));
        } else {
            const manuscript = input as ManuscriptCompileInput;
            return {
                contents: processText(manuscript.contents)
            };
        }
    }
};

// ============================================================
// Export all built-in steps
// ============================================================
export const builtInSteps: CompileStepDefinition[] = [
    stripFrontmatterStep,
    prependSceneTitleStep,
    prependChapterTitleStep,
    removeWikilinksStep,
    removeCommentsStep,
    removeStrikethroughsStep,
    insertSeparatorStep,
    concatenateStep,
    concatenateByChapterStep,
    addTitlePageStep,
    stripSceneTitlesStep,
    extractContentSectionStep,
    extractBeatSheetStep,
    cleanContentStep,
    applyTemplateStep,
    convertToPlainTextStep,
    normalizeSceneSeparatorsStep,
    exportMarkdownStep,
    exportHtmlStep,
    customRegexStep
];

// Export individual steps for direct use
export {
    stripFrontmatterStep,
    prependSceneTitleStep,
    prependChapterTitleStep,
    removeWikilinksStep,
    removeCommentsStep,
    removeStrikethroughsStep,
    insertSeparatorStep,
    concatenateStep,
    concatenateByChapterStep,
    addTitlePageStep,
    stripSceneTitlesStep,
    extractContentSectionStep,
    extractBeatSheetStep,
    cleanContentStep,
    applyTemplateStep,
    convertToPlainTextStep,
    normalizeSceneSeparatorsStep,
    exportMarkdownStep,
    exportHtmlStep,
    customRegexStep
};
