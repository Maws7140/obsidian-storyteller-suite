# Storyteller Suite - Advanced Features Design Document

## Overview
This document outlines the design for four major feature sets:
1. **Advanced Timeline & Causality Engine**
2. **World-Building Expansion Pack**
3. **Writing Analytics Dashboard**
4. **Sensory World Builder**

All designs follow existing Storyteller Suite patterns and Obsidian plugin best practices.

---

## 1. World-Building Expansion Pack

### 1.1 Culture Entity

Represents religions, customs, languages, and social structures.

```typescript
interface Culture {
    /** Unique identifier */
    id?: string;

    /** File system path to the culture's markdown file */
    filePath?: string;

    /** Display name (e.g., "The Highland Clans", "Mystic Order of Keepers") */
    name: string;

    /** Path to representative image */
    profileImagePath?: string;

    /** Overview of the culture (markdown section) */
    description?: string;

    /** Cultural values, beliefs, and worldview (markdown section) */
    values?: string;

    /** Religious beliefs and practices (markdown section) */
    religion?: string;

    /** Languages spoken by this culture */
    languages?: string[];

    /** Social hierarchy and class structure (markdown section) */
    socialStructure?: string;

    /** Customs, traditions, holidays, rituals */
    customs?: string[];

    /** Naming conventions (markdown section) */
    namingConventions?: string;

    /** Typical dress code and fashion */
    typicalAttire?: string;

    /** Cuisine and dining customs */
    cuisine?: string;

    /** Locations where this culture is prevalent */
    linkedLocations?: string[];

    /** Characters who belong to this culture */
    linkedCharacters?: string[];

    /** Events significant to this culture */
    linkedEvents?: string[];

    /** Related or derivative cultures */
    relatedCultures?: string[];

    /** Parent culture (if derived) */
    parentCulture?: string;

    /** Technology level: 'stone-age' | 'medieval' | 'industrial' | 'modern' | 'futuristic' | 'custom' */
    techLevel?: string;

    /** Government type: 'monarchy' | 'democracy' | 'theocracy' | 'tribal' | 'empire' | 'custom' */
    governmentType?: string;

    /** Array of group ids */
    groups?: string[];

    /** Custom fields for user-defined data */
    customFields?: Record<string, string>;

    /** Typed connections for network graph */
    connections?: TypedRelationship[];

    /** Population size estimate */
    population?: string;

    /** Historical origin and evolution (markdown section) */
    history?: string;

    /** Current status: 'thriving' | 'declining' | 'extinct' | 'emerging' | 'custom' */
    status?: string;
}
```

**Storage:** `StorytellerSuite/Stories/[StoryName]/Cultures/[CultureName].md`

**Markdown Template:**
```markdown
---
name: Culture Name
languages: [Common, Elvish]
techLevel: medieval
governmentType: monarchy
status: thriving
linkedLocations: [Capital City]
---

## Description
Overview of the culture...

## Values
Core beliefs and worldview...

## Religion
Religious practices and beliefs...

## Social Structure
Class hierarchy and social organization...

## History
Origins and cultural evolution...

## Naming Conventions
How names are structured...

## Customs
- Holiday: Festival of Lights - Celebration of...
- Coming of Age: Description...
- Marriage Customs: Description...
```

---

### 1.2 Economy Entity

Tracks currencies, trade routes, resources, and economic systems.

```typescript
interface Economy {
    /** Unique identifier */
    id?: string;

    /** File system path */
    filePath?: string;

    /** Display name (e.g., "Continental Trade Network", "Imperial Economy") */
    name: string;

    /** Representative image */
    profileImagePath?: string;

    /** Economic system overview (markdown section) */
    description?: string;

    /** Currencies used in this economy */
    currencies: Currency[];

    /** Major resources and commodities */
    resources: Resource[];

    /** Trade routes connecting locations */
    tradeRoutes: TradeRoute[];

    /** Economic type: 'barter' | 'feudal' | 'mercantile' | 'capitalist' | 'socialist' | 'mixed' | 'custom' */
    economicSystem?: string;

    /** Locations participating in this economy */
    linkedLocations?: string[];

    /** Factions controlling economic aspects */
    linkedFactions?: string[];

    /** Cultures participating in this economy */
    linkedCultures?: string[];

    /** Events that impacted the economy */
    linkedEvents?: string[];

    /** Current economic health: 'booming' | 'stable' | 'recession' | 'depression' | 'recovering' */
    status?: string;

    /** Major industries and sectors (markdown section) */
    industries?: string;

    /** Tax systems and rates (markdown section) */
    taxation?: string;

    /** Array of group ids */
    groups?: string[];

    /** Custom fields */
    customFields?: Record<string, string>;

    /** Typed connections */
    connections?: TypedRelationship[];
}

interface Currency {
    /** Currency name (e.g., "Gold Dragons", "Imperial Credits") */
    name: string;

    /** Abbreviation/symbol (e.g., "GD", "₡") */
    symbol?: string;

    /** Exchange rate relative to base currency (1.0 = base) */
    exchangeRate?: number;

    /** Physical description */
    description?: string;

    /** Locations where this currency is accepted */
    acceptedIn?: string[];

    /** Base unit subdivisions (e.g., 100 copper = 1 silver) */
    subdivisions?: CurrencySubdivision[];
}

interface CurrencySubdivision {
    /** Name of subdivision (e.g., "copper piece") */
    name: string;

    /** Conversion rate to parent (e.g., 100 copper = 1 silver) */
    conversionRate: number;
}

interface Resource {
    /** Resource name (e.g., "Iron Ore", "Spice", "Mana Crystals") */
    name: string;

    /** Resource type: 'mineral' | 'agricultural' | 'magical' | 'manufactured' | 'luxury' | 'custom' */
    type?: string;

    /** Rarity: 'abundant' | 'common' | 'uncommon' | 'rare' | 'legendary' */
    rarity?: string;

    /** Primary production locations */
    producedAt?: string[];

    /** Value/price (in base currency) */
    value?: string;

    /** Description and uses */
    description?: string;
}

interface TradeRoute {
    /** Route name (e.g., "Silk Road", "Northern Sea Route") */
    name: string;

    /** Origin location */
    origin: string;

    /** Destination location */
    destination: string;

    /** Intermediate waypoints */
    waypoints?: string[];

    /** Primary goods traded on this route */
    goods?: string[];

    /** Travel time/distance */
    duration?: string;

    /** Route status: 'active' | 'dangerous' | 'closed' | 'seasonal' */
    status?: string;

    /** Description and notes */
    description?: string;

    /** Characters who control or patrol this route */
    controlledBy?: string[];
}
```

