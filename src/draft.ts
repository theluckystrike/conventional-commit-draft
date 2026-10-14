export const MAX_LINES = 2000;
export const DEFAULT_HEADINGS = 'feat=Features\nfix=Fixes\ndocs=Documentation\nstyle=Style\nrefactor=Refactoring\nperf=Performance\ntest=Tests\nbuild=Build\nci=Continuous integration\nchore=Chores\nrevert=Reverts';
export const DEFAULT_TEMPLATE = '# {{title}}\n\nProject: {{project}}\n\n{{sections}}';

export interface Commit {
	raw: string;
	hash: string;
	type: string;
	scope: string;
	subject: string;
	breaking: boolean;
}
export interface Selection { commits: Commit[]; review: string[]; count: number }
export interface DraftOptions { title: string; project: string; headings: string; template: string }
export const DEFAULT_OPTIONS: DraftOptions = { title: 'Release draft', project: 'Project', headings: DEFAULT_HEADINGS, template: DEFAULT_TEMPLATE };

export function parseSelection(text: string): Selection {
	const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim());
	if (!lines.length) throw new Error('Select one or more commit subjects in the Markdown editor.');
	if (lines.length > MAX_LINES) throw new Error('Selection exceeds the 2,000 nonblank line limit. No draft was created.');
	const commits: Commit[] = [];
	const review: string[] = [];
	for (const raw of lines) {
		const m = /^(?:([a-fA-F0-9]{7,40})\s+)?([a-zA-Z][a-zA-Z0-9-]*)(?:\(([^()\r\n]+)\))?(!)?:[ \t]+(.+)$/.exec(raw.trim());
		if (!m || !m[5]?.trim()) { review.push(raw); continue; }
		commits.push({ raw, hash: m[1] ?? '', type: m[2]!.toLowerCase(), scope: m[3] ?? '', breaking: m[4] === '!', subject: m[5].trim() });
	}
	return { commits, review, count: lines.length };
}

/** Escape user text for a Markdown text node. The preview uses textContent. */
export function literal(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}[\]()#+.!|~^=$%-]/g, '\\$&');
}

export function headingMap(text: string): Map<string, string> {
	const map = new Map<string, string>();
	const lines = text.split('\n').filter((line) => line.trim());
	if (!lines.length || lines.length > 30) throw new Error('Use 1 to 30 type=heading lines.');
	for (const line of lines) {
		const m = /^([a-z][a-z0-9-]*)=(.{1,80})$/.exec(line.trim());
		if (!m || !m[2]?.trim() || map.has(m[1]!)) throw new Error('Use unique lowercase types and nonempty headings in type=heading lines.');
		map.set(m[1]!, m[2].trim());
	}
	return map;
}

export function validateTemplate(text: string): void {
	if (text.length > 10000 || text.split('{{sections}}').length !== 2) throw new Error('The template must have one {{sections}} slot and at most 10,000 characters.');
}

export function buildDraft(selection: Selection, options: DraftOptions = DEFAULT_OPTIONS): string {
	const headings = headingMap(options.headings);
	validateTemplate(options.template);
	const grouped = new Map<string, Commit[]>();
	for (const commit of selection.commits) {
		const group = grouped.get(commit.type) ?? [];
		group.push(commit);
		grouped.set(commit.type, group);
	}
	const types = [...headings.keys(), ...[...grouped.keys()].filter((type) => !headings.has(type))];
	const sections: string[] = [];
	for (const type of types) {
		const group = grouped.get(type);
		if (!group) continue;
		const heading = headings.get(type) ?? `Other (${type})`;
		const entries = group.map((c) => '- ' + (c.breaking ? '**BREAKING** ' : '') + (c.scope ? `(${literal(c.scope)}) ` : '') + literal(c.subject) + (c.hash ? ` (${c.hash})` : ''));
		sections.push(`## ${literal(heading)}\n\n${entries.join('\n')}`);
	}
	if (selection.review.length) sections.push(`## Review\n\n${selection.review.map((line) => '- ' + literal(line)).join('\n')}`);
	// A callback prevents $ replacement syntax and placeholder text in subjects from being expanded.
	return options.template.replace(/\{\{(title|project|sections)\}\}/g, (_, slot: string) => slot === 'sections' ? sections.join('\n\n') : literal(slot === 'title' ? options.title : options.project)).replace(/\n*$/, '') + '\n';
}

export function draftFromText(text: string, options: DraftOptions = DEFAULT_OPTIONS): string {
	return buildDraft(parseSelection(text), options);
}

/** Root-only file names. A title cannot cause a write outside the vault. */
export function fileBase(title: string): string {
	// eslint-disable-next-line no-control-regex -- File names cannot contain control characters.
	const clean = title.normalize().replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').trim();
	// Keep whole code points and reserve bytes for the numbered suffix and extension.
	let base = '';
	let bytes = 0;
	for (const char of [...clean].slice(0, 100)) {
		const code = char.codePointAt(0)!;
		const size = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
		if (bytes + size > 240) break;
		base += char; bytes += size;
	}
	base = base.replace(/[. ]+$/g, '') || 'Release draft';
	return /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(base) ? `_${base}` : base;
}
export function numberedPath(title: string, n: number): string {
	return `${fileBase(title)}${n === 1 ? '' : ` ${n}`}.md`;
}
