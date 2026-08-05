/**
 * Conventional Commits, enforced in CI on the commits a pull request adds.
 *
 * semantic-release reads these same messages to decide the next version, so a
 * malformed subject is not a style problem: it silently drops a change from
 * the changelog, or ships a release nobody asked for. The linter is the only
 * thing standing between a typo and a wrong version number.
 *
 * Deviations from @commitlint/config-conventional are listed below, each with
 * the reason it exists.
 */
export default {
	extends: ['@commitlint/config-conventional'],
	rules: {
		// The default list plus `merge`, which this repo uses for the rare
		// integration commit that carries no single intent.
		'type-enum': [
			2,
			'always',
			[
				'build',
				'chore',
				'ci',
				'docs',
				'feat',
				'fix',
				'merge',
				'perf',
				'refactor',
				'revert',
				'style',
				'test'
			]
		],
		// Subjects here read as sentences and sometimes open on a proper noun
		// ("Cloudflare Web Analytics…"), which the default case rule rejects.
		// What matters for the changelog is the type and the scope, not the
		// capitalisation of the first word.
		'subject-case': [0],
		// 100 is the config-conventional default and the widest subject in this
		// history is 91 characters. Kept explicit so a future tightening is a
		// deliberate edit rather than a dependency bump.
		'header-max-length': [2, 'always', 100],
		// Trailers (`Assisted-by:`, DCO `Signed-off-by:`) are part of the
		// footer, and wrapping them would break the parsers that read them.
		'footer-max-line-length': [0]
	}
};