**Storage:** `StorytellerSuite/Stories/[StoryName]/Economies/[EconomyName].md`

---

### 1.3 Faction (Political System) Entity

Represents governments, factions, organizations, and power dynamics.

```typescript
interface Faction {
    /** Unique identifier */
    id?: string;

    /** File system path */
    filePath?: string;

    /** Display name (e.g., "The Crimson Council", "Empire of the Sun") */
    name: string;

    /** Representative image/banner */
    profileImagePath?: string;

    /** Faction overview (markdown section) */
    description?: string;

    /** Faction type: 'government' | 'guild' | 'military' | 'religious' | 'criminal' | 'rebellion' | 'corporation' | 'custom' */
    factionType?: string;

    /** Founding and historical background (markdown section) */
    history?: string;

    /** Political structure and leadership (markdown section) */
    structure?: string;

    /** Goals, motivations, and agenda (markdown section) */
    goals?: string;

    /** Resources and capabilities (markdown section) */
    resources?: string;

    /** Members and leadership */
    members: FactionMember[];

    /** Territories controlled by this faction */
    territories?: string[]; // Location names

    /** Relationships with other factions */
    factionRelationships?: FactionRelationship[];

    /** Events this faction participated in */
    linkedEvents?: string[];

    /** Associated culture */
    linkedCulture?: string;

    /** Parent faction (if sub-organization) */
    parentFaction?: string;

    /** Sub-factions or branches */
    subfactions?: string[];

    /** Faction strength: 'dominant' | 'major' | 'moderate' | 'minor' | 'declining' | 'emerging' */
    strength?: string;

    /** Current status: 'active' | 'dormant' | 'disbanded' | 'underground' */
    status?: string;

    /** Military strength rating (1-10 or custom) */
    militaryPower?: number;

    /** Economic strength rating (1-10 or custom) */
    economicPower?: number;

    /** Political influence rating (1-10 or custom) */
    politicalInfluence?: number;

    /** Faction colors for visualization */
    colors?: string[]; // e.g., ['#FF0000', '#000000']

    /** Faction symbol/emblem description */
    emblem?: string;

    /** Motto or slogan */
    motto?: string;

    /** Array of group ids */
    groups?: string[];

    /** Custom fields */
    customFields?: Record<string, string>;

    /** Typed connections */
    connections?: TypedRelationship[];
}

interface FactionMember {
    /** Character name or ID */
    characterName: string;

    /** Role/rank in the faction */
    rank?: string;

    /** Influence level within faction: 'leader' | 'high' | 'medium' | 'low' */
    influence?: string;

    /** Date joined */
    joinDate?: string;

    /** Additional notes */
    notes?: string;
}

interface FactionRelationship {
    /** Target faction name */
    targetFaction: string;

    /** Relationship type: 'allied' | 'hostile' | 'neutral' | 'trade-partner' | 'vassal' | 'overlord' | 'rival' */
    relationship: string;

    /** Relationship strength (-100 to 100, negative = hostile) */
    strength?: number;

    /** Public vs private stance */
    public?: boolean;

    /** Description and context */
    description?: string;

    /** Treaties or agreements in place */
    treaties?: string[];
}
```

**Storage:** `StorytellerSuite/Stories/[StoryName]/Factions/[FactionName].md`

---

### 1.4 Magic/Tech System Entity

Defines rules, limitations, costs, and consistency for magical or technological systems.

