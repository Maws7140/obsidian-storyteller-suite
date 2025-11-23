# Story & Chapter Import Feature Plan

## Overview
This document outlines the design and implementation plan for importing stories, chapters, and drafts into the Storyteller Suite. This addresses the need to import existing manuscripts, multiple drafts, and external content.

---

## Current Entity Structure

### Chapter Entity
```typescript
interface Chapter {
    id?: string;
    filePath?: string;
    name: string;
    number?: number;
    tags?: string[];
    profileImagePath?: string;
    summary?: string;
    linkedCharacters?: string[];
    linkedLocations?: string[];
    linkedEvents?: string[];
    linkedItems?: string[];
    linkedGroups?: string[];
}
```

### Scene Entity
```typescript
interface Scene {
    id?: string;
    filePath?: string;
    name: string;
    chapterId?: string;
    chapterName?: string;
    status?: string; // Draft | Outline | WIP | Revised | Final
    priority?: number;
    tags?: string[];
    profileImagePath?: string;
    content?: string;  // Main prose
    beats?: string[];
    linkedCharacters?: string[];
    linkedLocations?: string[];
    linkedEvents?: string[];
    linkedItems?: string[];
    linkedGroups?: string[];
}
```

---

## Problem Statement

Users need to:
1. **Import existing manuscripts** from various formats (DOCX, TXT, Markdown, JSON)
2. **Manage multiple drafts** of the same story (rough draft, refined draft, etc.)
3. **Extract entities** automatically (characters, locations mentioned in text)
4. **Preview before importing** to validate structure and make adjustments
5. **Handle version control** for iterative writing processes
6. **Bulk import chapters** without manual creation

---

## Proposed Solution: Multi-Format Import System

### Architecture Components

#### 1. Import Manager (`src/import/ImportManager.ts`)
Central orchestrator for all import operations.

```typescript
interface ImportManager {
    // Format detection
    detectFormat(file: File): ImportFormat;

    // Parse various formats
    parseDocument(file: File, format: ImportFormat): ParsedDocument;

    // Entity extraction
    extractEntities(content: string): ExtractedEntities;

    // Validation
    validateImport(parsed: ParsedDocument): ImportValidation;

    // Execute import
    executeImport(import: ImportConfiguration): ImportResult;
}
```

#### 2. Format Parsers (`src/import/parsers/`)

**Supported Formats:**
- **PlainTextParser** - `.txt` files with chapter markers
- **MarkdownParser** - `.md` files with heading structure
- **DocxParser** - `.docx` Microsoft Word documents
- **JsonParser** - `.json` structured story data
- **CsvParser** - `.csv` chapter/scene lists
- **FountainParser** - `.fountain` screenplay format (bonus)

**Parser Interface:**
```typescript
interface DocumentParser {
    canParse(file: File): boolean;
    parse(file: File): ParsedDocument;
}

interface ParsedDocument {
    metadata: DocumentMetadata;
    chapters: ParsedChapter[];
    scenes?: ParsedScene[];
    extractedEntities: ExtractedEntities;
    warnings: string[];
}

interface ParsedChapter {
    title: string;
    number?: number;
    content: string;
    wordCount: number;
    extractedCharacters: string[];
    extractedLocations: string[];
    scenes?: ParsedScene[];
}

interface ParsedScene {
    title?: string;
    content: string;
    estimatedLocation?: string;
    estimatedCharacters: string[];
}
```

#### 3. Entity Extractor (`src/import/EntityExtractor.ts`)

Uses pattern matching and NLP-lite techniques to identify entities:

```typescript
interface EntityExtractor {
    // Find potential character names (capitalized words, dialogue attribution)
    extractCharacterNames(text: string): string[];

    // Find potential locations (proper nouns, common patterns)
    extractLocationNames(text: string): string[];

    // Find potential items (quoted items, capitalized objects)
    extractPlotItems(text: string): string[];

    // Match against existing entities
    matchExistingEntities(extracted: string[], existing: Entity[]): EntityMatch[];
}

interface EntityMatch {
    extractedName: string;
    existingEntity?: Entity;
    confidence: 'high' | 'medium' | 'low';
    occurrences: number;
}
```

#### 4. Draft Version Manager (`src/import/DraftVersionManager.ts`)

Handles multiple versions/drafts of the same story:

