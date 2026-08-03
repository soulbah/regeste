/** Inventory hand-maintained vocabulary candidates in NLP code.
 *
 * This is deliberately broader than a lint rule: token-type lexers appear in
 * the report too and are classified by a reader. The useful contract is that
 * every multi-word regex or literal collection has a stable file:line, so the
 * cleanup cannot miss a hidden classifier or rely on an old manual count.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const ROOTS = ['analysis', 'nlu', 'pipeline', 'private-ai'].map((folder) =>
	path.join(process.cwd(), 'src/lib', folder)
);

interface Candidate {
	file: string;
	line: number;
	kind: 'regex' | 'literal-list' | 'split-list';
	preview: string;
}

async function sourceFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((entry) => {
			const target = path.join(directory, entry.name);
			if (entry.isDirectory()) return sourceFiles(target);
			return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('.test.')
				? [target]
				: [];
		})
	);
	return nested.flat();
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
	return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function compact(value: string): string {
	return value.replace(/\s+/gu, ' ').slice(0, 140);
}

function regexCandidate(text: string): boolean {
	const body = text.slice(1, text.lastIndexOf('/'));
	const alternatives = body.split('|').filter((part) => /\p{L}{2,}/u.test(part));
	return alternatives.length >= 3;
}

function literalArrayCandidate(node: ts.ArrayLiteralExpression): boolean {
	const literals = node.elements.filter(
		(element) => ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element)
	);
	return literals.length >= 3 && literals.length === node.elements.length;
}

function splitListCandidate(node: ts.CallExpression): boolean {
	if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'split')
		return false;
	const target = node.expression.expression;
	if (!ts.isStringLiteral(target) && !ts.isNoSubstitutionTemplateLiteral(target)) return false;
	return target.text.trim().split(/\s+/u).filter(Boolean).length >= 3;
}

async function inspect(file: string): Promise<Candidate[]> {
	const text = await readFile(file, 'utf8');
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const candidates: Candidate[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isRegularExpressionLiteral(node) && regexCandidate(node.text)) {
			candidates.push({
				file: path.relative(process.cwd(), file),
				line: lineOf(source, node),
				kind: 'regex',
				preview: compact(node.text)
			});
		} else if (ts.isArrayLiteralExpression(node) && literalArrayCandidate(node)) {
			candidates.push({
				file: path.relative(process.cwd(), file),
				line: lineOf(source, node),
				kind: 'literal-list',
				preview: compact(node.getText(source))
			});
		} else if (ts.isCallExpression(node) && splitListCandidate(node)) {
			candidates.push({
				file: path.relative(process.cwd(), file),
				line: lineOf(source, node),
				kind: 'split-list',
				preview: compact(node.getText(source))
			});
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return candidates;
}

const files = (await Promise.all(ROOTS.map(sourceFiles))).flat().sort();
const candidates = (await Promise.all(files.map(inspect))).flat();
const counts = new Map<string, number>();
for (const candidate of candidates)
	counts.set(candidate.file, (counts.get(candidate.file) ?? 0) + 1);

console.log(`NLP vocabulary candidates: ${candidates.length} across ${counts.size} files\n`);
for (const [file, count] of [...counts.entries()].sort(
	(a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
))
	console.log(`${String(count).padStart(3)}  ${file}`);
console.log('');
for (const candidate of candidates)
	console.log(`${candidate.file}:${candidate.line}\t${candidate.kind}\t${candidate.preview}`);
