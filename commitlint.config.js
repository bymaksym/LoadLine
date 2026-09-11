module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'scope-case': [2, 'always', 'camel-case'],
        'type-enum': [
            2,
            'always',
            [
                'feat', // New feature
                'fix', // Bug fix
                'chore', // Maintenance tasks
                'docs', // Documentation only
                'style', // Formatting, no code change
                'refactor', // Code change that neither fixes a bug nor adds a feature
                'perf', // Performance improvement
                'test', // Tests only
                'ci', // CI/CD changes
                'build', // Build system or dependencies
                'wip', // Work in progress
            ],
        ],
    },
};