```typescript
interface DraftVersionManager {
    // Create versioned structure
    createDraftStructure(storyName: string): DraftStructure;

    // Import as new draft version
    importAsDraft(parsed: ParsedDocument, version: string): ImportResult;

    // Compare drafts
    compareDrafts(draft1: string, draft2: string): DraftComparison;
}

interface DraftStructure {
    storyId: string;
    storyName: string;
    draftMode: 'separate-stories' | 'version-tags' | 'scene-status';
    versions: DraftVersion[];
}

interface DraftVersion {
    versionId: string;
    versionName: string; // "Rough Draft", "Second Draft", "Final"
    storyId?: string; // If using separate-stories mode
    tag?: string; // If using version-tags mode
    status?: string; // If using scene-status mode
    createdAt: string;
}

interface DraftComparison {
    chaptersAdded: string[];
    chaptersRemoved: string[];
    chaptersModified: ChapterDiff[];
    wordCountChange: number;
}
```

#### 5. Import Configuration Modal (`src/modals/ImportConfigModal.ts`)

Multi-step wizard for configuring imports:

**Step 1: Upload & Detection**
- File upload dropzone
- Format auto-detection
- Format override selector

**Step 2: Structure Detection**
- Show detected chapters
- Edit chapter boundaries
- Merge/split chapters
- Set chapter numbering

**Step 3: Entity Mapping**
- Show extracted entities
- Match to existing entities
- Create new entities
- Mark entities to ignore

**Step 4: Draft Configuration**
- Choose draft handling strategy:
  - **Option A: Separate Stories** - Create "Story - Draft 1", "Story - Draft 2"
  - **Option B: Version Tags** - Single story, chapters tagged with version
  - **Option C: Scene Status** - Use scene status field (Draft/Revised/Final)
  - **Option D: Custom Tags** - User-defined tags per entity
- Set version/draft name

**Step 5: Import Options**
- Target story selection
- Folder configuration
- Conflict resolution:
  - Skip existing chapters
  - Rename conflicting chapters
  - Overwrite existing chapters
- Entity linking options:
  - Auto-link extracted entities
  - Create placeholder entities
  - Leave as plain text

**Step 6: Preview & Confirm**
- Summary of what will be imported:
  - X chapters
  - Y scenes
  - Z new entities
  - Warnings/conflicts
- Estimated time
- Execute button

---

## UX Flow Diagrams

### Flow 1: Import First Draft
```
User → Click "Import Story" command
     → Upload file (mybook.docx)
     → System detects 15 chapters
     → User reviews chapter structure
     → System finds 12 character names, 8 locations
     → User maps "John" → existing character "John Smith"
     → User creates new character "Sarah"
     → User selects "Create new story: My Book - First Draft"
     → Import executes
     → Success: 15 chapters, 45 scenes created
```

### Flow 2: Import Second Draft (Revised Version)
```
User → Click "Import Story" command
     → Upload file (mybook-revised.docx)
     → System detects 16 chapters (1 new)
     → User selects draft option: "Separate Stories"
     → User names: "My Book - Revised Draft"
     → Import executes
     → Result: New story created with revised content
```

### Flow 3: Import Chapter-by-Chapter
```
User → Click "Import Chapters" command
     → Upload folder or multiple files
     → System shows list of files:
         - chapter1.txt → Chapter 1
         - chapter2.txt → Chapter 2
         - chapter3.txt → Chapter 3
     → User selects target story
     → User chooses append or insert at position
     → Import executes
```

---

## Data Types & Interfaces

### Import Configuration
```typescript
interface ImportConfiguration {
    // Source
    sourceFile: File;
    format: ImportFormat;

    // Structure
    chapters: ChapterImportConfig[];
    scenes?: SceneImportConfig[];

    // Entity handling
    entityMapping: Map<string, string>; // extracted name → entity id
    createNewEntities: boolean;
    entitiesToCreate: Partial<Entity>[];

    // Draft handling
    draftStrategy: 'separate-stories' | 'version-tags' | 'scene-status' | 'custom-tags';
    draftVersion?: string;
    targetStoryId?: string;

    // Import options
    conflictResolution: 'skip' | 'rename' | 'overwrite';
    autoLinkEntities: boolean;
    preserveFormatting: boolean;

    // Metadata
    importedAt: string;
    importSource: string;
}

interface ChapterImportConfig {
    sourceTitle: string;
    targetName: string;
    targetNumber?: number;
    content: string;
    tags: string[];
    linkedEntities: {
        characters: string[];
        locations: string[];
        events: string[];
        items: string[];
    };
    scenes?: SceneImportConfig[];
}

interface SceneImportConfig {
    targetName: string;
    content: string;
    status?: string;
    priority?: number;
    linkedEntities: {
        characters: string[];
        locations: string[];
        events: string[];
        items: string[];
    };
}
```