```typescript
interface MagicSystem {
    /** Unique identifier */
    id?: string;

    /** File system path */
    filePath?: string;

    /** Display name (e.g., "Elemental Magic", "Nanotechnology", "Psionics") */
    name: string;

    /** Representative image */
    profileImagePath?: string;

    /** System overview (markdown section) */
    description?: string;

    /** System type: 'magic' | 'technology' | 'psionic' | 'divine' | 'hybrid' | 'custom' */
    systemType?: string;

    /** Fundamental rules and mechanics (markdown section) */
    rules?: string;

    /** Source of power (markdown section) */
    source?: string;

    /** Costs and limitations (markdown section) */
    costs?: string;

    /** What cannot be done with this system (markdown section) */
    limitations?: string;

    /** Schools, disciplines, or categories */
    categories: MagicCategory[];

    /** Abilities, spells, or technologies */
    abilities: MagicAbility[];

    /** Materials, components, or requirements */
    materials?: string[];

    /** Training and learning methods (markdown section) */
    training?: string;

    /** Characters who use this system */
    linkedCharacters?: string[];

    /** Locations where this system is prevalent */
    linkedLocations?: string[];

    /** Cultures that practice this system */
    linkedCultures?: string[];

    /** Events that shaped this system */
    linkedEvents?: string[];

    /** Items powered by this system */
    linkedItems?: string[];

    /** Rarity: 'universal' | 'common' | 'uncommon' | 'rare' | 'legendary' | 'unique' */
    rarity?: string;

    /** Power level: 'low' | 'medium' | 'high' | 'godlike' */
    powerLevel?: string;

    /** Current state: 'flourishing' | 'declining' | 'forbidden' | 'lost' | 'emerging' */
    status?: string;

    /** Historical origins (markdown section) */
    history?: string;

    /** Consistency checks and rules enforcement */
    consistencyRules?: ConsistencyRule[];

    /** Array of group ids */
    groups?: string[];

    /** Custom fields */
    customFields?: Record<string, string>;

    /** Typed connections */
    connections?: TypedRelationship[];
}

interface MagicCategory {
    /** Category name (e.g., "Fire Magic", "Cybernetic Enhancement") */
    name: string;

    /** Category description */
    description?: string;

    /** Difficulty: 'beginner' | 'intermediate' | 'advanced' | 'master' */
    difficulty?: string;

    /** Rarity of practitioners */
    rarity?: string;
}

interface MagicAbility {
    /** Ability name (e.g., "Fireball", "Teleportation", "Nano-Healing") */
    name: string;

    /** Category this ability belongs to */
    category?: string;

    /** Description and effects */
    description?: string;

    /** Cost to use (mana, energy, stamina, etc.) */
    cost?: string;

    /** Limitations and restrictions */
    limitations?: string;

    /** Required skill level */
    requiredLevel?: string;

    /** Characters who possess this ability */
    knownBy?: string[];

    /** Power rating (1-10 or custom scale) */
    powerRating?: number;
}

interface ConsistencyRule {
    /** Rule name */
    name: string;

    /** Rule description */
    description: string;

    /** Rule type: 'hard-limit' | 'soft-limit' | 'guideline' | 'principle' */
    type: string;

    /** Consequences of breaking this rule */
    consequences?: string;
}
```

**Storage:** `StorytellerSuite/Stories/[StoryName]/MagicSystems/[SystemName].md`

---

### 1.5 Calendar Entity

Custom calendars with months, holidays, astronomical events.

