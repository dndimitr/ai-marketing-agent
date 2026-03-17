export interface Skill {
  name: string;
  path: string;
  description?: string;
  category?: string;
}

export interface SkillContent {
  name: string;
  markdown: string;
}

export interface Message {
  role: 'user' | 'model';
  content: string;
}