### Import Result
```typescript
interface ImportResult {
    success: boolean;
    error?: string;

    // Created entities
    storyId?: string;
    chaptersCreated: Chapter[];
    scenesCreated: Scene[];
    entitiesCreated: {
        characters: Character[];
        locations: Location[];
        items: PlotItem[];
    };

    // Statistics
    stats: {
        totalChapters: number;
        totalScenes: number;
        totalWords: number;
        entitiesExtracted: number;
        entitiesLinked: number;
        conflictsResolved: number;
    };

    // Warnings and issues
    warnings: string[];
    skippedChapters: string[];
}
```

---

## Format-Specific Parsing Rules

### Plain Text Parser
```
Detect chapters by:
- "Chapter X", "Ch X", "Chapter: Title"
- "# Chapter X" (markdown-style)
- "--- Chapter X ---"
- Configurable regex patterns

Scene breaks:
- "* * *"
- "---"
- Blank line + timestamp/location
```

### DOCX Parser
```
Detect chapters by:
- Heading 1 styles
- "Chapter" keyword + number
- Page breaks + capitalized text

Preserve:
- Basic formatting (italic, bold)
- Scene breaks
- Comments (as Reference entities)
```

### Markdown Parser
```
Map structure:
- # → Chapter
- ## → Scene or section
- ### → Beat or sub-section

Preserve:
- Existing [[wikilinks]] → entity links
- Tags: #character → character tag
- YAML frontmatter → entity metadata
```

### JSON Parser
```json
{
  "title": "My Story",
  "chapters": [
    {
      "number": 1,
      "title": "The Beginning",
      "summary": "...",
      "content": "...",
      "scenes": [
        {
          "title": "Opening Scene",
          "content": "...",
          "characters": ["John", "Sarah"],
          "location": "The Tavern"
        }
      ]
    }
  ]
}
```

---

## Draft/Version Management Strategies

### Strategy 1: Separate Stories (Recommended)
**Structure:**
```
Stories/
  My Novel - Rough Draft/
    Chapters/
      Chapter 1.md
      Chapter 2.md
  My Novel - Revised Draft/
    Chapters/
      Chapter 1.md
      Chapter 2.md
      Chapter 3.md (new)
```

**Pros:**
- Complete separation
- Easy to compare side-by-side
- No confusion

**Cons:**
- Duplicate entity management
- More files

**Use case:** User wants to keep complete drafts separate

---

### Strategy 2: Version Tags
**Structure:**
```
Stories/
  My Novel/
    Chapters/
      Chapter 1.md (tags: rough-draft)
      Chapter 1 (Revised).md (tags: revised-draft)
      Chapter 2.md (tags: rough-draft)
      Chapter 2 (Revised).md (tags: revised-draft)
```

**Pros:**
- Single story
- Can filter by tag
- Shared entities

**Cons:**
- Cluttered chapter list
- Manual organization

**Use case:** User wants to track versions within one story

---

### Strategy 3: Scene Status Field
**Structure:**
```
Stories/
  My Novel/
    Scenes/
      Scene 1-1 Rough.md (status: Draft)
      Scene 1-1 Revised.md (status: Revised)
```

**Pros:**
- Uses existing status field
- Workflow-oriented

**Cons:**
- Status field misuse (meant for workflow)
- Confusing with multiple complete drafts

**Use case:** Iterative revision workflow, not complete drafts

---

### Strategy 4: Custom Metadata Field
**Add new field to Chapter/Scene:**
```typescript
interface Chapter {
    // ... existing fields
    draftVersion?: string; // "rough", "revised", "final"
}
```

**Structure:**
```
Stories/
  My Novel/
    Chapters/
      Chapter 1.md (draftVersion: rough)
      Chapter 1 - Revised.md (draftVersion: revised)
```

**Pros:**
- Explicit versioning
- Flexible filtering
- Shared entities

**Cons:**
- Requires schema change
- Need UI for filtering

**Use case:** Power users wanting fine-grained version control