```typescript
interface Calendar {
    /** Unique identifier */
    id?: string;

    /** File system path */
    filePath?: string;

    /** Display name (e.g., "Imperial Calendar", "Lunar Cycle") */
    name: string;

    /** Representative image */
    profileImagePath?: string;

    /** Calendar overview (markdown section) */
    description?: string;

    /** Calendar type: 'solar' | 'lunar' | 'hybrid' | 'fixed' | 'custom' */
    calendarType?: string;

    /** Number of days in a year */
    daysPerYear: number;

    /** Months in the calendar */
    months: CalendarMonth[];

    /** Weekdays */
    weekdays?: string[]; // e.g., ['Monday', 'Tuesday', ...]

    /** Days per week */
    daysPerWeek?: number;

    /** Holidays and special days */
    holidays: CalendarHoliday[];

    /** Astronomical events (eclipses, meteor showers, etc.) */
    astronomicalEvents?: AstronomicalEvent[];

    /** Seasons */
    seasons?: Season[];

    /** Current date in this calendar (for tracking story time) */
    currentDate?: CalendarDate;

    /** "Today" reference for date calculations */
    referenceDate?: CalendarDate;

    /** How this calendar relates to Earth calendar (for conversion) */
    earthConversion?: string; // e.g., "1 day = 1 Earth day", "1 year = 400 Earth days"

    /** Cultures that use this calendar */
    linkedCultures?: string[];

    /** Locations where this calendar is used */
    linkedLocations?: string[];

    /** Historical origin (markdown section) */
    history?: string;

    /** Current usage: 'universal' | 'regional' | 'cultural' | 'archaic' */
    usage?: string;

    /** Array of group ids */
    groups?: string[];

    /** Custom fields */
    customFields?: Record<string, string>;
}

interface CalendarMonth {
    /** Month name (e.g., "Frostfall", "Hearthfire") */
    name: string;

    /** Number of days in this month */
    days: number;

    /** Month number (1-based) */
    number: number;

    /** Season this month belongs to */
    season?: string;

    /** Description or cultural significance */
    description?: string;
}

interface CalendarHoliday {
    /** Holiday name */
    name: string;

    /** Date in calendar */
    date: CalendarDate;

    /** Description and significance */
    description?: string;

    /** Cultures that celebrate this holiday */
    cultures?: string[];

    /** How the holiday is celebrated (markdown) */
    celebration?: string;

    /** Duration in days (for multi-day holidays) */
    duration?: number;

    /** Recurring: true = annual, false = one-time */
    recurring?: boolean;
}

interface AstronomicalEvent {
    /** Event name (e.g., "Solar Eclipse", "Red Moon") */
    name: string;

    /** Date(s) of occurrence */
    dates: CalendarDate[];

    /** Event type: 'eclipse' | 'comet' | 'conjunction' | 'meteor-shower' | 'custom' */
    type?: string;

    /** Description and effects */
    description?: string;

    /** Cultural or magical significance */
    significance?: string;

    /** Frequency: 'daily' | 'monthly' | 'annual' | 'rare' | 'unique' */
    frequency?: string;
}

interface Season {
    /** Season name (e.g., "Spring", "The Long Dark") */
    name: string;

    /** Months included in this season */
    months: string[];

    /** Description and characteristics */
    description?: string;

    /** Climate and weather patterns */
    weather?: string;
}

interface CalendarDate {
    /** Year */
    year?: number;

    /** Month (1-based) */
    month: number;

    /** Day (1-based) */
    day: number;

    /** Hour (0-23, optional for time of day) */
    hour?: number;

    /** Minute (0-59, optional) */
    minute?: number;

    /** Era or epoch (e.g., "AE" for After Empire) */
    era?: string;
}
```

**Storage:** `StorytellerSuite/Stories/[StoryName]/Calendars/[CalendarName].md`

---

## 2. Advanced Timeline & Causality Engine

### 2.1 Timeline Fork (What-If Scenarios)

Represents alternate timeline branches for exploring different story paths.

```typescript
interface TimelineFork {
    /** Unique identifier */
    id: string;

    /** Display name (e.g., "What if the hero died?") */
    name: string;

    /** Parent timeline ID (undefined = main timeline) */
    parentTimelineId?: string;

    /** Event that caused the fork (divergence point) */
    divergenceEvent: string; // Event ID or name

    /** Date of divergence */
    divergenceDate: string;

    /** Description of what changed */
    description: string;

    /** Status: 'active' | 'archived' | 'exploring' */
    status: string;

    /** Events unique to this timeline */
    forkEvents: string[]; // Event IDs

    /** Characters with different fates in this timeline */
    alteredCharacters: AlteredEntity[];

    /** Locations with different states */
    alteredLocations: AlteredEntity[];

    /** Color for visualization */
    color?: string;

    /** Creation date */
    created: string;

    /** Custom notes */
    notes?: string;
}

interface AlteredEntity {
    /** Entity ID or name */
    entityId: string;

    /** Entity type */
    entityType: 'character' | 'location' | 'event' | 'item';

    /** What changed in this timeline */
    alteration: string;

    /** Original state/value */
    originalState?: string;

    /** New state/value in this fork */
    newState?: string;
}
```

**Storage:** Stored in plugin settings (like Groups), not as individual files.

---

### 2.2 Causality Link

Represents cause-and-effect relationships between events.

```typescript
interface CausalityLink {
    /** Unique identifier */
    id: string;

    /** Source event (the cause) */
    causeEvent: string; // Event ID

    /** Target event (the effect) */
    effectEvent: string; // Event ID

    /** Link type: 'direct' | 'indirect' | 'conditional' | 'prevents' */
    linkType: string;

    /** Strength of causal relationship: 'strong' | 'moderate' | 'weak' */
    strength?: string;

    /** Description of how cause leads to effect */
    description?: string;

    /** Time delay between cause and effect */
    delay?: string; // e.g., "3 days", "2 years"

    /** Conditions required for effect to occur */
    conditions?: string[];

    /** Probability of effect given cause (0-100) */
    probability?: number;
}
```

**Storage:** Stored as part of Event entities or in plugin settings.

---

### 2.3 Conflict Detection

System for detecting logical inconsistencies in the timeline.

