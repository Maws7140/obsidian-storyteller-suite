// Test script to debug section parsing
const { parseSectionsFromMarkdown } = require('./src/yaml/EntitySections.ts');

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
traits:
  - clever
  - scarred
  - impulsive
status: Alive
affiliation: Ember Guild
profileImagePath: StorytellerSuite/GalleryUploads/1754938487385_ChatGPT_Image_Aug_11_2025_02_53_57_PM.png
groups:
  - me7h97qxna9as5
  - me7m77kw6eu1r1
  - me7p42paumtk7u
---

## Description
Street mage & fixer

## Backstory
Raised in the Underway, Nyla bargains with living fire

`;

console.log('=== Testing Section Parsing ===');

console.log('\n--- Test 1: Test charrr ---');
console.log('Content:', JSON.stringify(testContent1));
try {
  const sections1 = parseSectionsFromMarkdown(testContent1);
  console.log('Parsed sections:', sections1);
} catch (e) {
  console.error('Error:', e.message);
}

console.log('\n--- Test 2: King Sam ---');
console.log('Content:', JSON.stringify(testContent2));
try {
  const sections2 = parseSectionsFromMarkdown(testContent2);
  console.log('Parsed sections:', sections2);
} catch (e) {
  console.error('Error:', e.message);
}

console.log('\n--- Test 3: Nyla Kaede ---');
console.log('Content:', JSON.stringify(testContent3));
try {
  const sections3 = parseSectionsFromMarkdown(testContent3);
  console.log('Parsed sections:', sections3);
} catch (e) {
  console.error('Error:', e.message);
}