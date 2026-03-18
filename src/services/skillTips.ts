export type SkillUsage = {
  principles: string[];
  taskQuestions: string[];
  checklistItems: string[];
  stepTitles: string[];
};

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n');
}

function extractSectionBullets(lines: string[], startIdx: number): string[] {
  const items: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Stop at next heading.
    if (/^#{1,6}\s+/.test(line)) break;

    // Checkbox lists
    const cb = line.match(/^[-*]\s+\[[ xX]\]\s+(.+)$/);
    if (cb?.[1]) {
      items.push(cb[1].trim());
      continue;
    }

    // Bullets
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet?.[1]) {
      items.push(bullet[1].trim());
      continue;
    }

    // Numbered lists (simple heuristic)
    const numbered = line.match(/^\d+\.\s+(.+)$/);
    if (numbered?.[1]) {
      items.push(numbered[1].trim());
      continue;
    }
  }
  return items;
}

function extractFirstN(items: string[], n: number): string[] {
  return items.map((s) => s.trim()).filter(Boolean).slice(0, n);
}

function findHeadingIndex(lines: string[], headingRegex: RegExp): number {
  return lines.findIndex((l) => headingRegex.test(l.trim().replace(/^#{1,6}\s+/, '')));
}

function findAnyHeadingIndex(lines: string[], headingRegexes: RegExp[]): number {
  for (const re of headingRegexes) {
    const idx = findHeadingIndex(lines, re);
    if (idx !== -1) return idx;
  }
  return -1;
}

export function extractSkillUsage(markdown: string): SkillUsage {
  const text = normalizeMarkdown(markdown);
  const lines = text.split('\n');

  const principlesHeadingIdx = findAnyHeadingIndex(lines, [
    /^Key principles\b/i,
    /^Core Philosophy\b/i,
    /^Principles\b/i,
    /^Core Principles\b/i,
  ].map((r) => r));

  const principles =
    principlesHeadingIdx !== -1
      ? extractSectionBullets(lines, principlesHeadingIdx + 1)
      : [];

  const taskQuestionsHeadingIdx = findAnyHeadingIndex(lines, [
    /^Task-Specific Questions\b/i,
    /^Task specific questions\b/i,
    /^Task-Specific Questions.*$/i,
    /^Task Questions\b/i,
    /^Questions\b/i,
  ]);

  let taskQuestions: string[] = [];
  if (taskQuestionsHeadingIdx !== -1) {
    taskQuestions = extractSectionBullets(lines, taskQuestionsHeadingIdx + 1);
  }

  // Checklist items
  const checklistHeadingIdx = findAnyHeadingIndex(lines, [
    /^Checklist\b/i,
    /^Copy Editing Checklist\b/i,
    /^Quick-Pass Editing Checks\b/i,
    /^Quick-Pass Editing Checklist\b/i,
    /^Final Checks\b/i,
  ]);

  let checklistItems: string[] = [];
  if (checklistHeadingIdx !== -1) {
    // Commonly the checklist is in bullet lines right after the heading.
    checklistItems = extractSectionBullets(lines, checklistHeadingIdx + 1);
  }

  // Step titles / framework headings: Sweep 1, Step 1, Framework, etc.
  const stepTitles: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const m =
      trimmed.match(/^#{1,6}\s+(Sweep\s+\d+[^:]*)/i) ||
      trimmed.match(/^#{1,6}\s+(Step\s+\d+[^:]*)/i) ||
      trimmed.match(/^#{1,6}\s+(Framework[^:]*)/i);

    if (m?.[1]) stepTitles.push(m[1].trim());
    if (stepTitles.length >= 6) break;
  }

  return {
    principles: extractFirstN(principles, 7),
    taskQuestions: extractFirstN(taskQuestions, 7),
    checklistItems: extractFirstN(checklistItems, 10),
    stepTitles: extractFirstN(stepTitles, 5),
  };
}