```typescript
interface TimelineConflict {
    /** Unique identifier */
    id: string;

    /** Conflict type: 'location' | 'age' | 'death' | 'causality' | 'custom' */
    type: string;

    /** Severity: 'critical' | 'warning' | 'info' */
    severity: string;

    /** Entities involved in the conflict */
    entities: ConflictEntity[];

    /** Events involved */
    events: string[]; // Event IDs

    /** Description of the conflict */
    description: string;

    /** Suggested resolution */
    suggestion?: string;

    /** User-dismissed conflicts */
    dismissed?: boolean;

    /** Detection date */
    detected: string;
}

interface ConflictEntity {
    /** Entity ID */
    entityId: string;

    /** Entity type */
    entityType: 'character' | 'location' | 'event' | 'item';

    /** Entity name for display */
    entityName: string;

    /** Specific field with conflict */
    conflictField?: string;

    /** Conflicting value */
    conflictValue?: string;
}

/** Example conflicts:
 * - Character X is at Location A and Location B at the same time
 * - Character Y dies at Event 1 but appears alive at Event 2 (later date)
 * - Event B depends on Event A, but Event A happens after Event B
 * - Character Z is born in year 100 but appears as adult in year 110 (age inconsistency)
 */
```

**Storage:** Stored in plugin settings, generated dynamically.

---

### 2.4 Story Pacing Analysis

Data structures for analyzing story pacing.

```typescript
interface PacingAnalysis {
    /** Overall pacing score (1-10) */
    overallScore: number;

    /** Pacing by chapter/act */
    chapterPacing: ChapterPacing[];

    /** Event density over time */
    eventDensity: EventDensity[];

    /** Tension curve over story */
    tensionCurve: TensionPoint[];

    /** Recommendations */
    recommendations: PacingRecommendation[];

    /** Analysis timestamp */
    analyzed: string;
}

interface ChapterPacing {
    /** Chapter name or ID */
    chapterId: string;
    chapterName: string;

    /** Number of events in this chapter */
    eventCount: number;

    /** Word count (if available) */
    wordCount?: number;

    /** Pacing rating: 'slow' | 'moderate' | 'fast' | 'breakneck' */
    pacing: string;

    /** Tension level (1-10) */
    tension: number;

    /** Character screen time distribution */
    characterAppearances: Record<string, number>;
}

interface EventDensity {
    /** Time period (e.g., "Chapter 1", "Day 1-10") */
    period: string;

    /** Number of events */
    count: number;

    /** Start date */
    startDate: string;

    /** End date */
    endDate: string;
}

interface TensionPoint {
    /** Position in story (0-1, where 0=start, 1=end) */
    position: number;

    /** Tension level (1-10) */
    tension: number;

    /** Associated chapter */
    chapterId?: string;

    /** Associated event */
    eventId?: string;
}

interface PacingRecommendation {
    /** Recommendation type: 'add-event' | 'remove-event' | 'redistribute' | 'increase-tension' | 'decrease-tension' */
    type: string;

    /** Location in story */
    location: string; // Chapter or time period

    /** Description */
    description: string;

    /** Priority: 'high' | 'medium' | 'low' */
    priority: string;
}
```

**Storage:** Calculated dynamically, optionally cached in plugin settings.

---

## 3. Writing Analytics Dashboard

### 3.1 Writing Session Data

```typescript
interface WritingSession {
    /** Unique identifier */
    id: string;

    /** Session start time */
    startTime: string;

    /** Session end time */
    endTime: string;

    /** Words written (delta) */
    wordsWritten: number;

    /** Characters modified */
    charactersModified: string[];

    /** Locations modified */
    locationsModified: string[];

    /** Events created/modified */
    eventsModified: string[];

    /** Chapters worked on */
    chaptersModified: string[];

    /** Scenes worked on */
    scenesModified: string[];

    /** Session notes */
    notes?: string;
}
```

---

### 3.2 Analytics Metrics

```typescript
interface StoryAnalytics {
    /** Total word count across all chapters/scenes */
    totalWordCount: number;

    /** Word count by chapter */
    wordCountByChapter: Record<string, number>;

    /** Word count by scene */
    wordCountByScene: Record<string, number>;

    /** Character appearances (screen time) */
    characterScreenTime: Record<string, CharacterScreenTime>;

    /** Location usage frequency */
    locationUsage: Record<string, number>;

    /** Event distribution over timeline */
    eventDistribution: EventDistribution;

    /** Dialogue vs narration ratio */
    dialogueRatio: DialogueAnalysis;

    /** POV distribution */
    povDistribution: Record<string, POVStats>;

    /** Writing velocity (words per day) */
    writingVelocity: VelocityData[];

    /** Foreshadowing tracker */
    foreshadowing: ForeshadowingPair[];

    /** Last updated */
    lastUpdated: string;
}

interface CharacterScreenTime {
    /** Character name */
    characterName: string;

    /** Number of chapters they appear in */
    chaptersAppeared: number;

    /** Number of scenes they appear in */
    scenesAppeared: number;

    /** Estimated "on-screen" percentage */
    screenTimePercentage: number;

    /** Dialogue count */
    dialogueLines?: number;

    /** First appearance */
    firstAppearance?: string; // Chapter name

    /** Last appearance */
    lastAppearance?: string; // Chapter name
}

interface EventDistribution {
    /** Events by time period */
    byTimePeriod: Record<string, number>;

    /** Events by location */
    byLocation: Record<string, number>;

    /** Events by type/status */
    byStatus: Record<string, number>;
}

interface DialogueAnalysis {
    /** Total dialogue word count */
    dialogueWords: number;

    /** Total narration word count */
    narrationWords: number;

    /** Ratio (dialogue / total) */
    ratio: number;

    /** By chapter */
    byChapter: Record<string, { dialogue: number; narration: number }>;
}

interface POVStats {
    /** POV character name */
    characterName: string;

    /** Word count from this POV */
    wordCount: number;

    /** Percentage of total story */
    percentage: number;

    /** Chapters from this POV */
    chapters: string[];
}

interface VelocityData {
    /** Date */
    date: string;

    /** Words written that day */
    wordsWritten: number;

    /** Cumulative word count */
    cumulativeWords: number;
}

interface ForeshadowingPair {
    /** Unique identifier */
    id: string;

    /** Setup event/scene */
    setup: string; // Event or chapter ID

    /** Payoff event/scene */
    payoff?: string; // Event or chapter ID (undefined if not yet paid off)

    /** Description of the foreshadowing */
    description: string;

    /** Status: 'setup' | 'paid-off' | 'forgotten' */
    status: string;

    /** Time between setup and payoff */
    timeSpan?: string;

    /** Tags for categorization */
    tags?: string[];
}
```

