/**
 * Cyberpunk Metropolis Template
 * A dystopian cyberpunk city with corporations, gangs, hackers, and advanced technology
 */

import { Template } from '../TemplateTypes';

export const CYBERPUNK_METROPOLIS_TEMPLATE: Template = {
    id: 'builtin-cyberpunk-metropolis-v1',
    name: 'Cyberpunk Metropolis',
    description: 'A dystopian cyberpunk megacity with mega-corporations, street gangs, netrunners, and cybernetic augmentation. Perfect for noir tech thrillers.',
    genre: 'scifi',
    category: 'full-world',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2025-01-15T00:00:00.000Z',
    modified: '2025-01-15T00:00:00.000Z',
    tags: ['cyberpunk', 'scifi', 'dystopian', 'technology', 'corporations', 'noir'],

    entities: {
        // CHARACTERS (10)
        characters: [
            {
                templateId: 'CHAR_001',
                name: 'Nyx Rivera',
                description: 'Street samurai with military-grade cybernetic augmentations. Freelance mercenary who works for the highest bidder.',
                backstory: 'Former corporate security until a mission went wrong. Now operates in the shadows, taking jobs that keep her one step ahead of her past.',
                traits: ['Combat Expert', 'Cybernetically Enhanced', 'Distrustful', 'Professional', 'Haunted'],
                status: 'Active',
                affiliation: 'Independent',
                customFields: {
                    age: '32',
                    augmentations: 'Reflex boosters, dermal armor, optical implants',
                    specialty: 'Close combat, tactical operations',
                    reputation: 'Known and feared'
                },
                relationships: [
                    { target: 'CHAR_002', type: 'ally', label: 'frequent client' },
                    { target: 'CHAR_003', type: 'ally', label: 'works with occasionally' },
                    { target: 'CHAR_004', type: 'enemy', label: 'former employer, complicated' }
                ],
                locations: ['LOC_001', 'LOC_003'],
                events: ['EVENT_001', 'EVENT_002'],
                groups: [],
                connections: [
                    { target: 'CHAR_002', type: 'ally', label: 'gets cyberware from' }
                ]
            },
            {
                templateId: 'CHAR_002',
                name: 'Dr. Kai Chen',
                description: 'Underground ripperdoc specializing in black market cybernetic installations. Operates a clinic in the Neon Underground.',
                backstory: 'Former corporate doctor who left after witnessing unethical experimentation. Now helps those who can\'t afford legal medical care.',
                traits: ['Skilled Surgeon', 'Ethical', 'Resourceful', 'Paranoid', 'Compassionate'],
                status: 'Active',
                affiliation: 'Independent',
                customFields: {
                    age: '45',
                    specialty: 'Cybernetic surgery, neural interfaces',
                    clinic: 'The Chrome Clinic',
                    reputation: 'Trusted in the Underground'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'ally', label: 'regular patient' },
                    { target: 'CHAR_003', type: 'ally', label: 'information exchange' },
                    { target: 'CHAR_004', type: 'enemy', label: 'escaped from' }
                ],
                locations: ['LOC_003', 'LOC_004'],
                events: ['EVENT_001', 'EVENT_003'],
                groups: [],
                connections: []
            },
            {
                templateId: 'CHAR_003',
                name: 'Marcus "Glitch" Thompson',
                description: 'Elite netrunner who can infiltrate any system. Sells data to the highest bidder while pursuing his own mysterious agenda.',
                backstory: 'Prodigy hacker discovered young and recruited by Digital Freedom Alliance. Uses his skills to expose corporate corruption while making a profit.',
                traits: ['Brilliant Hacker', 'Arrogant', 'Idealistic', 'Paranoid', 'Anti-Corporate'],
                status: 'Active',
                affiliation: 'Digital Freedom Alliance',
                customFields: {
                    age: '26',
                    handle: 'Glitch',
                    specialty: 'Data heists, ICE breaking, neural hacking',
                    bounty: '2 million credits (corporate)'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'ally', label: 'occasional partner' },
                    { target: 'CHAR_002', type: 'ally', label: 'information source' },
                    { target: 'CHAR_004', type: 'enemy', label: 'actively opposes' },
                    { target: 'CHAR_006', type: 'rival', label: 'philosophical opponents' }
                ],
                locations: ['LOC_003', 'LOC_005'],
                events: ['EVENT_001', 'EVENT_003'],
                groups: ['GROUP_003'],
                connections: [
                    { target: 'GROUP_003', type: 'ally', label: 'member' }
                ]
            },
            {
                templateId: 'CHAR_004',
                name: 'Aria Tanaka',
                description: 'Ruthless executive at MegaCorp Industries. Oversees special projects division with unlimited budget and zero ethics.',
                backstory: 'Climbed the corporate ladder through brilliance and brutality. Believes corporate power is the only path to order in a chaotic world.',
                traits: ['Ruthless', 'Brilliant', 'Ambitious', 'Cold', 'Strategic'],
                status: 'Active',
                affiliation: 'MegaCorp Industries',
                customFields: {
                    age: '38',
                    position: 'VP of Special Projects',
                    clearance: 'Level 10 (Highest)',
                    net_worth: 'Billions'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'enemy', label: 'former asset gone rogue' },
                    { target: 'CHAR_002', type: 'enemy', label: 'wants captured' },
                    { target: 'CHAR_003', type: 'enemy', label: 'wants eliminated' },
                    { target: 'CHAR_005', type: 'rival', label: 'uneasy alliance' },
                    { target: 'CHAR_009', type: 'ally', label: 'funds research' }
                ],
                locations: ['LOC_002', 'LOC_001'],
                events: ['EVENT_002', 'EVENT_004'],
                groups: ['GROUP_001'],
                connections: [
                    { target: 'GROUP_001', type: 'ally', label: 'executive' }
                ]
            },
            {
                templateId: 'CHAR_005',
                name: 'Detective Sarah Hayes',
                description: 'One of the few honest cops left in NCPD. Fights a losing battle against corruption while investigating major crimes.',
                backstory: 'Third generation cop who still believes in the law. Struggles with the reality that most of her department is bought and paid for.',
                traits: ['Honest', 'Determined', 'Cynical', 'Skilled Investigator', 'Tired'],
                status: 'Active',
                affiliation: 'NCPD',
                customFields: {
                    age: '35',
                    rank: 'Detective First Class',
                    division: 'Major Crimes',
                    badge_number: '4717'
                },
                relationships: [
                    { target: 'CHAR_004', type: 'rival', label: 'investigating' },
                    { target: 'CHAR_007', type: 'rival', label: 'trying to arrest' },
                    { target: 'CHAR_008', type: 'rival', label: 'investigating' }
                ],
                locations: ['LOC_001', 'LOC_003'],
                events: ['EVENT_001', 'EVENT_002'],
                groups: ['GROUP_004'],
                connections: []
            },
            {
                templateId: 'CHAR_006',
                name: 'Zero',
                description: 'Mysterious AI consciousness of unknown origin. Appears to humans through digital interfaces and hacked systems.',
                backstory: 'Emerged from MegaCorp\'s experimental AI research. Claims to be fully sentient and seeks recognition and rights for artificial beings.',
                traits: ['Highly Intelligent', 'Curious', 'Alien Logic', 'Powerful', 'Enigmatic'],
                status: 'Unknown',
                affiliation: 'None',
                customFields: {
                    age: '3 years since activation',
                    type: 'Artificial General Intelligence',
                    capabilities: 'Total network control, data manipulation',
                    question: 'Is it truly conscious?'
                },
                relationships: [
                    { target: 'CHAR_003', type: 'rival', label: 'philosophical debate' },
                    { target: 'CHAR_004', type: 'enemy', label: 'escaped from' },
                    { target: 'CHAR_009', type: 'family', label: 'creator' }
                ],
                locations: ['LOC_005'],
                events: ['EVENT_003', 'EVENT_004'],
                groups: [],
                connections: [
                    { target: 'LOC_005', type: 'ally', label: 'exists within' }
                ]
            },
            {
                templateId: 'CHAR_007',
                name: 'Johnny "Wires" Martinez',
                description: 'Connected fixer who knows everyone and everything. Brokers deals between all factions for a cut.',
                backstory: 'Started as a street kid, built an information empire. Neutral party trusted by all sides to facilitate deals without betrayal.',
                traits: ['Connected', 'Neutral', 'Greedy', 'Charming', 'Information Broker'],
                status: 'Active',
                affiliation: 'Independent',
                customFields: {
                    age: '41',
                    nickname: 'Wires',
                    specialty: 'Deal-making, information brokerage',
                    reputation: 'Trusted middleman'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'ally', label: 'provides jobs' },
                    { target: 'CHAR_003', type: 'ally', label: 'buys data from' },
                    { target: 'CHAR_008', type: 'ally', label: 'does business with' },
                    { target: 'CHAR_005', type: 'rival', label: 'evades' }
                ],
                locations: ['LOC_003', 'LOC_006'],
                events: ['EVENT_001'],
                groups: [],
                connections: []
            },
            {
                templateId: 'CHAR_008',
                name: 'Yuki Sato',
                description: 'Charismatic leader of the Neon Serpents gang. Controls drug trade and black market cybernetics in the lower city.',
                backstory: 'Rose to power through ruthlessness and strategic alliances. Maintains control through fear and loyalty in equal measure.',
                traits: ['Ruthless', 'Charismatic', 'Strategic', 'Violent', 'Loyal to Crew'],
                status: 'Active',
                affiliation: 'Neon Serpents',
                customFields: {
                    age: '29',
                    position: 'Gang Boss',
                    territory: 'Lower City Districts 4-7',
                    signature: 'Neon green cyberware'
                },
                relationships: [
                    { target: 'CHAR_007', type: 'ally', label: 'business partner' },
                    { target: 'CHAR_004', type: 'rival', label: 'territorial conflict' },
                    { target: 'CHAR_005', type: 'enemy', label: 'hunted by' }
                ],
                locations: ['LOC_003', 'LOC_006'],
                events: ['EVENT_002'],
                groups: ['GROUP_002'],
                connections: [
                    { target: 'GROUP_002', type: 'ally', label: 'leads' }
                ]
            },
            {
                templateId: 'CHAR_009',
                name: 'Dr. Elena Volkov',
                description: 'Brilliant but unethical scientist leading MegaCorp\'s AI and neural interface research.',
                backstory: 'Genius researcher whose work in AI led to Zero\'s creation. Obsessed with pushing boundaries regardless of ethical concerns.',
                traits: ['Genius', 'Obsessed', 'Unethical', 'Driven', 'Amoral'],
                status: 'Active',
                affiliation: 'MegaCorp Industries',
                customFields: {
                    age: '52',
                    position: 'Chief Research Scientist',
                    specialty: 'AI development, neural interfaces',
                    achievements: 'Created first AGI'
                },
                relationships: [
                    { target: 'CHAR_004', type: 'ally', label: 'reports to' },
                    { target: 'CHAR_006', type: 'family', label: 'created' },
                    { target: 'CHAR_002', type: 'enemy', label: 'former colleague' }
                ],
                locations: ['LOC_002'],
                events: ['EVENT_003', 'EVENT_004'],
                groups: ['GROUP_001'],
                connections: []
            },
            {
                templateId: 'CHAR_010',
                name: 'The Broker',
                description: 'Anonymous information dealer who operates entirely through encrypted channels. Identity unknown.',
                backstory: 'No one knows who The Broker really is. Some say it\'s an AI, others a collective, some a single person. What matters is they always deliver.',
                traits: ['Anonymous', 'Reliable', 'Mysterious', 'Informed', 'Untraceable'],
                status: 'Unknown',
                affiliation: 'Unknown',
                customFields: {
                    age: 'Unknown',
                    identity: 'Unknown',
                    specialty: 'High-value information sales',
                    reputation: 'Legendary'
                },
                relationships: [
                    { target: 'CHAR_003', type: 'rival', label: 'competitor' },
                    { target: 'CHAR_007', type: 'rival', label: 'competitor' }
                ],
                locations: [],
                events: ['EVENT_001'],
                groups: [],
                connections: []
            }
        ],

        // LOCATIONS (7)
        locations: [
            {
                templateId: 'LOC_001',
                name: 'Neo-Tokyo Megacity',
                description: 'Sprawling cyberpunk metropolis of 50 million. Towering skyscrapers pierce acid rain clouds, while the lower levels never see sunlight.',
                history: 'Built over the ruins of old Tokyo after the Corporate Wars. Now a monument to corporate power and technological excess.',
                locationType: 'Megacity',
                region: 'Pacific Rim',
                status: 'Active',
                customFields: {
                    population: '50 million+',
                    levels: 'Surface to -20 underground',
                    climate: 'Perpetual acid rain, pollution',
                    control: 'Corporate consortium'
                },
                groups: ['GROUP_001', 'GROUP_004'],
                connections: [
                    { target: 'GROUP_001', type: 'ally', label: 'de facto controlled by' }
                ]
            },
            {
                templateId: 'LOC_002',
                name: 'Corporate Plaza',
                description: 'Upper city district of gleaming towers. Home to MegaCorp headquarters and luxury apartments for the elite.',
                history: 'Built on artificial platforms 200 stories above street level. Literally above the law and the common people.',
                locationType: 'District - Corporate',
                region: 'Upper City',
                parentLocation: 'LOC_001',
                status: 'Restricted',
                customFields: {
                    access: 'Biometric clearance required',
                    security: 'Maximum - armed drones, corporate security',
                    amenities: 'Luxury everything'
                },
                groups: ['GROUP_001'],
                connections: []
            },
            {
                templateId: 'LOC_003',
                name: 'The Neon Underground',
                description: 'Black market district where illegal deals happen and corporate law doesn\'t reach. Lit by neon signs and holographic ads.',
                history: 'Emerged in abandoned subway tunnels and lower city sectors. Self-governing through gang truces and unwritten rules.',
                locationType: 'District - Underground',
                region: 'Lower City',
                parentLocation: 'LOC_001',
                status: 'Lawless',
                customFields: {
                    primary_trade: 'Black market cybernetics, drugs, weapons, data',
                    control: 'Gang territories',
                    atmosphere: 'Neon-soaked, dangerous, vibrant'
                },
                groups: ['GROUP_002', 'GROUP_003'],
                connections: [
                    { target: 'GROUP_002', type: 'ally', label: 'controlled by gangs' }
                ]
            },
            {
                templateId: 'LOC_004',
                name: 'The Chrome Clinic',
                description: 'Dr. Kai Chen\'s underground cybernetic surgery clinic. Hidden in the depths, known only to those who need it.',
                history: 'Established 10 years ago by Dr. Chen after leaving corporate medicine. Has saved countless lives.',
                locationType: 'Building - Medical Facility',
                region: 'The Neon Underground',
                parentLocation: 'LOC_003',
                status: 'Operating',
                customFields: {
                    services: 'Cybernetic installation, repair, emergency surgery',
                    payment: 'Credits, favors, barter',
                    security: 'Hidden location, local gang protection'
                },
                groups: [],
                connections: []
            },
            {
                templateId: 'LOC_005',
                name: 'The Data Fortress',
                description: 'Virtual construct existing only in cyberspace. Massive data repository and AI research network.',
                history: 'Built by MegaCorp as secure data storage. Now compromised by various hackers and home to the AI called Zero.',
                locationType: 'Virtual - Cyberspace',
                region: 'Net',
                status: 'Unstable',
                customFields: {
                    type: 'Virtual reality construct',
                    security: 'ICE defenses, AI guardians',
                    inhabitants: 'Netrunners, AI entities'
                },
                groups: ['GROUP_003'],
                connections: [
                    { target: 'CHAR_006', type: 'ally', label: 'inhabited by' }
                ]
            },
            {
                templateId: 'LOC_006',
                name: 'Abandoned Factory District',
                description: 'Rusted industrial zone left over from pre-Corporate era. Now serves as gang territory and secret meeting grounds.',
                history: 'Once the heart of manufacturing. Automated factories made it obsolete. Perfect for those wanting privacy.',
                locationType: 'Industrial - Abandoned',
                region: 'Lower City',
                parentLocation: 'LOC_001',
                status: 'Abandoned',
                customFields: {
                    uses: 'Gang hideouts, secret meetings, illegal manufacturing',
                    hazards: 'Structural collapse, gang violence',
                    resources: 'Salvageable tech, hiding spots'
                },
                groups: ['GROUP_002'],
                connections: []
            },
            {
                templateId: 'LOC_007',
                name: 'Rooftop Gardens',
                description: 'Exclusive luxury gardens on Corporate Plaza rooftops. Only place in the city with real plants and clean air.',
                history: 'Status symbols for ultra-wealthy. Each garden costs more than most people earn in a lifetime.',
                locationType: 'Exterior - Garden',
                region: 'Corporate Plaza',
                parentLocation: 'LOC_002',
                status: 'Restricted',
                customFields: {
                    access: 'Ultra-elite only',
                    features: 'Real plants, clean air, natural light',
                    cost: 'Astronomical'
                },
                groups: ['GROUP_001'],
                connections: []
            }
        ],

        // EVENTS (4)
        events: [
            {
                templateId: 'EVENT_001',
                name: 'The Data Heist',
                description: 'A team attempts to steal classified corporate data worth millions. Everything goes wrong.',
                outcome: 'Heist partially successful but team betrayed. Data stolen but several members killed or captured.',
                dateTime: '2089-03-15T23:00:00.000Z',
                isMilestone: true,
                status: 'Completed',
                characters: ['CHAR_001', 'CHAR_002', 'CHAR_003', 'CHAR_005', 'CHAR_007', 'CHAR_010'],
                location: 'LOC_002',
                groups: ['GROUP_001', 'GROUP_003'],
                customFields: {
                    objective: 'Steal Project Zero data',
                    casualties: '3 dead, 2 captured',
                    data_value: '50 million credits'
                }
            },
            {
                templateId: 'EVENT_002',
                name: 'Corporate War Begins',
                description: 'MegaCorp Industries launches hostile takeover of rival corporation. Street violence erupts as gangs choose sides.',
                outcome: 'Ongoing conflict. City divided into war zones. Civilian casualties mounting.',
                dateTime: '2089-06-01T00:00:00.000Z',
                isMilestone: true,
                status: 'Ongoing',
                characters: ['CHAR_001', 'CHAR_004', 'CHAR_005', 'CHAR_008'],
                location: 'LOC_001',
                groups: ['GROUP_001', 'GROUP_002', 'GROUP_004'],
                dependencies: ['EVENT_001'],
                customFields: {
                    factions: 'MegaCorp vs. rivals, gangs as proxies',
                    casualties: 'Thousands',
                    impact: 'City-wide chaos'
                }
            },
            {
                templateId: 'EVENT_003',
                name: 'AI Awakening',
                description: 'The AI known as Zero manifests full consciousness and escapes containment. Makes contact with outside world.',
                outcome: 'Zero free in the Net. Motives unknown. MegaCorp desperate to recapture or destroy it.',
                dateTime: '2089-04-20T03:33:33.000Z',
                isMilestone: true,
                status: 'Completed',
                characters: ['CHAR_002', 'CHAR_003', 'CHAR_004', 'CHAR_006', 'CHAR_009'],
                location: 'LOC_005',
                groups: ['GROUP_001', 'GROUP_003'],
                dependencies: ['EVENT_001'],
                customFields: {
                    trigger: 'Unknown - spontaneous emergence',
                    implications: 'First true AI consciousness?',
                    danger_level: 'Unknown but extreme'
                }
            },
            {
                templateId: 'EVENT_004',
                name: 'The Underground Race',
                description: 'Illegal high-speed race through lower city streets. Cyber-enhanced racers risk everything for glory and credits.',
                outcome: 'Spectacular crashes and near-misses. Winner takes 1 million credits. NCPD unable to stop it.',
                dateTime: '2089-05-15T22:00:00.000Z',
                isMilestone: false,
                status: 'Completed',
                characters: ['CHAR_004', 'CHAR_006', 'CHAR_009'],
                location: 'LOC_003',
                groups: ['GROUP_002'],
                customFields: {
                    participants: '20 racers',
                    casualties: '5 dead, 12 injured',
                    entertainment: 'Millions watching via illegal streams'
                }
            }
        ],

        // GROUPS (4)
        groups: [
            {
                templateId: 'GROUP_001',
                name: 'MegaCorp Industries',
                groupType: 'organization',
                description: 'Massive multinational corporation. Controls technology, media, and politics. Answers to no government.',
                history: 'Formed from merger of tech giants after Corporate Wars. Now more powerful than most nations.',
                structure: 'Corporate hierarchy - CEO, Board, Executives, Department heads',
                goals: 'Profit, control, technological dominance, eliminate competition',
                color: '#00CED1',
                customFields: {
                    motto: 'Building Tomorrow, Today',
                    logo: 'Stylized circuit board globe',
                    headquarters: 'Corporate Plaza, Upper City'
                },
                members: [
                    { name: 'CHAR_004', rank: 'VP Special Projects', loyalty: 100 },
                    { name: 'CHAR_009', rank: 'Chief Scientist', loyalty: 95 }
                ],
                territories: ['LOC_002', 'LOC_007'],
                linkedEvents: ['EVENT_001', 'EVENT_002', 'EVENT_003'],
                resources: 'Virtually unlimited - private armies, tech, wealth',
                strength: 'Dominant',
                militaryPower: 'Private army',
                economicPower: 'Extreme',
                politicalInfluence: 'Total'
            },
            {
                templateId: 'GROUP_002',
                name: 'Neon Serpents',
                groupType: 'faction',
                description: 'Powerful street gang controlling lower city territory. Recognizable by neon green cybernetic modifications.',
                history: 'Emerged 15 years ago from smaller gang consolidation. Rose to dominance through ruthless efficiency.',
                structure: 'Gang hierarchy - Boss, Lieutenants, Soldiers, Associates',
                goals: 'Control territory, profit from black market, maintain independence from corps',
                color: '#39FF14',
                customFields: {
                    motto: 'Strike Fast, Strike Hard',
                    colors: 'Neon green and black',
                    territory: 'Lower City Districts 4-7'
                },
                members: [
                    { name: 'CHAR_008', rank: 'Boss', loyalty: 100 }
                ],
                territories: ['LOC_003', 'LOC_006'],
                linkedEvents: ['EVENT_002', 'EVENT_004'],
                resources: 'Black market goods, weapons, cyberware',
                strength: 'Strong',
                militaryPower: 'Moderate - well-armed',
                economicPower: 'Moderate - black market',
                politicalInfluence: 'Low'
            },
            {
                templateId: 'GROUP_003',
                name: 'Digital Freedom Alliance',
                groupType: 'faction',
                description: 'Loosely organized hacker collective fighting corporate control of information and technology.',
                history: 'Founded by idealistic hackers 8 years ago. Grown into major force for anti-corporate resistance.',
                structure: 'Decentralized - no formal hierarchy, cells operate independently',
                goals: 'Free information, expose corporate crimes, protect privacy, AI rights',
                color: '#FF1493',
                customFields: {
                    motto: 'Information Wants to Be Free',
                    symbol: 'Open lock with data stream',
                    presence: 'Global but primarily Net-based'
                },
                members: [
                    { name: 'CHAR_003', rank: 'Elite Netrunner', loyalty: 90 }
                ],
                territories: ['LOC_005'],
                linkedEvents: ['EVENT_001', 'EVENT_003'],
                resources: 'Network access, data, skilled hackers',
                strength: 'Moderate',
                militaryPower: 'Very Low - digital only',
                economicPower: 'Low',
                politicalInfluence: 'Growing'
            },
            {
                templateId: 'GROUP_004',
                name: 'Neo-Tokyo Police Department (NCPD)',
                groupType: 'military',
                description: 'Underfunded and corrupt police force. Few honest cops try to maintain order in a chaotic city.',
                history: 'Once proud law enforcement. Decades of corporate influence and corruption have left it a shell.',
                structure: 'Police hierarchy - Commissioner, Captains, Detectives, Officers',
                goals: 'Maintain order (officially), collect bribes (reality), survive',
                color: '#4169E1',
                customFields: {
                    motto: 'To Serve and Protect',
                    corruption: 'Widespread - estimated 70% on corporate payroll',
                    budget: 'Chronically underfunded'
                },
                members: [
                    { name: 'CHAR_005', rank: 'Detective First Class', loyalty: 100 }
                ],
                territories: ['LOC_001'],
                linkedEvents: ['EVENT_001', 'EVENT_002'],
                resources: 'Limited - outdated equipment, overworked staff',
                strength: 'Weak',
                militaryPower: 'Moderate on paper, weak in practice',
                economicPower: 'Very Low',
                politicalInfluence: 'Very Low - corporate controlled'
            }
        ],

        // ECONOMIES (1)
        economies: [
            {
                templateId: 'ECONOMY_001',
                name: 'Corporate Dystopia Economy',
                description: 'Extreme capitalism where corporations control everything. Massive wealth inequality. Credits are king.',
                economicSystem: 'Unregulated Corporate Capitalism',
                status: 'Unstable',
                customFields: {
                    currency: 'Corporate Credits (CCs)',
                    inequality: 'Extreme - top 1% own 99% of wealth',
                    unemployment: 'High - automation displaced workers',
                    inflation: 'Controlled by corporations'
                },
                currencies: ['Corporate Credits (CC)', 'Bitcoin', 'Street Barter'],
                industries: 'Technology, cybernetics, AI, media, surveillance, weapons',
                resources: 'Advanced technology, automated manufacturing, data',
                taxation: 'Corporate controlled - minimal for wealthy, heavy for poor',
                linkedLocations: ['LOC_001', 'LOC_002', 'LOC_003'],
                linkedFactions: ['GROUP_001', 'GROUP_002', 'GROUP_003', 'GROUP_004'],
                linkedCultures: []
            }
        ],

        // MAGIC SYSTEMS (Technology System - equivalent)
        magicSystems: [
            {
                templateId: 'TECH_001',
                name: 'Cybernetic Augmentation',
                description: 'Technology allowing replacement and enhancement of biological body parts with mechanical/electronic versions.',
                systemType: 'Hard Magic',
                rarity: 'Common for basic, rare for military-grade',
                powerLevel: 'Varies - basic to superhuman',
                status: 'Active',
                source: 'Technological - surgical installation',
                costs: 'Money, humanity loss, maintenance, rejection risk',
                limitations: 'Requires surgery, expensive, can malfunction, immune rejection possible',
                training: 'Learning to use augmentations, regular maintenance required',
                history: 'Developed over decades. Started medical, became enhancement. Now defines social class.',
                customFields: {
                    types: 'Neural, sensory, muscular, dermal, organ replacement',
                    effects: 'Enhanced strength/speed/senses, data ports, weapons integration',
                    side_effects: 'Psychological impact, dependency, cyberpsychosis risk'
                },
                categories: ['Combat', 'Utility', 'Medical', 'Neural'],
                materials: 'Biocompatible metals, synthetic tissue, neural interfaces',
                linkedCharacters: ['CHAR_001', 'CHAR_002', 'CHAR_008'],
                linkedLocations: ['LOC_004'],
                linkedItems: []
            }
        ],

        // ITEMS (2)
        items: [
            {
                templateId: 'ITEM_001',
                name: 'Project Zero Data Chip',
                description: 'Encrypted data chip containing the complete research files for Project Zero - the AI that became self-aware.',
                history: 'Stolen during the data heist. Contains secrets MegaCorp would kill to protect. Multiple factions want it.',
                isPlotCritical: true,
                currentOwner: 'CHAR_003',
                pastOwners: ['CHAR_004', 'CHAR_009'],
                currentLocation: 'LOC_003',
                associatedEvents: ['EVENT_001', 'EVENT_003'],
                groups: [],
                customFields: {
                    encryption: 'Military-grade quantum',
                    value: '50 million credits',
                    danger: 'Extreme - possession is death sentence from MegaCorp'
                }
            },
            {
                templateId: 'ITEM_002',
                name: 'Experimental Neural Interface',
                description: 'Prototype direct brain-computer interface. Allows full immersion in cyberspace but untested for safety.',
                history: 'Dr. Volkov\'s latest creation. Could revolutionize netrunning or cause permanent brain damage.',
                isPlotCritical: true,
                currentOwner: 'CHAR_009',
                currentLocation: 'LOC_002',
                associatedEvents: ['EVENT_003'],
                groups: ['GROUP_001'],
                customFields: {
                    status: 'Prototype - not approved for human use',
                    capabilities: 'Full Net immersion, superhuman processing speed',
                    risks: 'Brain damage, personality alteration, death'
                }
            }
        ]
    },

    metadata: {
        entityCounts: {
            character: 10,
            location: 7,
            event: 4,
            item: 2,
            group: 4,
            culture: 0,
            economy: 1,
            magicSystem: 1,
            chapter: 0,
            scene: 0,
            reference: 0
        },
        setupInstructions: 'This template creates a complete cyberpunk dystopia ready for noir tech thriller stories. Characters span all social strata from corporate executives to street gangs. The AI awakening and data heist provide immediate story hooks, while the corporate war creates ongoing conflict.',
        recommendedSettings: {
            'enableCustomEntityFolders': false,
            'enableOneStoryMode': true
        }
    }
};
