import * as assert from 'assert';
import { matchesGlob, matchesAnyGlob } from '@metaflow/engine';

suite('globMatcher', () => {
    suite('matchesGlob', () => {
        test('exact match', () => {
            assert.strictEqual(matchesGlob('instructions/coding.md', 'instructions/coding.md'), true);
        });

        test('wildcard pattern', () => {
            assert.strictEqual(matchesGlob('instructions/coding.md', 'instructions/*.md'), true);
            assert.strictEqual(matchesGlob('instructions/coding.txt', 'instructions/*.md'), false);
        });

        test('double-star recursive pattern', () => {
            assert.strictEqual(matchesGlob('instructions/sub/coding.md', '**/*.md'), true);
            assert.strictEqual(matchesGlob('deep/nested/file.md', '**/*.md'), true);
        });

        test('directory prefix pattern', () => {
            assert.strictEqual(matchesGlob('instructions/coding.md', 'instructions/**'), true);
            assert.strictEqual(matchesGlob('prompts/gen.md', 'instructions/**'), false);
        });

        test('dotfiles are matched when dot option enabled', () => {
            assert.strictEqual(matchesGlob('.hidden/file.md', '**/*.md'), true);
        });

        test('backslashes normalized to forward slashes', () => {
            assert.strictEqual(matchesGlob('instructions\\coding.md', 'instructions/*.md'), true);
        });

        test('no match returns false', () => {
            assert.strictEqual(matchesGlob('readme.txt', '*.md'), false);
        });
    });

    suite('matchesAnyGlob', () => {
        test('matches at least one pattern', () => {
            assert.strictEqual(
                matchesAnyGlob('instructions/coding.md', ['*.txt', 'instructions/**']),
                true
            );
        });

        test('matches none returns false', () => {
            assert.strictEqual(
                matchesAnyGlob('readme.txt', ['*.md', '*.json']),
                false
            );
        });

        test('empty patterns returns false', () => {
            assert.strictEqual(matchesAnyGlob('anything.md', []), false);
        });
    });
});
