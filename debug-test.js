// Simple debug test
const { DateTime } = require('luxon');

// Test BCE regex
const BCE_RE = /\b(\d+)\s*(BC|bce|BCE|B\.C\.|B\.C|B\.C\.E\.|b\.c\.|b\.c\.e\.|bc|b\.c\.e)\b/i;

console.log('Testing regex:');
console.log('"500 BCE":', '500 BCE'.match(BCE_RE));
console.log('"March 15, 500 BCE":', 'March 15, 500 BCE'.match(BCE_RE));

// Test DateTime creation
console.log('\nTesting DateTime:');
const testDate = DateTime.fromObject({ year: -499, month: 3, day: 15 });
console.log('Created DateTime:', { year: testDate.year, month: testDate.month, day: testDate.day });

// Test Chrono
const chrono = require('chrono-node');
const results = chrono.parse('March 15, 500 BCE');
console.log('\nChrono parse result:');
if (results.length > 0) {
  const r = results[0];
  const jsDate = r.start.date();
  const dt = DateTime.fromJSDate(jsDate);
  console.log('Chrono JS Date:', jsDate);
  console.log('Chrono DateTime:', { year: dt.year, month: dt.month, day: dt.day });
}
