import { describe, it, expect } from 'vitest';
import {
    parseBulkVariables,
    serializeVariables,
    detectBulkFormat,
} from '../../src/templates/VariableBulkParser';
import type { TemplateVariable } from '../../src/templates/TemplateTypes';

/** Pull the successfully parsed variables out of a result. */
const ok = (input: string): TemplateVariable[] =>
    parseBulkVariables(input).rows.map(r => r.variable).filter((v): v is TemplateVariable => Boolean(v));

/** Pull the per-row errors out of a result. */
const errors = (input: string): string[] =>
    parseBulkVariables(input).rows.map(r => r.error).filter((e): e is string => Boolean(e));

describe('detectBulkFormat', () => {
    it('reads a JSON array as json', () => {
        expect(detectBulkFormat('[{"name":"a"}]')).toBe('json');
    });

    it('reads a YAML list as yaml', () => {
        expect(detectBulkFormat('- name: a\n  type: text')).toBe('yaml');
    });

    it('falls back to delimited', () => {
        expect(detectBulkFormat('a | text')).toBe('delimited');
        expect(detectBulkFormat('')).toBe('delimited');
    });
});

describe('parseBulkVariables — delimited', () => {
    it('reads a bare name as a text variable labelled after itself', () => {
        expect(ok('characterName')).toEqual([
            { name: 'characterName', label: 'characterName', type: 'text' },
        ]);
    });

    it('reads the pipe-delimited columns from the issue', () => {
        const vars = ok([
            'character_name | text | John Doe',
            'age | number | 21',
            'is_villain | boolean | false',
            'faction | select | rebels;empire;neutral | neutral',
        ].join('\n'));

        expect(vars).toEqual([
            { name: 'character_name', label: 'character_name', type: 'text', defaultValue: 'John Doe' },
            { name: 'age', label: 'age', type: 'number', defaultValue: 21 },
            { name: 'is_villain', label: 'is_villain', type: 'boolean', defaultValue: false },
            {
                name: 'faction', label: 'faction', type: 'select',
                defaultValue: 'neutral', options: ['rebels', 'empire', 'neutral'],
            },
        ]);
    });

    it('keeps a number default numeric and a boolean default boolean', () => {
        const [num, bool] = ok('age | number | 21\nalive | boolean | true');
        expect(num.defaultValue).toBe(21);
        expect(bool.defaultValue).toBe(true);
    });

    it('does not drop a falsy default', () => {
        const [zero, no] = ok('count | number | 0\nvillain | boolean | false');
        expect(zero.defaultValue).toBe(0);
        expect(no.defaultValue).toBe(false);
    });

    it('still reads the original colon-delimited format', () => {
        expect(ok('characterage:number:25:Character age')).toEqual([
            { name: 'characterage', label: 'Character age', type: 'number', defaultValue: 25 },
        ]);
    });

    it('splits on tabs and commas too', () => {
        expect(ok('age\tnumber\t21')[0].defaultValue).toBe(21);
        expect(ok('age,number,21')[0].defaultValue).toBe(21);
    });

    it('prefers the pipe when a value contains a comma', () => {
        const [variable] = ok('title | text | Smith, John');
        expect(variable.defaultValue).toBe('Smith, John');
    });

    it('ignores blank lines and # comments', () => {
        expect(ok('# a comment\n\nname\n')).toHaveLength(1);
    });

    it('reads label and description columns after the default', () => {
        const [variable] = ok('intent | text | revenge | Character intent | What drives them');
        expect(variable.label).toBe('Character intent');
        expect(variable.description).toBe('What drives them');
    });

    it('reads select label and description after the options and default', () => {
        const [variable] = ok('rank | select | low;high | high | Rank tier | How senior they are');
        expect(variable.options).toEqual(['low', 'high']);
        expect(variable.defaultValue).toBe('high');
        expect(variable.label).toBe('Rank tier');
        expect(variable.description).toBe('How senior they are');
    });
});

describe('parseBulkVariables — validation', () => {
    it('rejects a name starting with a number', () => {
        expect(errors('1bad | text')[0]).toMatch(/not a valid name/);
    });

    it('rejects an unknown type', () => {
        expect(errors('a | colour')[0]).toMatch(/unknown type "colour"/);
    });

    it('rejects a select with no options', () => {
        expect(errors('a | select')[0]).toMatch(/needs options/);
    });

    it('rejects options on a non-select', () => {
        expect(errors('a | text | x | y | z')).toHaveLength(0);
        expect(errors('[{"name":"a","type":"text","options":["x"]}]')[0]).toMatch(/only select variables take options/);
    });

    it('rejects a select default that is not one of the options', () => {
        expect(errors('a | select | x;y | z')[0]).toMatch(/not one of the options/);
    });

    it('rejects a non-numeric number default', () => {
        expect(errors('a | number | abc')[0]).toMatch(/not a number/);
    });

    it('rejects a malformed date default', () => {
        expect(errors('a | date | 03-02-1247')[0]).toMatch(/not a yyyy-mm-dd date/);
    });

    it('keeps good rows alongside bad ones', () => {
        const result = parseBulkVariables('good | text\n1bad | text\nalsoGood | number | 3');
        expect(result.rows).toHaveLength(3);
        expect(result.rows.filter(r => r.variable)).toHaveLength(2);
        expect(result.rows.filter(r => r.error)).toHaveLength(1);
    });
});

describe('parseBulkVariables — JSON and YAML', () => {
    it('reads a JSON array', () => {
        const vars = ok('[{"name":"age","type":"number","defaultValue":21,"label":"Age"}]');
        expect(vars).toEqual([{ name: 'age', label: 'Age', type: 'number', defaultValue: 21 }]);
    });

    it('reads a single JSON object', () => {
        expect(ok('{"name":"age","type":"number"}')).toHaveLength(1);
    });

    it('accepts "default" as well as "defaultValue"', () => {
        expect(ok('[{"name":"age","type":"number","default":7}]')[0].defaultValue).toBe(7);
    });

    it('reads a YAML list', () => {
        const vars = ok([
            '- name: faction',
            '  type: select',
            '  options:',
            '    - rebels',
            '    - empire',
            '  default: rebels',
        ].join('\n'));

        expect(vars).toEqual([{
            name: 'faction', label: 'faction', type: 'select',
            defaultValue: 'rebels', options: ['rebels', 'empire'],
        }]);
    });

    it('reports malformed JSON as a fatal error rather than throwing', () => {
        const result = parseBulkVariables('[{"name": ]');
        expect(result.fatalError).toMatch(/Could not read the JSON/);
        expect(result.rows).toHaveLength(0);
    });

    it('flags a JSON entry that is not an object', () => {
        expect(errors('["justAString"]')[0]).toMatch(/expected an object/);
    });
});

describe('serializeVariables', () => {
    it('round-trips through the parser', () => {
        const original: TemplateVariable[] = [
            { name: 'characterName', label: 'characterName', type: 'text' },
            { name: 'age', label: 'Age', type: 'number', defaultValue: 21 },
            { name: 'villain', label: 'villain', type: 'boolean', defaultValue: false },
            {
                name: 'faction', label: 'Faction', type: 'select',
                options: ['rebels', 'empire'], defaultValue: 'rebels',
                description: 'Who they serve',
            },
        ];
        expect(ok(serializeVariables(original))).toEqual(original);
    });

    it('trims a bare variable down to just its name', () => {
        expect(serializeVariables([{ name: 'a', label: 'a', type: 'text' }])).toBe('a | text');
    });

    it('returns an empty string for no variables', () => {
        expect(serializeVariables([])).toBe('');
    });
});
