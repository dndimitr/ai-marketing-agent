import { Skill, SkillContent } from '../types';

const BASE_URL = 'https://api.github.com/repos/coreyhaines31/marketingskills/contents';
const RAW_BASE_URL = 'https://raw.githubusercontent.com/coreyhaines31/marketingskills/main';

export async function fetchSkills(): Promise<Skill[]> {
  const response = await fetch(`${BASE_URL}/skills`);
  if (!response.ok) throw new Error('Failed to fetch skills');
  const data = await response.json();
  
  return data
    .filter((item: any) => item.type === 'dir')
    .map((item: any) => ({
      name: formatSkillName(item.name),
      path: item.name,
      category: getCategoryForSkill(item.name)
    }));
}

export async function fetchSkillContent(skillPath: string): Promise<SkillContent> {
  const response = await fetch(`${RAW_BASE_URL}/skills/${skillPath}/SKILL.md`);
  if (!response.ok) throw new Error(`Failed to fetch content for ${skillPath}`);
  const markdown = await response.text();
  
  return {
    name: formatSkillName(skillPath),
    markdown
  };
}

function formatSkillName(path: string): string {
  return path
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getCategoryForSkill(path: string): string {
  const categories: Record<string, string[]> = {
    'Conversion Optimization': ['ab-test-setup', 'form-cro', 'onboarding-cro', 'page-cro', 'paywall-upgrade-cro', 'popup-cro', 'signup-flow-cro'],
    'Content & Copy': ['copy-editing', 'copywriting', 'content-strategy', 'social-content', 'cold-email', 'email-sequence', 'lead-magnets'],
    'SEO & Discovery': ['ai-seo', 'programmatic-seo', 'schema-markup', 'seo-audit', 'site-architecture'],
    'Paid & Distribution': ['ad-creative', 'paid-ads', 'launch-strategy'],
    'Measurement & Testing': ['analytics-tracking'],
    'Retention': ['churn-prevention', 'referral-program'],
    'Strategy & Monetization': ['free-tool-strategy', 'marketing-ideas', 'marketing-psychology', 'pricing-strategy', 'product-marketing-context'],
    'Sales & RevOps': ['revops', 'sales-enablement', 'competitor-alternatives']
  };

  for (const [category, skills] of Object.entries(categories)) {
    if (skills.includes(path)) return category;
  }
  return 'General';
}