**Storage:** Stored in plugin settings, updated periodically or on-demand.

---

## 4. Sensory World Builder

### 4.1 Sensory Profile Extension

Extends the `Location` entity with sensory data.

```typescript
/** Extension to Location interface */
interface LocationSensoryProfile {
    /** Location this profile belongs to */
    locationId: string;

    /** Visual atmosphere */
    atmosphere?: AtmosphereProfile;

    /** Sensory details */
    sensory?: SensoryDetails;

    /** Mood/emotion evoked */
    mood?: MoodProfile;

    /** Color palette */
    colors?: ColorPalette;

    /** Ambient sounds */
    ambientSounds?: SoundProfile;

    /** Time-of-day variations */
    timeVariations?: TimeVariation[];

    /** Seasonal variations */
    seasonalVariations?: SeasonalVariation[];
}

interface AtmosphereProfile {
    /** Overall atmosphere: 'cozy' | 'ominous' | 'peaceful' | 'tense' | 'magical' | 'industrial' | 'custom' */
    overall?: string;

    /** Lighting: 'bright' | 'dim' | 'dark' | 'flickering' | 'natural' | 'artificial' */
    lighting?: string;

    /** Weather (if applicable) */
    weather?: string;

    /** Temperature feel */
    temperature?: string;

    /** Air quality */
    airQuality?: string; // 'fresh' | 'stuffy' | 'smoky' | 'perfumed'
}

interface SensoryDetails {
    /** What can be seen */
    sight?: string; // Markdown description

    /** What can be heard */
    sound?: string; // Markdown description

    /** What can be smelled */
    smell?: string; // Markdown description

    /** What can be felt (touch/texture) */
    touch?: string; // Markdown description

    /** What can be tasted (if relevant) */
    taste?: string; // Markdown description
}

interface MoodProfile {
    /** Primary mood: 'calm' | 'exciting' | 'mysterious' | 'threatening' | 'romantic' | 'melancholic' | 'custom' */
    primary?: string;

    /** Secondary moods */
    secondary?: string[];

    /** Emotional impact description */
    description?: string;

    /** Intensity (1-10) */
    intensity?: number;
}

interface ColorPalette {
    /** Primary colors (hex codes) */
    primary: string[]; // e.g., ['#8B4513', '#F4A460']

    /** Accent colors */
    accent?: string[];

    /** Palette name */
    name?: string; // e.g., "Autumn Forest"

    /** Palette description */
    description?: string;
}

interface SoundProfile {
    /** Ambient sound categories */
    sounds: AmbientSound[];

    /** Overall sound level: 'silent' | 'quiet' | 'moderate' | 'loud' | 'deafening' */
    volume?: string;

    /** Sound quality: 'harsh' | 'melodic' | 'rhythmic' | 'chaotic' | 'soothing' */
    quality?: string;
}

interface AmbientSound {
    /** Sound description (e.g., "distant bells", "crackling fire") */
    description: string;

    /** Sound type: 'natural' | 'mechanical' | 'voices' | 'music' | 'custom' */
    type?: string;

    /** Volume: 'faint' | 'moderate' | 'prominent' */
    volume?: string;

    /** Frequency: 'constant' | 'intermittent' | 'rare' */
    frequency?: string;
}

interface TimeVariation {
    /** Time of day: 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'evening' | 'night' | 'midnight' */
    timeOfDay: string;

    /** Description of changes at this time */
    description: string;

    /** Lighting changes */
    lighting?: string;

    /** Atmosphere changes */
    atmosphere?: string;

    /** Sound changes */
    sounds?: string[];
}

interface SeasonalVariation {
    /** Season name */
    season: string;

    /** Description of seasonal changes */
    description: string;

    /** Weather changes */
    weather?: string;

    /** Visual changes */
    appearance?: string;

    /** Activity changes */
    activities?: string;
}
```

**Storage:** Stored as additional markdown sections in Location files:

