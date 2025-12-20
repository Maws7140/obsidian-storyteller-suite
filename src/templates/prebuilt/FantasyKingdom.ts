/**
 * Fantasy Kingdom Template
 * A complete medieval fantasy kingdom with castle, nobles, guards, merchants, and magic
 */

import { Template } from '../TemplateTypes';

export const FANTASY_KINGDOM_TEMPLATE: Template = {
    id: 'builtin-fantasy-kingdom-v1',
    name: 'Fantasy Kingdom',
    description: 'A complete medieval fantasy kingdom with castle, noble houses, city watch, merchants guild, and elemental magic system. Perfect for starting a high fantasy story.',
    genre: 'fantasy',
    category: 'full-world',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2025-01-15T00:00:00.000Z',
    modified: '2025-01-15T00:00:00.000Z',
    tags: ['fantasy', 'medieval', 'kingdom', 'magic', 'nobility', 'castle'],

    entities: {
        // CHARACTERS (12)
        characters: [
            {
                templateId: 'CHAR_001',
                yamlContent: `name: "King Aldric Stormhaven"
traits: ["Wise", "Just", "Strategic", "Diplomatic", "Aging"]
status: "Alive"
affiliation: "House Stormhaven"
age: "54"
title: "King of Arendor"
weapon: "Ceremonial Longsword"
relationships:
  - target: "CHAR_002"
    type: "romantic"
    label: "spouse"
  - target: "CHAR_003"
    type: "family"
    label: "son"
  - target: "CHAR_004"
    type: "ally"
    label: "trusts completely"
  - target: "CHAR_005"
    type: "ally"
    label: "advisor"
locations: ["LOC_001", "LOC_002"]
events: ["EVENT_001", "EVENT_005"]
groups: ["GROUP_001"]
connections:
  - target: "LOC_001"
    type: "ally"
    label: "resides"
  - target: "GROUP_001"
    type: "ally"
    label: "leads"`,
                markdownContent: `## Description

The aging but wise ruler of the Kingdom of Arendor. Known for his just governance and strategic mind.

## Backstory

Born into House Stormhaven, Aldric ascended to the throne at age 30 after his father's passing. His 24-year reign has been marked by prosperity and peace, though shadows gather at the borders.`
            },
            {
                templateId: 'CHAR_002',
                name: 'Queen Elara Stormhaven',
                description: 'Graceful and politically astute royal consort. Known for her diplomatic skills and charity work.',
                backstory: 'Daughter of a neighboring kingdom, Elara\'s marriage to Aldric was political at first, but grew into deep love. She manages the court and foreign relations.',
                traits: ['Diplomatic', 'Graceful', 'Intelligent', 'Compassionate'],
                status: 'Alive',
                affiliation: 'House Stormhaven',
                customFields: {
                    age: '48',
                    title: 'Queen of Arendor',
                    specialty: 'Diplomacy'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'romantic', label: 'spouse' },
                    { target: 'CHAR_003', type: 'family', label: 'son' }
                ],
                locations: ['LOC_001'],
                events: ['EVENT_001', 'EVENT_003'],
                groups: ['GROUP_001']
            },
            {
                templateId: 'CHAR_003',
                name: 'Prince Theron Stormhaven',
                description: 'Young heir to the throne, eager to prove himself but still learning the weight of leadership.',
                backstory: 'Raised in the castle, Theron has been trained in combat, strategy, and statecraft. He yearns for adventure but understands his duty.',
                traits: ['Brave', 'Eager', 'Idealistic', 'Skilled Fighter'],
                status: 'Alive',
                affiliation: 'House Stormhaven',
                customFields: {
                    age: '22',
                    title: 'Crown Prince',
                    weapon: 'Longsword and Shield'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'family', label: 'father' },
                    { target: 'CHAR_002', type: 'family', label: 'mother' },
                    { target: 'CHAR_007', type: 'mentor', label: 'trains with' }
                ],
                locations: ['LOC_001', 'LOC_008'],
                events: ['EVENT_001', 'EVENT_002'],
                groups: ['GROUP_001']
            },
            {
                templateId: 'CHAR_004',
                name: 'Lord Commander Marcus Ironforge',
                description: 'Grizzled veteran military leader. Commands the kingdom\'s armies with tactical brilliance.',
                backstory: 'Rose through the ranks from common soldier to Lord Commander. His loyalty to the crown is absolute, earned through decades of service.',
                traits: ['Tactical', 'Loyal', 'Stern', 'Experienced', 'Honorable'],
                status: 'Alive',
                affiliation: 'Royal Army',
                customFields: {
                    age: '58',
                    rank: 'Lord Commander',
                    weapon: 'Warhammer'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'ally', label: 'serves' },
                    { target: 'CHAR_007', type: 'ally', label: 'commands' },
                    { target: 'CHAR_003', type: 'mentor', label: 'trains' }
                ],
                locations: ['LOC_001', 'LOC_008'],
                events: ['EVENT_002', 'EVENT_005'],
                groups: ['GROUP_002']
            },
            {
                templateId: 'CHAR_005',
                name: 'Court Wizard Merrick Shadowmend',
                description: 'Mysterious and powerful mage who advises the king on magical matters and threats.',
                backstory: 'Arrived at court 15 years ago, offering his services. His past is shrouded in mystery, but his loyalty has been proven time and again.',
                traits: ['Wise', 'Mysterious', 'Powerful', 'Scholarly', 'Cautious'],
                status: 'Alive',
                affiliation: 'Royal Court',
                customFields: {
                    age: 'Unknown (appears 60)',
                    specialty: 'Elemental Magic',
                    familiar: 'Raven named Nightwing'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'ally', label: 'advises' },
                    { target: 'CHAR_012', type: 'rival', label: 'wary of' }
                ],
                locations: ['LOC_001', 'LOC_003'],
                events: ['EVENT_004'],
                groups: ['GROUP_001']
            },
            {
                templateId: 'CHAR_006',
                name: 'Lady Seraphine Moonwhisper',
                description: 'Noble lady from an ancient bloodline. Manages extensive estates and has considerable political influence.',
                backstory: 'Head of House Moonwhisper, one of the oldest noble families. Shrewd politician who carefully balances tradition and progress.',
                traits: ['Shrewd', 'Elegant', 'Traditional', 'Influential'],
                status: 'Alive',
                affiliation: 'House Moonwhisper',
                customFields: {
                    age: '42',
                    title: 'Lady of House Moonwhisper',
                    estates: 'Three manors, vineyard'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'ally', label: 'supports' },
                    { target: 'CHAR_010', type: 'ally', label: 'business partner' }
                ],
                locations: ['LOC_001', 'LOC_004'],
                events: ['EVENT_003', 'EVENT_005'],
                groups: ['GROUP_001']
            },
            {
                templateId: 'CHAR_007',
                name: 'Captain Roderick Ashblade',
                description: 'Skilled captain of the City Watch. Maintains order in the capital with firm but fair hand.',
                backstory: 'Former adventurer who settled down to serve the crown. His experience in the field makes him an excellent trainer and leader.',
                traits: ['Disciplined', 'Fair', 'Experienced', 'Vigilant'],
                status: 'Alive',
                affiliation: 'City Watch',
                customFields: {
                    age: '38',
                    rank: 'Captain',
                    weapon: 'Longsword'
                },
                relationships: [
                    { target: 'CHAR_004', type: 'ally', label: 'reports to' },
                    { target: 'CHAR_003', type: 'mentor', label: 'trains' }
                ],
                locations: ['LOC_001', 'LOC_004'],
                events: ['EVENT_002'],
                groups: ['GROUP_002']
            },
            {
                templateId: 'CHAR_008',
                name: 'Brother Aldwin Lightbringer',
                description: 'Gentle priest who tends to the spiritual needs of the people and the royal family.',
                backstory: 'Dedicated his life to serving the divine. Known for his healing abilities and compassionate counsel.',
                traits: ['Compassionate', 'Faithful', 'Gentle', 'Healing'],
                status: 'Alive',
                affiliation: 'Temple of Light',
                customFields: {
                    age: '51',
                    title: 'High Priest',
                    deity: 'The Radiant One'
                },
                relationships: [
                    { target: 'CHAR_001', type: 'ally', label: 'counsels' },
                    { target: 'CHAR_002', type: 'ally', label: 'counsels' }
                ],
                locations: ['LOC_001'],
                events: ['EVENT_001', 'EVENT_003'],
                groups: []
            },
            {
                templateId: 'CHAR_009',
                name: 'Master Blacksmith Duran Hammerfall',
                description: 'Renowned craftsman whose weapons and armor are sought throughout the realm.',
                backstory: 'Third generation master smith. His forge has supplied the royal army for three generations.',
                traits: ['Skilled', 'Gruff', 'Perfectionist', 'Strong'],
                status: 'Alive',
                affiliation: 'Smithing Guild',
                customFields: {
                    age: '45',
                    specialty: 'Weapons and Armor',
                    notable_work: 'Prince Theron\'s sword'
                },
                relationships: [
                    { target: 'CHAR_003', type: 'acquaintance', label: 'crafted sword for' },
                    { target: 'CHAR_010', type: 'ally', label: 'guild colleague' }
                ],
                locations: ['LOC_004'],
                events: [],
                groups: ['GROUP_003']
            },
            {
                templateId: 'CHAR_010',
                name: 'Guildmaster Yara Goldleaf',
                description: 'Shrewd leader of the Merchants Guild. Controls much of the kingdom\'s trade and commerce.',
                backstory: 'Started as a simple trader, built a merchant empire through wit and determination. Now holds significant economic power.',
                traits: ['Shrewd', 'Ambitious', 'Charming', 'Wealthy'],
                status: 'Alive',
                affiliation: 'Merchants Guild',
                customFields: {
                    age: '39',
                    title: 'Guildmaster',
                    wealth: 'Extensive'
                },
                relationships: [
                    { target: 'CHAR_006', type: 'ally', label: 'business partner' },
                    { target: 'CHAR_011', type: 'acquaintance', label: 'frequent customer' }
                ],
                locations: ['LOC_004'],
                events: ['EVENT_005'],
                groups: ['GROUP_003']
            },
            {
                templateId: 'CHAR_011',
                name: 'Finn Oakbarrel',
                description: 'Friendly tavern keeper who hears all the gossip and news in the kingdom.',
                backstory: 'Runs the most popular tavern in the city. A good listener and source of information for those who know to ask.',
                traits: ['Friendly', 'Observant', 'Discreet', 'Jovial'],
                status: 'Alive',
                affiliation: 'Common Folk',
                customFields: {
                    age: '35',
                    business: 'The Prancing Pony Tavern',
                    specialty: 'Information gathering'
                },
                relationships: [
                    { target: 'CHAR_012', type: 'acquaintance', label: 'frequent patron' }
                ],
                locations: ['LOC_005'],
                events: ['EVENT_003'],
                groups: []
            },
            {
                templateId: 'CHAR_012',
                name: 'The Mysterious Stranger',
                description: 'A hooded figure recently arrived in the kingdom. Their purpose and identity remain unknown.',
                backstory: 'Appeared shortly before strange events began occurring. Asks many questions but reveals nothing about themselves.',
                traits: ['Mysterious', 'Secretive', 'Observant', 'Cautious'],
                status: 'Unknown',
                affiliation: 'Unknown',
                customFields: {
                    age: 'Unknown',
                    true_identity: 'To be revealed',
                    magic_ability: 'Suspected'
                },
                relationships: [
                    { target: 'CHAR_005', type: 'rival', label: 'interests' },
                    { target: 'CHAR_011', type: 'acquaintance', label: 'frequents tavern' }
                ],
                locations: ['LOC_005', 'LOC_007'],
                events: ['EVENT_004'],
                groups: []
            }
        ],

        // LOCATIONS (8)
        locations: [
            {
                templateId: 'LOC_001',
                name: 'Castle Stormhaven',
                description: 'The magnificent seat of power for House Stormhaven. Towering walls of grey stone overlook the capital city.',
                history: 'Built 300 years ago by the first Stormhaven king. Has withstood three sieges and countless political intrigues.',
                locationType: 'Castle',
                region: 'Capital District',
                status: 'Occupied',
                customFields: {
                    size: 'Large',
                    defenses: 'High walls, guard towers, moat',
                    population: '500+ residents'
                },
                groups: ['GROUP_001'],
                connections: [
                    { target: 'GROUP_001', type: 'ally', label: 'seat of power' }
                ]
            },
            {
                templateId: 'LOC_002',
                name: 'Royal Throne Room',
                description: 'Grand hall where the king holds court. High vaulted ceilings, stained glass windows, and the ancient Throne of Arendor.',
                history: 'The throne itself is said to date back to the kingdom\'s founding. Every king has been crowned here.',
                locationType: 'Interior - Great Hall',
                region: 'Castle Stormhaven',
                parentLocation: 'LOC_001',
                status: 'Active',
                groups: ['GROUP_001']
            },
            {
                templateId: 'LOC_003',
                name: 'Royal Library and Archives',
                description: 'Vast collection of books, scrolls, and magical tomes. The wizard Merrick spends much of his time here.',
                history: 'Accumulated knowledge over three centuries. Contains some of the rarest magical texts in the realm.',
                locationType: 'Interior - Library',
                region: 'Castle Stormhaven',
                parentLocation: 'LOC_001',
                status: 'Restricted Access',
                customFields: {
                    volumes: '10,000+',
                    magical_tomes: 'Extensive collection',
                    keeper: 'Court Wizard Merrick'
                },
                groups: []
            },
            {
                templateId: 'LOC_004',
                name: 'Market District',
                description: 'Bustling center of commerce. Merchants, craftsmen, and traders from across the realm gather here.',
                history: 'Grew organically outside the castle walls. Now the economic heart of the kingdom.',
                locationType: 'Urban - Commercial',
                region: 'Capital City',
                status: 'Active',
                customFields: {
                    market_days: 'Daily',
                    specialties: 'Weapons, cloth, food, exotic goods'
                },
                groups: ['GROUP_003'],
                connections: [
                    { target: 'GROUP_003', type: 'ally', label: 'controlled by' }
                ]
            },
            {
                templateId: 'LOC_005',
                name: 'The Prancing Pony Tavern',
                description: 'Popular tavern and inn. Common ground for nobles and commoners alike. Known for good ale and better gossip.',
                history: 'Family-run establishment for four generations. Has been witness to countless deals and conspiracies.',
                locationType: 'Building - Tavern',
                region: 'Market District',
                parentLocation: 'LOC_004',
                status: 'Operating',
                customFields: {
                    owner: 'Finn Oakbarrel',
                    specialty: 'Honey mead',
                    rooms: '12 for rent'
                },
                groups: []
            },
            {
                templateId: 'LOC_006',
                name: 'Whispering Woods',
                description: 'Ancient forest to the east. Beautiful but mysterious, with rumors of magical creatures and hidden ruins.',
                history: 'Predates the kingdom itself. Local legends speak of fae folk and ancient magic within its depths.',
                locationType: 'Wilderness - Forest',
                region: 'Eastern Border',
                status: 'Wild',
                customFields: {
                    size: 'Vast',
                    danger_level: 'Moderate',
                    resources: 'Timber, herbs, game'
                },
                groups: []
            },
            {
                templateId: 'LOC_007',
                name: 'Ancient Ruins of Shadowkeep',
                description: 'Crumbling fortress from a forgotten age. Recently, strange lights and sounds have been reported here.',
                history: 'Predates the kingdom. Historical records are scarce, but it was clearly once a place of great power.',
                locationType: 'Ruins - Fortress',
                region: 'Whispering Woods',
                parentLocation: 'LOC_006',
                status: 'Abandoned (Recently Active?)',
                customFields: {
                    age: 'Unknown (Ancient)',
                    danger_level: 'High',
                    magical_signature: 'Strong'
                },
                groups: []
            },
            {
                templateId: 'LOC_008',
                name: 'Northern Border Fort',
                description: 'Military outpost guarding the kingdom\'s northern frontier. Recently reinforced due to increased raids.',
                history: 'Built 50 years ago to defend against northern tribes. Now facing renewed threats.',
                locationType: 'Military - Fort',
                region: 'Northern Border',
                status: 'Garrisoned',
                customFields: {
                    garrison: '200 soldiers',
                    commander: 'Lord Commander Marcus',
                    defenses: 'Wooden palisade, watchtowers'
                },
                groups: ['GROUP_002']
            }
        ],

        // EVENTS (5)
        events: [
            {
                templateId: 'EVENT_001',
                name: 'The Royal Coronation',
                description: 'King Aldric\'s coronation ceremony 24 years ago. The beginning of an era of peace and prosperity.',
                outcome: 'Aldric was crowned king and has ruled wisely ever since. The ceremony unified the noble houses.',
                dateTime: '1201-03-15',
                isMilestone: true,
                status: 'Completed',
                characters: ['CHAR_001', 'CHAR_002', 'CHAR_008'],
                location: 'LOC_002',
                groups: ['GROUP_001'],
                customFields: {
                    attendees: 'All noble houses, foreign dignitaries',
                    significance: 'Beginning of current reign'
                }
            },
            {
                templateId: 'EVENT_002',
                name: 'Border Skirmish at Northern Fort',
                description: 'Raiders from the north attacked the border fort. The attack was repelled but revealed concerning coordination.',
                outcome: 'Fort successfully defended. Raiders retreated, but their tactics suggest organization and planning.',
                dateTime: '1225-07-22',
                isMilestone: false,
                status: 'Completed',
                characters: ['CHAR_004', 'CHAR_007', 'CHAR_003'],
                location: 'LOC_008',
                groups: ['GROUP_002'],
                dependencies: ['EVENT_001'],
                customFields: {
                    casualties: 'Minimal',
                    enemy_force: 'Approximately 50 raiders',
                    concern_level: 'High'
                }
            },
            {
                templateId: 'EVENT_003',
                name: 'Harvest Festival',
                description: 'Annual celebration of the harvest. The capital fills with music, food, and festivities.',
                outcome: 'Successful festival that strengthened bonds between nobility and common folk.',
                dateTime: '1225-09-15',
                isMilestone: false,
                status: 'Completed',
                characters: ['CHAR_001', 'CHAR_002', 'CHAR_006', 'CHAR_008', 'CHAR_011'],
                location: 'LOC_004',
                groups: ['GROUP_003'],
                dependencies: ['EVENT_001'],
                customFields: {
                    duration: '3 days',
                    attendance: 'Thousands',
                    activities: 'Markets, tournaments, feasts'
                }
            },
            {
                templateId: 'EVENT_004',
                name: 'Discovery at the Ancient Ruins',
                description: 'Strange magical phenomena detected at Shadowkeep ruins. The Court Wizard investigates.',
                outcome: 'Investigation ongoing. Merrick found evidence of recent magical activity and the mysterious stranger.',
                dateTime: '1225-10-01',
                isMilestone: true,
                status: 'Ongoing',
                characters: ['CHAR_005', 'CHAR_012'],
                location: 'LOC_007',
                groups: [],
                dependencies: ['EVENT_001'],
                customFields: {
                    discovery: 'Ancient magical artifact activated',
                    danger_level: 'Unknown',
                    next_steps: 'Further investigation required'
                }
            },
            {
                templateId: 'EVENT_005',
                name: 'Trade Summit with Neighboring Kingdoms',
                description: 'Important diplomatic gathering to negotiate trade agreements and mutual defense pacts.',
                outcome: 'Pending - summit scheduled for next month.',
                dateTime: '1225-11-15',
                isMilestone: true,
                status: 'Upcoming',
                characters: ['CHAR_001', 'CHAR_002', 'CHAR_004', 'CHAR_006', 'CHAR_010'],
                location: 'LOC_001',
                groups: ['GROUP_001', 'GROUP_003'],
                dependencies: ['EVENT_001', 'EVENT_003'],
                customFields: {
                    attendees: 'Five neighboring kingdoms',
                    stakes: 'High - economic and military alliance',
                    preparation: 'Extensive'
                }
            }
        ],

        // GROUPS (3)
        groups: [
            {
                templateId: 'GROUP_001',
                name: 'House Stormhaven',
                groupType: 'faction',
                description: 'The ruling royal family of the Kingdom of Arendor. Known for just and wise governance.',
                history: 'Founded the kingdom 300 years ago. Has maintained power through combination of military strength and popular support.',
                structure: 'Hereditary monarchy with advisory council',
                goals: 'Maintain stability, protect the realm, ensure prosperity',
                color: '#4169E1',
                customFields: {
                    motto: 'Through Storm and Thunder',
                    sigil: 'Lightning bolt over castle',
                    seat: 'Castle Stormhaven'
                },
                members: [
                    { type: 'character', id: 'CHAR_001', name: 'CHAR_001', rank: 'King', joinDate: '1201-03-15', loyalty: 'devoted' },
                    { type: 'character', id: 'CHAR_002', name: 'CHAR_002', rank: 'Queen', joinDate: '1201-03-15', loyalty: 'devoted' },
                    { type: 'character', id: 'CHAR_003', name: 'CHAR_003', rank: 'Crown Prince', joinDate: '1203-05-20', loyalty: 'devoted' },
                    { type: 'character', id: 'CHAR_005', name: 'CHAR_005', rank: 'Court Wizard', joinDate: '1210-08-10', loyalty: 'devoted' },
                    { type: 'character', id: 'CHAR_006', name: 'CHAR_006', rank: 'Allied Noble', joinDate: '1201-03-15', loyalty: 'loyal' }
                ],
                territories: ['LOC_001', 'LOC_002', 'LOC_003'],
                linkedEvents: ['EVENT_001', 'EVENT_005'],
                resources: 'Extensive - treasury, lands, military',
                strength: 'Very High',
                militaryPower: 85,
                economicPower: 85,
                politicalInfluence: 100
            },
            {
                templateId: 'GROUP_002',
                name: 'The City Watch',
                groupType: 'military',
                description: 'The kingdom\'s standing army and city guard. Maintains law and order throughout the realm.',
                history: 'Established with the kingdom. Professionalized under Lord Commander Marcus\'s leadership.',
                structure: 'Military hierarchy - Lord Commander, Captains, Soldiers',
                goals: 'Protect the kingdom, maintain order, defend borders',
                color: '#8B4513',
                customFields: {
                    motto: 'Ever Vigilant',
                    sigil: 'Crossed swords',
                    headquarters: 'Castle Stormhaven'
                },
                members: [
                    { type: 'character', id: 'CHAR_004', name: 'CHAR_004', rank: 'Lord Commander', joinDate: '1195-01-01', loyalty: 'devoted' },
                    { type: 'character', id: 'CHAR_007', name: 'CHAR_007', rank: 'Captain', joinDate: '1215-03-15', loyalty: 'devoted' }
                ],
                territories: ['LOC_001', 'LOC_008'],
                linkedEvents: ['EVENT_002'],
                resources: 'Moderate - royal funding, equipment',
                strength: 'High',
                militaryPower: 90,
                economicPower: 50,
                politicalInfluence: 55
            },
            {
                templateId: 'GROUP_003',
                name: 'Merchants Guild',
                groupType: 'guild',
                description: 'Powerful economic organization controlling most trade and commerce in the kingdom.',
                history: 'Formed 150 years ago by merchant families. Has grown to wield significant economic and political power.',
                structure: 'Elected Guildmaster, council of senior merchants',
                goals: 'Increase profits, protect trade routes, expand influence',
                color: '#FFD700',
                customFields: {
                    motto: 'Trade Enriches All',
                    sigil: 'Gold coin with merchant ship',
                    headquarters: 'Market District'
                },
                members: [
                    { type: 'character', id: 'CHAR_010', name: 'CHAR_010', rank: 'Guildmaster', joinDate: '1220-01-01', loyalty: 'devoted' },
                    { type: 'character', id: 'CHAR_009', name: 'CHAR_009', rank: 'Master Craftsman', joinDate: '1215-06-01', loyalty: 'loyal' }
                ],
                territories: ['LOC_004'],
                linkedEvents: ['EVENT_003', 'EVENT_005'],
                resources: 'High - wealth, trade connections, warehouses',
                strength: 'Moderate',
                militaryPower: 20,
                economicPower: 90,
                politicalInfluence: 70
            }
        ],

        // CULTURES (1)
        cultures: [
            {
                templateId: 'CULTURE_001',
                name: 'Kingdom of Arendor',
                description: 'Medieval European-inspired culture with strong traditions of chivalry, honor, and magical respect.',
                values: 'Honor, loyalty, justice, courage, wisdom',
                religion: 'Worship of the Radiant One, a deity of light and order',
                socialStructure: 'Feudal monarchy with nobility, merchants, craftsmen, and peasants',
                history: 'Founded 300 years ago by the first Stormhaven king. Has maintained stability through just governance and magical integration.',
                customFields: {
                    architecture: 'Stone castles, timber-frame buildings',
                    clothing: 'Medieval tunics, gowns, armor for warriors',
                    cuisine: 'Roasted meats, bread, stews, mead'
                },
                governmentType: 'Hereditary Monarchy',
                techLevel: 'Medieval',
                status: 'Thriving',
                population: 'Approximately 100,000',
                linkedLocations: ['LOC_001', 'LOC_004'],
                linkedCharacters: ['CHAR_001', 'CHAR_002', 'CHAR_003', 'CHAR_004', 'CHAR_005', 'CHAR_006', 'CHAR_007', 'CHAR_008', 'CHAR_009', 'CHAR_010', 'CHAR_011']
            }
        ],

        // ECONOMIES (1)
        economies: [
            {
                templateId: 'ECONOMY_001',
                name: 'Feudal Trade Economy',
                description: 'Agricultural base with growing merchant trade. Currency-based with gold, silver, and copper coins.',
                economicSystem: 'Feudal with market economy',
                status: 'Stable',
                customFields: {
                    primary_industry: 'Agriculture',
                    secondary_industry: 'Trade and crafts',
                    unemployment: 'Low',
                    inflation: 'Stable'
                },
                currencies: [
                    { name: 'Gold Crown' },
                    { name: 'Silver Penny' },
                    { name: 'Copper Bit' }
                ],
                industries: 'Agriculture, metalworking, textiles, timber, livestock',
                taxation: 'Feudal taxes, trade tariffs, guild fees',
                linkedLocations: ['LOC_001', 'LOC_004'],
                linkedFactions: ['GROUP_001', 'GROUP_003'],
                linkedCultures: ['CULTURE_001']
            }
        ],

        // MAGIC SYSTEMS (1)
        magicSystems: [
            {
                templateId: 'MAGIC_001',
                name: 'Elemental Magic',
                description: 'Magic system based on control of the four classical elements: Fire, Water, Earth, and Air.',
                systemType: 'Hard Magic',
                rarity: 'Rare',
                powerLevel: 'Moderate to High',
                status: 'Active',
                source: 'Innate talent combined with rigorous study',
                costs: 'Mental fatigue, physical exhaustion with overuse',
                limitations: 'Requires focus, training, and knowledge. Each mage typically masters only 1-2 elements.',
                training: 'Years of study and practice. Usually apprenticeship with experienced mage.',
                history: 'Ancient art passed down through generations. Respected but sometimes feared by common folk.',
                customFields: {
                    elements: 'Fire, Water, Earth, Air',
                    notable_effects: 'Fireballs, ice walls, earth shaping, wind blasts',
                    advanced_techniques: 'Element combination, permanent enchantments'
                },
                categories: [
                    { name: 'Evocation' },
                    { name: 'Transmutation' },
                    { name: 'Enchantment' }
                ],
                materials: ['Focus items (staffs, wands)', 'spell components', 'elemental crystals'],
                linkedCharacters: ['CHAR_005'],
                linkedCultures: ['CULTURE_001'],
                linkedLocations: ['LOC_003']
            }
        ],

        // ITEMS (1 - Crown of Arendor)
        items: [
            {
                templateId: 'ITEM_001',
                name: 'Crown of Arendor',
                description: 'Ancient golden crown set with sapphires and diamonds. Worn by every king of Arendor since the kingdom\'s founding.',
                history: 'Forged 300 years ago for the first king. Said to contain subtle enchantments of authority and wisdom.',
                isPlotCritical: true,
                currentOwner: 'CHAR_001',
                pastOwners: [],
                currentLocation: 'LOC_002',
                associatedEvents: ['EVENT_001'],
                groups: ['GROUP_001'],
                customFields: {
                    material: 'Gold, sapphires, diamonds',
                    magical_properties: 'Enhances wearer\'s authority and wisdom',
                    value: 'Priceless'
                }
            }
        ]
    },

    metadata: {
        entityCounts: {
            character: 12,
            location: 8,
            event: 5,
            item: 1,
            group: 3,
            culture: 1,
            economy: 1,
            magicSystem: 1,
            chapter: 0,
            scene: 0,
            reference: 0
        },
        setupInstructions: 'This template creates a complete fantasy kingdom ready for storytelling. All characters have established relationships, locations are interconnected, and events provide both history and hooks for future stories. The mysterious stranger and ancient ruins provide immediate plot hooks to explore.',
        recommendedSettings: {
            'enableCustomEntityFolders': false,
            'enableOneStoryMode': true
        }
    }
};
