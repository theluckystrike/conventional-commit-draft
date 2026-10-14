import { DEFAULT_HEADINGS, DEFAULT_TEMPLATE, headingMap, validateTemplate } from './draft';

export interface ReportTemplate { name: string; title: string; project: string; template: string }
export interface ConventionalCommitDraftSettings { headings: string; templates: ReportTemplate[] }
export const DEFAULT_SETTINGS: ConventionalCommitDraftSettings = { headings: DEFAULT_HEADINGS, templates: [] };

export function normalizeSettings(saved: unknown): ConventionalCommitDraftSettings {
	const s = saved && typeof saved === 'object' ? saved as Record<string, unknown> : {};
	let headings = DEFAULT_HEADINGS;
	if (typeof s.headings === 'string') {
		try { headingMap(s.headings); headings = s.headings; } catch { /* Use the defaults. */ }
	}
	const templates: ReportTemplate[] = [];
	if (Array.isArray(s.templates)) for (const value of s.templates.slice(0, 20) as unknown[]) {
		if (!value || typeof value !== 'object') continue;
		const t = value as Record<string, unknown>;
		if (typeof t.name !== 'string' || !t.name.trim() || typeof t.title !== 'string' || typeof t.project !== 'string' || typeof t.template !== 'string') continue;
		try {
			validateTemplate(t.template);
			const name = t.name.trim().slice(0, 80);
			if (!templates.some((entry) => entry.name === name)) templates.push({ name, title: t.title.slice(0, 200), project: t.project.slice(0, 200), template: t.template });
		} catch { /* Drop an invalid saved template. */ }
	}
	return { headings, templates };
}
export const NEW_TEMPLATE: ReportTemplate = { name: 'Project release', title: 'Release draft', project: 'Project', template: DEFAULT_TEMPLATE };
