import { ESLint } from 'eslint';

const blockedRules = new Set([
    'no-unsanitized/method',
    'no-unsanitized/property',
]);
const forbiddenSuppressions = new Set([
    ...blockedRules,
    '@microsoft/sdl/no-inner-html',
    '@typescript-eslint/no-deprecated',
    'obsidianmd/no-static-styles-assignment',
    'obsidianmd/no-unsupported-api',
]);

const eslint = new ESLint({
    overrideConfigFile: 'eslint.obsidian.config.mjs',
    overrideConfig: {
        plugins: {
            'directory-review': {
                rules: {
                    'no-forbidden-suppressions': {
                        create(context) {
                            return {
                                Program() {
                                    for (const comment of context.sourceCode.getAllComments()) {
                                        const directive = comment.value.trim().match(/^eslint-disable(?:-next-line|-line)?(?:\s+|$)([^]*?)(?:\s+--\s+[^]*|$)/);
                                        if (!directive) continue;
                                        const names = directive[1].trim().split(/[,\s]+/).filter(Boolean);
                                        const forbidden = names.filter(name => forbiddenSuppressions.has(name));
                                        if (names.length === 0 || forbidden.length > 0) {
                                            context.report({
                                                loc: comment.loc,
                                                message: names.length
                                                    ? `This disables a rule checked by Obsidian review: ${forbidden.join(', ')}.`
                                                    : 'This disables all ESLint rules, including Obsidian review rules.',
                                            });
                                        }
                                    }
                                },
                            };
                        },
                    },
                },
            },
        },
        rules: {
            'directory-review/no-forbidden-suppressions': 'error',
        },
    },
});

const results = await eslint.lintFiles(['src/**/*.ts']);
let failures = 0;
for (const { filePath, messages, suppressedMessages } of results) {
    for (const message of [...messages, ...suppressedMessages]) {
        if (!message.fatal && !blockedRules.has(message.ruleId)
            && message.ruleId !== 'directory-review/no-forbidden-suppressions') continue;
        console.error(`${filePath}:${message.line}:${message.column} ${message.message}`);
        failures++;
    }
}

if (failures > 0) {
    console.error(`Obsidian review preflight failed with ${failures} finding(s).`);
    process.exitCode = 1;
} else {
    console.log('Obsidian review preflight passed.');
}
