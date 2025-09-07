// Simple test script to debug section parsing
function parseSectionsFromMarkdown(content) {
  const sections = {};
  if (!content) return sections;

  // Primary regex: heading starting with `##`, capture until next heading or end.
  const primaryMatches = content.matchAll(/^##\s*([^\n\r]+?)\s*[\n\r]+([\s\S]*?)(?=\n\s*##\s|$)/gm);
  for (const match of primaryMatches) {
    const sectionName = (match[1] || '').trim();
    const sectionContent = (match[2] || '').trim();
    if (sectionName) {
      // Always store the section, even if content is empty - this prevents field bleeding
      sections[sectionName] = sectionContent;
    }
  }

  if (Object.keys(sections).length > 0) return sections;

  // Fallback splitter: tolerant parsing when regex misses
  if (content.includes('##')) {
    const lines = content.split('\n');
    let currentSection = '';
    let buffer = [];
    for (const line of lines) {
      if (line.startsWith('##')) {
        if (currentSection) {
          const text = buffer.join('\n').trim();
          // Always store the section, even if empty - this prevents field bleeding
          sections[currentSection] = text;
        }
        currentSection = line.replace(/^##\s*/, '').trim();
        buffer = [];
      } else if (currentSection) {
        buffer.push(line);
      }
    }
    if (currentSection) {
      const text = buffer.join('\n').trim();
      // Always store the section, even if empty - this prevents field bleeding
      sections[currentSection] = text;
    }
  }

  return sections;
}

const testContent1 = `---
name: "Test charrr "
---

## Description
Samm
## Backstory
Hello `;

const testContent2 = `---
name: King Sam
---

## Description
jndjnjcncjd

## Backstory
`;

const testContent3 = `---
Element: Flame
name: Nyla Kaede
---

## Description
Street mage & fixer

## Backstory
Raised in the Underway, Nyla bargains with living fire

`;

console.log('=== Testing Section Parsing ===');

console.log('\n--- Test 1: Test charrr (no newline between sections) ---');
const sections1 = parseSectionsFromMarkdown(testContent1);
console.log('Parsed sections:', JSON.stringify(sections1, null, 2));

console.log('\n--- Test 2: King Sam (empty backstory) ---');
const sections2 = parseSectionsFromMarkdown(testContent2);
console.log('Parsed sections:', JSON.stringify(sections2, null, 2));

console.log('\n--- Test 3: Nyla Kaede (proper format) ---');
const sections3 = parseSectionsFromMarkdown(testContent3);
console.log('Parsed sections:', JSON.stringify(sections3, null, 2));

console.log('\n=== Done ===');
