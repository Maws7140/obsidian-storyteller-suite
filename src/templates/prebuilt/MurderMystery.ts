/**
 * Murder Mystery Mansion Template
 * Classic murder mystery setup with suspects, detective, victim, and clues
 */

import { Template } from '../TemplateTypes';

export const MURDER_MYSTERY_TEMPLATE: Template = {
    id: 'builtin-murder-mystery-v1',
    name: 'Murder Mystery Mansion',
    description: 'Classic murder mystery at an isolated manor. Wealthy victim, suspicious family members, hidden secrets, and a detective racing to solve the case. Perfect for whodunit stories.',
    genre: 'mystery',
    category: 'entity-set',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2025-01-15T00:00:00.000Z',
    modified: '2025-01-15T00:00:00.000Z',
    tags: ['mystery', 'murder', 'detective', 'mansion', 'whodunit', 'suspects'],

    entities: {
        // CHARACTERS (8)
        characters: [
            {
                templateId: 'CHAR_001',
                name: 'Lord Charles Ashford',
                description: 'Wealthy patriarch of the Ashford family. Found dead in his study on a stormy night.',
                backstory: 'Built a fortune in shipping and real estate. Known for ruthless business dealings and complicated personal relationships. His death reveals many had reason to want him gone.',
                traits: ['Wealthy', 'Ruthless (in life)', 'Secretive', 'Powerful', 'Deceased'],
                status: 'Deceased',
                affiliation: 'Ashford Family',
                customFields: {
                    age: '62 at death',
                    occupation: 'Business Magnate',
                    cause_of_death: 'Poison in brandy',
                    time_of_death: '11:30 PM'
                },
                relationships: [
                    { target: 'CHAR_002', type: 'family', label: 'spouse' },
                    { target: 'CHAR_004', type: 'family', label: 'son' },
                    { target: 'CHAR_005', type: 'enemy', label: 'blackmailed' }
                ],
                locations: ['LOC_001', 'LOC_002'],
                events: ['EVENT_001', 'EVENT_002'],
                groups: [],
                connections: []
            },
            {
                templateId: 'CHAR_002',
                name: 'Lady Margaret Ashford',
                description: 'Lord Ashford\'s elegant but distant wife. Maintains perfect composure even after her husband\'s death.',
                backstory: 'Married Charles 30 years ago in what became a loveless arrangement. Discovered his affairs years ago but stayed for the money and status.',
                traits: ['Composed', 'Elegant', 'Cold', 'Calculating', 'Resentful'],
                status: 'Alive',
                affiliation: 'Ashford Family',
                customFields: {
                    age: '58',
                    alibi: 'Claims to be in bedroom at time of death',
                    motive: 'Inheritance, revenge for affairs',
                    secret: 'Had her own affair with gardener'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'family', label: 'spouse (loveless)' },
                    { target: 'CHAR_004', type: 'family', label: 'son' },
                    { target: 'CHAR_003', type: 'ally', label: 'trusts' }
                ],
                locations: ['LOC_001', 'LOC_003'],
                events: ['EVENT_002', 'EVENT_003'],
                groups: [],
                connections: []
            },
            {
                templateId: 'CHAR_003',
                name: 'Detective Inspector Elena Chen',
                description: 'Sharp-minded detective called to investigate the murder. Known for solving impossible cases.',
                backstory: 'Made a name solving high-profile cases in the city. Called to Ashford Manor when local police realized the complexity of the case.',
                traits: ['Intelligent', 'Observant', 'Persistent', 'Fair', 'Intuitive'],
                status: 'Alive',
                affiliation: 'Metropolitan Police',
                customFields: {
                    age: '42',
                    rank: 'Detective Inspector',
                    specialty: 'Homicide investigations',
                    approach: 'Evidence-based, psychological profiling'
                },
                relationships: [
                    { target: 'CHAR_002', type: 'neutral', label: 'interviewing' },
                    { target: 'CHAR_004', type: 'neutral', label: 'interviewing' },
                    { target: 'CHAR_005', type: 'neutral', label: 'interviewing' },
                    { target: 'CHAR_006', type: 'neutral', label: 'interviewing' },
                    { target: 'CHAR_007', type: 'neutral', label: 'interviewing' },
                    { target: 'CHAR_008', type: 'rival', label: 'suspicious of' }
                ],
                locations: ['LOC_001', 'LOC_002', 'LOC_003', 'LOC_004', 'LOC_005'],
                events: ['EVENT_002', 'EVENT_003', 'EVENT_004'],
                groups: [],
                connections: []
            },
            {
                templateId: 'CHAR_004',
                name: 'Victor Ashford',
                description: 'The wastrel son who stands to inherit everything. Deeply in debt and desperate.',
                backstory: 'Squandered his allowance on gambling and poor investments. His father threatened to disinherit him if he didn\'t reform. Now the primary beneficiary.',
                traits: ['Desperate', 'Charming', 'Reckless', 'Entitled', 'Nervous'],
                status: 'Alive',
                affiliation: 'Ashford Family',
                customFields: {
                    age: '34',
                    alibi: 'Claims to be in the billiard room',
                    motive: 'Inheritance - desperately needed money',
                    debt: '£500,000 to dangerous creditors',
                    inheritance: 'Entire estate worth £10 million'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'family', label: 'son (conflicted)' },
                    { target: 'CHAR_002', type: 'family', label: 'mother' },
                    { target: 'CHAR_005', type: 'romantic', label: 'secret affair' }
                ],
                locations: ['LOC_001', 'LOC_006'],
                events: ['EVENT_001', 'EVENT_002', 'EVENT_003'],
                groups: [],
                connections: []
            },
            {
                templateId: 'CHAR_005',
                name: 'Dr. Elizabeth Grant',
                description: 'Family physician and dinner guest. Composed medical professional with hidden connections to the family.',
                backstory: 'Treated the Ashford family for years. Secretly had an affair with Victor Ashford. Lord Ashford discovered this and threatened to expose her, ruining her career.',
                traits: ['Intelligent', 'Professional', 'Anxious', 'Secretive', 'Conflicted'],
                status: 'Alive',
                affiliation: 'Independent',
                customFields: {
                    age: '38',
                    alibi: 'Claims to be in drawing room with other guests',
                    motive: 'Lord Ashford was blackmailing her',
                    secret: 'Affair with Victor, pregnant',
                    knowledge: 'Knows about poisons'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'enemy', label: 'blackmailed by' },
                    { target: 'CHAR_004', type: 'romantic', label: 'secret affair' },
                    { target: 'CHAR_003', type: 'neutral', label: 'hiding truth from' }
                ],
                locations: ['LOC_001', 'LOC_004'],
                events: ['EVENT_001', 'EVENT_002', 'EVENT_003'],
                groups: [],
                connections: []
            },
            {
                templateId: 'CHAR_006',
                name: 'Stevens the Butler',
                description: 'Devoted butler who has served the Ashford family for 30 years. Knows all their secrets.',
                backstory: 'Began service as a young man. Witnessed all the family dramas and scandals. Fiercely loyal to the family name, if not always to its members.',
                traits: ['Loyal', 'Observant', 'Discreet', 'Formal', 'Knowledgeable'],
                status: 'Alive',
                affiliation: 'Ashford Household Staff',
                customFields: {
                    age: '64',
                    alibi: 'In the kitchen organizing staff',
                    motive: 'None apparent - but knows everyone else\'s motives',
                    secret: 'Witnessed multiple crimes but stayed silent',
                    loyalty: 'To the family legacy, complex'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'ally', label: 'served faithfully' },
                    { target: 'CHAR_002', type: 'ally', label: 'serves' },
                    { target: 'CHAR_007', type: 'ally', label: 'supervises' }
                ],
                locations: ['LOC_001', 'LOC_004', 'LOC_006'],
                events: ['EVENT_001', 'EVENT_002', 'EVENT_003'],
                groups: [],
                connections: []
            },
            {
                templateId: 'CHAR_007',
                name: 'Clara the Maid',
                description: 'Young maid who seems to know more than she says. Nervous and evasive under questioning.',
                backstory: 'Hired 6 months ago. Has been loyal but recently became secretive. Saw something the night of the murder but fears the consequences of speaking.',
                traits: ['Nervous', 'Observant', 'Fearful', 'Loyal', 'Conflicted'],
                status: 'Alive',
                affiliation: 'Ashford Household Staff',
                customFields: {
                    age: '26',
                    alibi: 'Claims to be cleaning upstairs',
                    motive: 'None - but witnessed the murder',
                    secret: 'Saw the killer enter the study',
                    fear: 'Terrified of becoming next victim'
                },
                relationships: [
                    { target: 'CHAR_006', type: 'ally', label: 'reports to' },
                    { target: 'CHAR_008', type: 'acquaintance', label: 'occasionally speaks with' },
                    { target: 'CHAR_003', type: 'neutral', label: 'afraid to tell truth to' }
                ],
                locations: ['LOC_001', 'LOC_005', 'LOC_006'],
                events: ['EVENT_002', 'EVENT_004'],
                groups: [],
                connections: []
            },
            {
                templateId: 'CHAR_008',
                name: 'The Mysterious Guest',
                description: 'Uninvited guest who arrived during the storm claiming car trouble. Identity and purpose questionable.',
                backstory: 'Claimed to be a stranded traveler but seems too familiar with the mansion layout. May be connected to Lord Ashford\'s past business dealings.',
                traits: ['Mysterious', 'Charming', 'Evasive', 'Observant', 'Suspicious'],
                status: 'Alive',
                affiliation: 'Unknown',
                customFields: {
                    age: 'Claims 45, possibly older',
                    alibi: 'Was in guest room',
                    motive: 'Unknown - possibly revenge for past business deals',
                    identity: 'May be using false name',
                    theory: 'Possible hired assassin or victim of Ashford\'s past'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'enemy', label: 'mysterious connection' },
                    { target: 'CHAR_003', type: 'rival', label: 'prime suspect' },
                    { target: 'CHAR_007', type: 'acquaintance', label: 'spoke with before murder' }
                ],
                locations: ['LOC_001', 'LOC_005'],
                events: ['EVENT_001', 'EVENT_002'],
                groups: [],
                connections: []
            }
        ],

        // LOCATIONS (6)
        locations: [
            {
                templateId: 'LOC_001',
                name: 'Ashford Manor',
                description: 'Isolated Victorian mansion on a clifftop. Cut off from town by a raging storm. Eight people trapped with a murderer.',
                history: 'Built 150 years ago by the Ashford family. Has witnessed countless dramas and secrets. Known for its labyrinthine layout and hidden passages.',
                locationType: 'Manor House',
                region: 'English Countryside',
                status: 'Occupied',
                customFields: {
                    isolation: 'Complete - storm washed out bridge',
                    phone_lines: 'Down due to storm',
                    atmosphere: 'Gothic, ominous',
                    hidden_features: 'Secret passages, priest holes'
                },
                groups: [],
                connections: []
            },
            {
                templateId: 'LOC_002',
                name: 'The Study',
                description: 'Lord Ashford\'s private study. Site of the murder. Body found slumped over desk, glass of poisoned brandy nearby.',
                history: 'Lord Ashford\'s inner sanctum. Few were permitted entry. Contains his business records, personal safe, and many secrets.',
                locationType: 'Interior Room - Study',
                region: 'Ground Floor, West Wing',
                parentLocation: 'LOC_001',
                status: 'Crime Scene',
                customFields: {
                    evidence: 'Poisoned brandy, disturbed papers, broken clock stopped at 11:30',
                    access: 'Door was locked from inside',
                    secrets: 'Hidden safe behind painting, blackmail files',
                    atmosphere: 'Dark wood, tobacco smell, death'
                },
                groups: [],
                connections: []
            },
            {
                templateId: 'LOC_003',
                name: 'The Library',
                description: 'Vast library with thousands of books. Scene of initial interviews. Contains hidden alcoves perfect for eavesdropping.',
                history: 'Collected over generations. Some rare first editions worth fortunes. Also contains family records and journals.',
                locationType: 'Interior Room - Library',
                region: 'Ground Floor, East Wing',
                parentLocation: 'LOC_001',
                status: 'Active',
                customFields: {
                    features: 'Floor-to-ceiling bookshelves, reading alcoves, hidden doors',
                    evidence: 'Book on poisons recently read',
                    uses: 'Detective uses as base of operations',
                    secrets: 'Journals revealing family scandals'
                },
                groups: [],
                connections: []
            },
            {
                templateId: 'LOC_004',
                name: 'The Dining Hall',
                description: 'Grand dining room where the final dinner was held. Last time all suspects were together before the murder.',
                history: 'Host to countless dinners and celebrations. Tonight it hosted the victim\'s last meal.',
                locationType: 'Interior Room - Dining',
                region: 'Ground Floor, Central',
                parentLocation: 'LOC_001',
                status: 'Active',
                customFields: {
                    last_dinner: 'Eight people present until 10:30 PM',
                    evidence: 'Seating arrangement reveals tensions',
                    witnesses: 'All suspects were present',
                    clues: 'Wine bottle that wasn\'t poisoned'
                },
                groups: [],
                connections: []
            },
            {
                templateId: 'LOC_005',
                name: 'Guest Bedrooms',
                description: 'Collection of guest rooms in the upper floor. Each suspect confined to their room after the murder was discovered.',
                history: 'Housed countless visitors over the years. Now serve as makeshift prison cells for suspects.',
                locationType: 'Interior Rooms - Bedrooms',
                region: 'Second Floor',
                parentLocation: 'LOC_001',
                status: 'Occupied',
                customFields: {
                    occupants: 'All suspects except family',
                    features: 'Individual rooms, some connected by passages',
                    evidence: 'Various personal items revealing secrets',
                    restriction: 'Suspects asked to remain in rooms'
                },
                groups: [],
                connections: []
            },
            {
                templateId: 'LOC_006',
                name: 'Servant\'s Quarters',
                description: 'Below-stairs area where the household staff work and live. Access to hidden passages throughout the mansion.',
                history: 'The working heart of the manor. Staff see and hear everything but rarely speak of it.',
                locationType: 'Interior - Service Area',
                region: 'Ground Floor and Basement',
                parentLocation: 'LOC_001',
                status: 'Active',
                customFields: {
                    access: 'Connected to all parts of house via service passages',
                    evidence: 'Staff observations crucial to case',
                    features: 'Kitchen, pantry, staff rooms, hidden stairs',
                    secrets: 'Servants know all the family secrets'
                },
                groups: [],
                connections: []
            }
        ],

        // EVENTS (5)
        events: [
            {
                templateId: 'EVENT_001',
                name: 'The Dinner Party',
                description: 'Lord Ashford hosts a tense dinner party. Undercurrents of conflict visible to all. The last time he was seen alive.',
                outcome: 'Dinner ends at 10:30 PM. Guests disperse. Lord Ashford retires to study with brandy.',
                dateTime: '1925-10-15T19:00:00.000Z',
                isMilestone: true,
                status: 'Completed',
                characters: ['CHAR_001', 'CHAR_002', 'CHAR_004', 'CHAR_005', 'CHAR_006', 'CHAR_008'],
                location: 'LOC_004',
                groups: [],
                customFields: {
                    attendees: 'Family, Dr. Grant, mysterious guest, butler serving',
                    atmosphere: 'Tense, forced politeness',
                    significance: 'Establishes alibis and motives',
                    end_time: '10:30 PM'
                }
            },
            {
                templateId: 'EVENT_002',
                name: 'The Murder',
                description: 'Lord Charles Ashford found dead in his study at approximately midnight. Poisoned brandy glass beside him.',
                outcome: 'Body discovered by butler. Storm prevents immediate police response. All suspects trapped in mansion.',
                dateTime: '1925-10-15T23:30:00.000Z',
                isMilestone: true,
                status: 'Completed',
                characters: ['CHAR_001', 'CHAR_002', 'CHAR_003', 'CHAR_004', 'CHAR_005', 'CHAR_006', 'CHAR_007', 'CHAR_008'],
                location: 'LOC_002',
                groups: [],
                dependencies: ['EVENT_001'],
                customFields: {
                    time_of_death: 'Approximately 11:30 PM',
                    cause: 'Poison (arsenic) in brandy',
                    discovery: 'Butler found body at midnight',
                    scene: 'Door locked from inside, window latched'
                }
            },
            {
                templateId: 'EVENT_003',
                name: 'Initial Investigation',
                description: 'Detective Chen arrives next morning. Begins interviewing all suspects and examining crime scene.',
                outcome: 'Multiple contradictions in alibis discovered. Evidence of secrets and lies. Everyone had motive.',
                dateTime: '1925-10-16T08:00:00.000Z',
                isMilestone: true,
                status: 'Completed',
                characters: ['CHAR_002', 'CHAR_003', 'CHAR_004', 'CHAR_005', 'CHAR_006'],
                location: 'LOC_003',
                groups: [],
                dependencies: ['EVENT_002'],
                customFields: {
                    discoveries: 'Blackmail files, secret affair, gambling debts',
                    contradictions: 'Multiple alibi inconsistencies',
                    evidence': 'Fingerprints on glass, hidden passages, poison source',
                    conclusion: 'All suspects had means, motive, and opportunity'
                }
            },
            {
                templateId: 'EVENT_004',
                name: 'Revelation of Secrets',
                description: 'Under pressure, suspects begin revealing hidden truths. Web of lies and deception unravels.',
                outcome: 'Affairs exposed, blackmail revealed, financial crimes discovered. True nature of relationships emerges.',
                dateTime: '1925-10-16T14:00:00.000Z',
                isMilestone: true,
                status: 'Completed',
                characters: ['CHAR_003', 'CHAR_004', 'CHAR_005', 'CHAR_007'],
                location: 'LOC_003',
                groups: [],
                dependencies: ['EVENT_003'],
                customFields: {
                    revelations: 'Victor\'s affair with Dr. Grant, blackmail scheme, witness to murder',
                    turning_point: 'Maid Clara reveals she saw someone',
                    evidence: 'New testimony, discovered documents',
                    impact: 'Narrows suspects, reveals true motives'
                }
            },
            {
                templateId: 'EVENT_005',
                name: 'The Confrontation',
                description: 'Detective Chen assembles all suspects in library. Presents solution to the murder.',
                outcome: 'Killer revealed through evidence and deduction. True motive and method exposed.',
                dateTime: '1925-10-16T20:00:00.000Z',
                isMilestone: true,
                status: 'Pending',
                characters: ['CHAR_002', 'CHAR_003', 'CHAR_004', 'CHAR_005', 'CHAR_006', 'CHAR_007', 'CHAR_008'],
                location: 'LOC_003',
                groups: [],
                dependencies: ['EVENT_004'],
                customFields: {
                    method: 'Classic locked-room mystery solution',
                    revelation: 'To be determined by storyteller',
                    evidence: 'Accumulated clues point to killer',
                    climax: 'Final confrontation and confession'
                }
            }
        ],

        // ITEMS (4 - Evidence Items)
        items: [
            {
                templateId: 'ITEM_001',
                name: 'The Poisoned Brandy Glass',
                description: 'Crystal brandy glass containing traces of arsenic. The murder weapon.',
                history: 'From Lord Ashford\'s personal decanter. Poison added shortly before death.',
                isPlotCritical: true,
                currentOwner: 'CHAR_003',
                currentLocation: 'LOC_002',
                associatedEvents: ['EVENT_002', 'EVENT_003'],
                groups: [],
                customFields: {
                    evidence_type: 'Murder weapon',
                    fingerprints: 'Multiple sets - victim and unknown',
                    poison: 'Arsenic - medical grade',
                    source: 'Likely stolen from medical supplies'
                }
            },
            {
                templateId: 'ITEM_002',
                name: 'Blackmail Letters',
                description: 'Hidden collection of letters revealing Lord Ashford was blackmailing multiple people.',
                history: 'Discovered in hidden safe. Detail various indiscretions and crimes Ashford used for leverage.',
                isPlotCritical: true,
                currentOwner: 'CHAR_003',
                currentLocation: 'LOC_002',
                associatedEvents: ['EVENT_003'],
                groups: [],
                customFields: {
                    evidence_type: 'Motive evidence',
                    contents: 'Letters to Dr. Grant, business rivals, others',
                    significance: 'Reveals multiple people wanted him dead',
                    hidden: 'Behind painting in study'
                }
            },
            {
                templateId: 'ITEM_003',
                name: 'The Broken Clock',
                description: 'Mantle clock in study stopped at 11:30 PM. May indicate exact time of death or be staged.',
                history: 'Expensive antique clock. Found stopped at alleged time of murder.',
                isPlotCritical: true,
                currentOwner: 'CHAR_003',
                currentLocation: 'LOC_002',
                associatedEvents: ['EVENT_002', 'EVENT_003'],
                groups: [],
                customFields: {
                    evidence_type: 'Timeline evidence',
                    condition: 'Appears deliberately stopped',
                    significance: 'Establishes time of death - or does it?',
                    question: 'Genuine or staged by killer?'
                }
            },
            {
                templateId: 'ITEM_004',
                name: 'Hidden Will',
                description: 'Recently changed will discovered in safe. Disinherits Victor in favor of charity - if he didn\'t reform.',
                history: 'Drafted 2 weeks before death. Condition: Victor gets nothing unless he paid debts and reformed.',
                isPlotCritical: true,
                currentOwner: 'CHAR_003',
                currentLocation: 'LOC_002',
                associatedEvents: ['EVENT_003', 'EVENT_004'],
                groups: [],
                customFields: {
                    evidence_type: 'Motive evidence',
                    beneficiary: 'Victor Ashford (conditional)',
                    condition: 'Must prove reform or inheritance goes to charity',
                    significance: 'Gives Victor motive - needed father dead before changing will',
                    timing: 'Dated 2 weeks before murder'
                }
            }
        ]
    },

    metadata: {
        entityCounts: {
            character: 8,
            location: 6,
            event: 5,
            item: 4,
            group: 0,
            culture: 0,
            economy: 0,
            magicSystem: 0,
            chapter: 0,
            scene: 0,
            reference: 0
        },
        setupInstructions: 'This template creates a classic locked-room murder mystery. All suspects have motive, means, and questionable alibis. The solution is left open for the storyteller to determine, allowing flexibility in the narrative. Clara the maid witnessed the murder and can reveal the truth when dramatically appropriate.',
        recommendedSettings: {
            'enableCustomEntityFolders': false,
            'enableOneStoryMode': true
        }
    }
};