```markdown
## Sensory Profile

### Atmosphere
Lighting: dim
Overall: ominous
Temperature: cold

### Sight
Dark stone walls covered in moss. Flickering torches cast dancing shadows...

### Sound
- Dripping water echoing through the halls
- Distant wind howling through cracks
- Occasional rat scurrying

### Smell
Damp earth and mildew. Faint metallic tang in the air...

### Touch
Cold, rough stone. The air is clammy and makes clothing stick to skin...

### Color Palette
Primary: #2C2C2C, #4A4A4A, #1A1A1A
Accent: #8B0000, #FFD700
Name: Dungeon Depths

### Time Variations
#### Night
Torch shadows grow longer. Sound echoes more prominently...

#### Dawn
Faint light filters through high windows, revealing more details...
```

---

## 5. Implementation Architecture

### 5.1 Folder Structure

```
StorytellerSuite/
└── Stories/
    └── [StoryName]/
        ├── Characters/
        ├── Locations/
        ├── Events/
        ├── Items/
        ├── References/
        ├── Chapters/
        ├── Scenes/
        ├── Maps/
        ├── Cultures/          [NEW]
        ├── Economies/         [NEW]
        ├── Factions/          [NEW]
        ├── MagicSystems/      [NEW]
        └── Calendars/         [NEW]
```

### 5.2 New Modals

Following the existing modal pattern:

- `CultureModal.ts` - Create/edit cultures
- `EconomyModal.ts` - Create/edit economies
- `FactionModal.ts` - Create/edit factions
- `MagicSystemModal.ts` - Create/edit magic/tech systems
- `CalendarModal.ts` - Create/edit calendars
- `SensoryProfileModal.ts` - Edit location sensory profiles
- `TimelineForkModal.ts` - Create what-if scenarios
- `ConflictListModal.ts` - View timeline conflicts
- `PacingAnalysisModal.ts` - View pacing analysis
- `AnalyticsDashboardModal.ts` - View writing analytics

### 5.3 New Views

- `TimelineAdvancedView.ts` - Enhanced timeline with causality, conflicts, forks
- `AnalyticsDashboardView.ts` - Writing analytics visualization
- `WorldBuildingView.ts` - Unified view for cultures, factions, economies, magic
- `SensoryMapView.ts` - Map view with sensory overlays

### 5.4 New Utility Functions

- `ConflictDetection.ts` - Detect timeline conflicts
- `CausalityAnalyzer.ts` - Analyze cause-effect relationships
- `PacingCalculator.ts` - Calculate story pacing metrics
- `AnalyticsCollector.ts` - Collect and aggregate analytics data
- `CalendarConverter.ts` - Convert between custom calendars and dates
- `SensoryProfileParser.ts` - Parse sensory data from markdown

### 5.5 Settings Extensions

```typescript
interface StorytellerSuiteSettings {
    // ... existing settings ...

    // New settings
    timelineForks?: TimelineFork[];
    causalityLinks?: CausalityLink[];
    timelineConflicts?: TimelineConflict[];
    analyticsEnabled?: boolean;
    analyticsData?: StoryAnalytics;
    writingSessions?: WritingSession[];
    pacingAnalysis?: PacingAnalysis;

    // Feature toggles
    enableAdvancedTimeline?: boolean;
    enableWorldBuilding?: boolean;
    enableAnalytics?: boolean;
    enableSensoryProfiles?: boolean;

    // Folder paths for new entities
    cultureFolderPath?: string;
    economyFolderPath?: string;
    factionFolderPath?: string;
    magicSystemFolderPath?: string;
    calendarFolderPath?: string;
}
```

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- Add new entity types to `types.ts`
- Create folder resolver extensions
- Create entity templates in `EntityTemplates.ts`
- Add section definitions to `EntitySections.ts`
- Update settings interface

### Phase 2: World-Building Pack (Week 3-5)
- Implement Culture entity and modal
- Implement Faction entity and modal
- Implement Economy entity and modal
- Implement MagicSystem entity and modal
- Implement Calendar entity and modal
- Add save/load methods to main.ts
- Create WorldBuildingView
- Register commands

### Phase 3: Advanced Timeline (Week 6-8)
- Implement timeline fork system
- Add causality link tracking
- Build conflict detection system
- Create pacing analyzer
- Create character age tracker
- Build TimelineAdvancedView
- Add timeline filtering and grouping

### Phase 4: Analytics Dashboard (Week 9-10)
- Implement analytics data collection
- Create writing session tracking
- Build screen time calculator
- Implement dialogue analyzer
- Create foreshadowing tracker
- Build AnalyticsDashboardView
- Add charts and visualizations

### Phase 5: Sensory World Builder (Week 11-12)
- Extend Location entity with sensory profiles
- Create SensoryProfileModal
- Add sensory data parsers
- Create color palette picker
- Implement time/seasonal variations
- Add sensory overlay to map view
- Create sensory data templates

### Phase 6: Integration & Polish (Week 13-14)
- Integrate all features with existing dashboard
- Add network graph support for new entities
- Create comprehensive tutorial
- Write documentation
- Add keyboard shortcuts
- Optimize performance
- Bug fixes and testing

---

## 7. User Interface Mockups

