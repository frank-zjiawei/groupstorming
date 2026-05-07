export interface Message {
  id: string;
  author: string;
  text: string;
  timestamp: number;
}

export interface IdeaNode {
  id: string;
  text: string;
  author?: string;
}

export interface ThemeCluster {
  id: string;
  name: string;
  description: string;
  ideaNodes: IdeaNode[];
}

export interface Relation {
  sourceIdeaText: string;
  targetIdeaText: string;
  type: "supports" | "tensions" | "builds_on" | "relates_to" | "uncertain";
  description: string;
}

export interface EvaluatedIdea {
  id: string;
  summary: string;
  description: string;
  ease: number; // 0-100
  impact: number; // 0-100
  similarIndustryIdea: string;
  similarIdeaOutcome: string;
}

export interface MeetingReport {
  overview: string;
  observations: {
    topic: string;
    factualData: string;
  }[];
  keyTakeaways: string[];
}

export interface Synthesis {
  themeClusters: ThemeCluster[];
  relations: Relation[];
  unresolvedTensions: string[];
  convergencePrompts: string[];
}

export interface BubbleLink {
  source: string;
  target: string;
  timestamp?: number;
}

export interface TimelineEvent {
  id: string;
  type: 'new_idea' | 'build_on_idea';
  summary: string;
  author: string;
  timestamp: number;
  originalText?: string;
}

export interface BubbleState {
  id: string;
  summary: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  radius: number;
  contributors: string[];
  _prevRadius?: number;
  groupId?: string;
  originalText?: string;
  isPill?: boolean;
  timestamp?: number;
  mergedFrom?: BubbleState[];
}