---

## Entity Extraction Algorithms

### Character Name Detection
```typescript
function extractCharacterNames(text: string): string[] {
    const candidates = new Set<string>();

    // Pattern 1: Dialogue attribution
    // "said John", "John said", "asked Sarah"
    const dialoguePattern = /(?:said|asked|replied|shouted|whispered)\s+([A-Z][a-z]+)|([A-Z][a-z]+)\s+(?:said|asked|replied)/g;

    // Pattern 2: Capitalized words appearing multiple times
    const properNouns = text.match(/\b[A-Z][a-z]+\b/g);
    const frequency = countOccurrences(properNouns);
    const frequentNames = Object.entries(frequency)
        .filter(([name, count]) => count >= 3)
        .map(([name]) => name);

    // Pattern 3: Possessive forms
    const possessivePattern = /\b([A-Z][a-z]+)'s\b/g;

    // Combine and filter
    return Array.from(candidates)
        .filter(name => !COMMON_WORDS.includes(name.toLowerCase()))
        .filter(name => name.length > 1);
}
```

### Location Detection
```typescript
function extractLocationNames(text: string): string[] {
    const candidates = new Set<string>();

    // Pattern 1: "in/at/to [Location]"
    const prepositionPattern = /(?:in|at|to|from|near)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;

    // Pattern 2: Scene headers
    const scenePattern = /^(?:INT|EXT|Scene)[\.\s]+([A-Z][^-\n]+)/gm;

    // Pattern 3: Multi-word proper nouns
    const multiWordPattern = /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g;

    return Array.from(candidates)
        .filter(loc => !isCharacterName(loc));
}
```

---

## UI Components

### 1. Import Story Command
- Command palette: "Import Story/Chapters"
- Ribbon icon: Upload/Import icon
- File menu integration

### 2. Import Configuration Modal
**Layout:**
```
┌─────────────────────────────────────────┐
│  Import Story - Step 2 of 6            │
│  [═══════════════════░░░░░░]  Progress  │
├─────────────────────────────────────────┤
│                                         │
│  Structure Detection                    │
│                                         │
│  We found 15 chapters:                  │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ ☑ Chapter 1: The Beginning      │   │
│  │ ☑ Chapter 2: Rising Action      │   │
│  │ ☑ Chapter 3: The Conflict       │   │
│  │   ...                            │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Chapter boundary detection:            │
│  [Auto ▼] [Edit Boundaries]            │
│                                         │
├─────────────────────────────────────────┤
│            [◄ Back]  [Next ►]          │
└─────────────────────────────────────────┘
```

### 3. Entity Mapping Modal
```
┌─────────────────────────────────────────┐
│  Map Extracted Entities                 │
├─────────────────────────────────────────┤
│  Characters (12 found):                 │
│                                         │
│  "John" (appears 47 times)              │
│    ○ Create new character               │
│    ● Link to: [John Smith ▼]           │
│    ○ Ignore (leave as text)            │
│                                         │
│  "Sarah" (appears 32 times)             │
│    ● Create new character               │
│    ○ Link to: [Select... ▼]            │
│    ○ Ignore (leave as text)            │
│                                         │
│  ... (10 more)                          │
│                                         │
├─────────────────────────────────────────┤
│  Locations (8 found):                   │
│  ... (similar interface)                │
└─────────────────────────────────────────┘
```