### 7.1 World-Building Dashboard Tab

```
┌─────────────────────────────────────────────────────┐
│ World Building                            [+ New ▼] │
├─────────────────────────────────────────────────────┤
│ [Cultures] [Factions] [Economies] [Magic] [Calendar]│
├─────────────────────────────────────────────────────┤
│                                                       │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│ │ [Image]  │  │ [Image]  │  │ [Image]  │          │
│ │          │  │          │  │          │          │
│ │ Highland │  │ Imperial │  │ The      │          │
│ │ Clans    │  │ Council  │  │ Mystics  │          │
│ └──────────┘  └──────────┘  └──────────┘          │
│  Culture      Faction       Faction                  │
│                                                       │
│ [Search...                                  ] [≡]    │
└─────────────────────────────────────────────────────┘
```

### 7.2 Advanced Timeline View

```
┌─────────────────────────────────────────────────────┐
│ Timeline                [⚡Conflicts: 2] [🔀Forks: 1]│
├─────────────────────────────────────────────────────┤
│ [🔍] [⚙️] [📊Pacing] [🌳Timeline Tree] [✓Conflicts] │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Main Timeline ──────────────────────────────────   │
│     │                                                 │
│     ├─ Event A ──→ Event B ──→ Event C              │
│     │                  │                             │
│     │                  └──→ Event D                  │
│     │                                                 │
│  Alt Timeline (What if?) ─────────────────────      │
│     │                                                 │
│     └─ Event A' ──→ Event E ──→ Event F             │
│                                                       │
│  ⚠️ Conflict: Character X at two places (Event B & C)│
└─────────────────────────────────────────────────────┘
```

### 7.3 Analytics Dashboard

```
┌─────────────────────────────────────────────────────┐
│ Writing Analytics                     [Refresh]      │
├─────────────────────────────────────────────────────┤
│ Total Words: 85,432    Chapters: 23    Scenes: 67   │
├─────────────────────────────────────────────────────┤
│                                                       │
│ ┌─ Word Count Velocity ────────────────────┐        │
│ │     ^                                     │        │
│ │     │     ╱╲      ╱╲                     │        │
│ │     │   ╱    ╲  ╱    ╲                   │        │
│ │     │ ╱        ╲                         │        │
│ │     └────────────────────────────>       │        │
│ └──────────────────────────────────────────┘        │
│                                                       │
│ ┌─ Character Screen Time ───────────────────┐       │
│ │ Hero        ████████████████░░░░ 80%      │       │
│ │ Villain     ██████████░░░░░░░░░░ 50%      │       │
│ │ Sidekick    ████████░░░░░░░░░░░░ 40%      │       │
│ └──────────────────────────────────────────┘        │
│                                                       │
│ ┌─ Dialogue vs Narration ───────────────────┐       │
│ │ Dialogue:  ██████░░░░░░░░░░ 35%           │       │
│ │ Narration: ████████████████ 65%           │       │
│ └──────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

- Test YAML serialization for new entities
- Test date parsing with custom calendars
- Test conflict detection algorithms
- Test pacing calculations
- Test causality link validation

### 8.2 Integration Tests

- Test entity creation flow
- Test dashboard filtering with new entities
- Test timeline view with forks and conflicts
- Test analytics data collection
- Test sensory profile parsing

### 8.3 Manual Testing

- Create sample story with all new entities
- Test mobile responsiveness
- Test with DataView plugin integration
- Test performance with large datasets
- User acceptance testing

---

## 9. Documentation Plan

### 9.1 User Documentation

- Getting started with World-Building
- Creating custom calendars
- Using the Advanced Timeline
- Understanding Writing Analytics
- Adding Sensory Profiles to Locations
- Creating "What-If" scenarios
- Resolving Timeline Conflicts

### 9.2 Developer Documentation

- New entity type architecture
- Extension points for custom analytics
- Calendar system API
- Conflict detection plugins
- Sensory profile schema

---

## 10. Performance Considerations

### 10.1 Optimization Strategies

- **Lazy loading**: Load analytics data only when dashboard is opened
- **Caching**: Cache conflict detection results
- **Incremental updates**: Update analytics incrementally, not full recalculation
- **Debouncing**: Debounce conflict detection on file changes
- **Worker threads**: Use web workers for heavy calculations (if needed)
- **Pagination**: Paginate large entity lists

### 10.2 Data Limits

- Recommend max 1000 events per timeline for optimal performance
- Warn users if analytics dataset becomes very large
- Provide archive functionality for old timeline forks

---

## 11. Future Enhancements

- AI integration for conflict resolution suggestions
- Export timeline as interactive HTML
- Import/export world-building data
- Collaborative editing for shared worlds
- Mobile app companion
- Voice note integration for quick idea capture
- Integration with external writing tools (Scrivener, etc.)
- Advanced natural language processing for dialogue analysis
- Automatic character voice consistency checking
- Plot structure templates (Hero's Journey, Three-Act, etc.)

---

**End of Design Document**

*Version: 1.0*
*Last Updated: 2025-11-07*
*Author: Claude (Storyteller Suite Design Assistant)*