### 4. Draft Strategy Selector
```
┌─────────────────────────────────────────┐
│  How should we handle draft versions?   │
├─────────────────────────────────────────┤
│                                         │
│  ◉ Separate Stories                     │
│    Create a new story for this draft    │
│    Story name: [My Novel - Draft 2]     │
│                                         │
│  ○ Version Tags                         │
│    Tag chapters with version            │
│    Tag name: [revised-draft]            │
│                                         │
│  ○ Custom Metadata                      │
│    Use draftVersion field               │
│    Version: [revised]                   │
│                                         │
│  ○ Scene Status (not recommended)       │
│    Use workflow status field            │
│                                         │
└─────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Core Import (MVP)
**Goal:** Basic chapter import from text/markdown

**Tasks:**
1. Create `ImportManager` skeleton
2. Implement `PlainTextParser`
3. Implement `MarkdownParser`
4. Create basic `ImportConfigModal` (simplified, no entity extraction)
5. Add "Import Story" command
6. Support "Separate Stories" draft strategy only
7. Basic chapter creation

**Deliverable:** Can import plain text with chapter markers into new stories

---

### Phase 2: Entity Extraction
**Goal:** Automatic entity detection and linking

**Tasks:**
1. Implement `EntityExtractor`
2. Add character name detection
3. Add location detection
4. Create entity mapping UI in modal (Step 3)
5. Support linking to existing entities
6. Support creating new entities during import

**Deliverable:** Import recognizes character names and locations, prompts user to link

---

### Phase 3: Multi-Format Support
**Goal:** Support Word, JSON, CSV imports

**Tasks:**
1. Implement `DocxParser` (using mammoth.js or similar)
2. Implement `JsonParser`
3. Implement `CsvParser`
4. Add format detection logic
5. Handle format-specific features (DOCX styling, JSON structure)

**Deliverable:** Can import from multiple file formats

---

### Phase 4: Draft Management
**Goal:** Support multiple draft strategies

**Tasks:**
1. Implement `DraftVersionManager`
2. Add draft strategy selector to modal (Step 4)
3. Implement all four strategies:
   - Separate Stories ✓ (already works)
   - Version Tags
   - Custom Metadata (add `draftVersion` field)
   - Scene Status
4. Add draft comparison view (bonus)

**Deliverable:** Users can choose how to organize multiple drafts

---

### Phase 5: Advanced Features
**Goal:** Polish and power features

**Tasks:**
1. Scene-level import and splitting
2. Batch chapter import (folder of files)
3. Import validation and warnings
4. Conflict resolution UI
5. Import templates (save import configurations)
6. Undo/rollback imports
7. Import progress indicator for large files
8. Export to external formats (round-trip)

**Deliverable:** Professional-grade import system

---

## Technical Considerations

### File Size Limits
- Warn on files > 5MB
- Stream large files to avoid memory issues
- Progress indicators for long operations

### Performance
- Parse in chunks for large documents
- Lazy load entity extraction
- Background processing for large imports

### Data Integrity
- Validate all entities before creation
- Transaction-like behavior (all-or-nothing)
- Backup before overwrite operations

### Error Handling
- Graceful failures with clear messages
- Partial import support (save what succeeded)
- Detailed error logs

---

## Testing Strategy

### Unit Tests
- Parser correctness for each format
- Entity extraction accuracy
- Draft strategy logic

### Integration Tests
- End-to-end import flows
- Entity linking correctness
- File system operations

### User Testing
- Import real user manuscripts
- Test with various formats and structures
- Validate entity extraction quality

---

## Success Metrics

1. **Import Success Rate**: >95% of files import without errors
2. **Entity Extraction Accuracy**: >80% of character names correctly identified
3. **User Satisfaction**: Positive feedback on ease of use
4. **Adoption**: X% of users use import feature within first month
5. **Time Savings**: Reduce manual chapter creation time by >90%

---

## Open Questions

1. **Entity Extraction Quality**: How accurate can we make it without AI/ML?
2. **Format Priority**: Which formats are most requested? (Survey users)
3. **Draft Strategy Preference**: Which strategy do most users prefer?
4. **Scene Splitting**: Should we auto-split chapters into scenes? How?
5. **Relationship Extraction**: Can we detect character relationships from text?
6. **Timeline Integration**: Should we extract dates/timeline from content?

---

## Future Enhancements

1. **AI-Powered Extraction**: Use Claude API to improve entity extraction
2. **Smart Scene Detection**: ML-based scene boundary detection
3. **Collaborative Import**: Import from Google Docs, Notion, etc.
4. **Version Control Integration**: Git-like diff and merge for drafts
5. **Import from Scrivener**: Direct Scrivener project import
6. **Audiobook Transcription**: Import from audio files (with transcription)
7. **OCR Support**: Import from scanned PDFs
8. **Web Scraper**: Import from online writing platforms

---

## Conclusion

This import feature will dramatically improve the onboarding experience for users with existing manuscripts. By supporting multiple formats, intelligent entity extraction, and flexible draft management, we make it easy to bring any story into Storyteller Suite.

**Recommended First Implementation:**
- Phase 1 (Core Import) + Phase 2 (Entity Extraction)
- Focus on "Separate Stories" draft strategy
- Support Markdown and Plain Text initially
- Add other formats based on user demand

This provides immediate value while establishing the foundation for more advanced features.
