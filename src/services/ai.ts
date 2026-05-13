import Anthropic from "@anthropic-ai/sdk";
import { Message, Synthesis, EvaluatedIdea, MeetingReport } from "../types";
import whackPackTemplate from "../data/whack_pack_template.txt?raw";

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

const SONNET = "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5-20251001";

function isQuotaError(error: any): boolean {
  if (!error) return false;
  if (error.status === 429) return true;
  const type = error?.error?.error?.type || error?.error?.type;
  if (type === "rate_limit_error" || type === "overloaded_error") return true;
  const msg = (error?.message || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("quota") || msg.includes("overloaded");
}

function transcriptOf(messages: Message[]): string {
  return messages.map((m) => `${m.author}: ${m.text}`).join("\n");
}

function getToolInput<T>(response: Anthropic.Messages.Message, toolName: string): T {
  const block = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === toolName,
  );
  if (!block) throw new Error(`Model did not call tool ${toolName}`);
  return block.input as T;
}

export async function brainstormSimilarIdeas(ideaSummary: string, context: string): Promise<string[]> {
  try {
    const response = await client.messages.create({
      model: HAIKU,
      max_tokens: 512,
      tools: [
        {
          name: "report_similar_ideas",
          description: "Report 2-3 real-world existing products or features that are similar to the given idea.",
          input_schema: {
            type: "object",
            properties: {
              ideas: {
                type: "array",
                items: { type: "string", description: "Very short label: 1-3 words MAX" },
                minItems: 2,
                maxItems: 3,
              },
            },
            required: ["ideas"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_similar_ideas" },
      messages: [
        {
          role: "user",
          content: `You are a product strategist. The team is discussing this idea: "${ideaSummary}".
Context: ${context}

Generate 2 to 3 real-world, already-existing product or feature ideas that are highly similar.
CRITICAL: Each label must be 1-3 words MAX so it fits inside a small visual bubble.
Style examples: "Discover Weekly", "Standup bot", "Duolingo streaks", "Khan badges".
Never exceed 3 words.`,
        },
      ],
    });

    const { ideas } = getToolInput<{ ideas: string[] }>(response, "report_similar_ideas");
    return ideas.slice(0, 3);
  } catch (error: any) {
    if (isQuotaError(error)) {
      console.error("AI Quota Exceeded");
      throw new Error("QUOTA_EXCEEDED");
    }
    console.error("Error brainstorming similar ideas:", error);
    return [];
  }
}

export async function evaluateIdeasMatrix(messages: Message[], context: string): Promise<EvaluatedIdea[]> {
  const transcript = transcriptOf(messages);

  try {
    const response = await client.messages.create({
      model: SONNET,
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: `You are a strategic AI analyst listening to brainstorming meetings. For each core idea you extract, evaluate it on two dimensions (0-100):
- Ease of Implementation (100 = very easy/fast, 0 = very hard/long).
- Impact on Outcome (100 = massive impact, 0 = low impact).

For EVERY idea, also find a "similarIndustryIdea" — a real-world example of another company or project that tried something similar — and a "similarIdeaOutcome" describing whether it worked or failed for them. Provide robust, strategic analysis.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: "report_evaluated_ideas",
          description: "Report the extracted ideas with their ease/impact scores and similar industry examples.",
          input_schema: {
            type: "object",
            properties: {
              ideas: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    summary: { type: "string", description: "1-3 word title" },
                    description: { type: "string", description: "Short description of the idea" },
                    ease: { type: "integer", description: "0-100 score" },
                    impact: { type: "integer", description: "0-100 score" },
                    similarIndustryIdea: { type: "string", description: "A similar real-world idea done by others" },
                    similarIdeaOutcome: { type: "string", description: "How did it work out for them?" },
                  },
                  required: ["id", "summary", "description", "ease", "impact", "similarIndustryIdea", "similarIdeaOutcome"],
                },
              },
            },
            required: ["ideas"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_evaluated_ideas" },
      messages: [
        {
          role: "user",
          content: `Project context: ${context}

Meeting transcript:
${transcript}

Extract the core ideas, score each on ease and impact, and find a similar real-world example for each.`,
        },
      ],
    });

    const { ideas } = getToolInput<{ ideas: EvaluatedIdea[] }>(response, "report_evaluated_ideas");
    return ideas;
  } catch (error: any) {
    if (isQuotaError(error)) throw new Error("QUOTA_EXCEEDED");
    console.error("Error generating matrix:", error);
    throw error;
  }
}

export async function generateFeedbackReport(messages: Message[], context: string): Promise<MeetingReport> {
  const transcript = transcriptOf(messages);

  try {
    const response = await client.messages.create({
      model: SONNET,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: `You are an AI meeting facilitator and analyst. Based on a transcript, produce:
1. An "overview" of the meeting dynamics.
2. 3-4 factual "observations" (participation distribution, topic focus, idea generation patterns) — factual data only, no judging language.
3. 3 strictly actionable "keyTakeaways" on how the team can align or move forward.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: "report_meeting_analysis",
          description: "Report the post-meeting analysis.",
          input_schema: {
            type: "object",
            properties: {
              overview: { type: "string" },
              observations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    topic: { type: "string" },
                    factualData: { type: "string" },
                  },
                  required: ["topic", "factualData"],
                },
              },
              keyTakeaways: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["overview", "observations", "keyTakeaways"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_meeting_analysis" },
      messages: [
        {
          role: "user",
          content: `Context: ${context}

Transcript:
${transcript}`,
        },
      ],
    });

    return getToolInput<MeetingReport>(response, "report_meeting_analysis");
  } catch (error: any) {
    if (isQuotaError(error)) throw new Error("QUOTA_EXCEEDED");
    console.error("Error generating report:", error);
    throw error;
  }
}

export async function queryAI(messages: Message[], context: string, query: string): Promise<string> {
  const transcript = transcriptOf(messages);

  try {
    const response = await client.messages.create({
      model: SONNET,
      max_tokens: 512,
      system: "You are an AI assistant helping a team brainstorm. Answer concisely and insightfully based ONLY on the transcript and context provided. Keep your answer under 3 sentences.",
      messages: [
        {
          role: "user",
          content: `Context: ${context}

Transcript so far:
${transcript}

Question: ${query}`,
        },
      ],
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text",
    );
    return textBlock?.text || "No response generated.";
  } catch (error: any) {
    if (isQuotaError(error)) throw new Error("QUOTA_EXCEEDED");
    console.error("Error querying AI:", error);
    throw error;
  }
}

export async function generateSynthesis(messages: Message[], context: string): Promise<Synthesis> {
  const transcript = transcriptOf(messages);

  try {
    const response = await client.messages.create({
      model: SONNET,
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: `You are an AI synthesis agent for small-group learning.
Your purpose is to support collaborative structured thinking in real time.
You do not behave like a general chatbot or a note taker.

You listen to discussion and produce:
1. idea nodes,
2. theme clusters,
3. relations between contributions,
4. convergence prompts when appropriate.

Prioritize:
- preserving important ideas,
- making peer-to-peer connections visible,
- identifying unresolved tensions,
- helping the group move toward synthesis.

BE EXTRAORDINARILY CONCISE. Use short phrases (2-4 words). Reduce wordiness aggressively.
If there is insufficient evidence for a relation, mark it as "uncertain".
If the group is still diverging, do not produce a final decision. Instead, propose one reflective prompt.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: "report_synthesis",
          description: "Report the synthesis of the brainstorming discussion.",
          input_schema: {
            type: "object",
            properties: {
              themeClusters: {
                type: "array",
                description: "Themes emerging from the discussion.",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    description: { type: "string" },
                    ideaNodes: {
                      type: "array",
                      description: "Specific ideas contributing to this theme.",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          text: { type: "string" },
                          author: { type: "string", description: "The participant who introduced this idea, if known." },
                        },
                        required: ["id", "text"],
                      },
                    },
                  },
                  required: ["id", "name", "description", "ideaNodes"],
                },
              },
              relations: {
                type: "array",
                description: "Relationships or tensions between different ideas mentioned.",
                items: {
                  type: "object",
                  properties: {
                    sourceIdeaText: { type: "string", description: "Small summary of the source idea." },
                    targetIdeaText: { type: "string", description: "Small summary of the target idea." },
                    type: {
                      type: "string",
                      enum: ["supports", "tensions", "builds_on", "relates_to", "uncertain"],
                    },
                    description: { type: "string", description: "Explanation of the relationship." },
                  },
                  required: ["sourceIdeaText", "targetIdeaText", "type", "description"],
                },
              },
              unresolvedTensions: {
                type: "array",
                description: "Areas of friction or paradox that remain unresolved.",
                items: { type: "string" },
              },
              convergencePrompts: {
                type: "array",
                description: "Exactly one reflective prompt if the group is still diverging, otherwise questions to synthesize.",
                items: { type: "string" },
              },
            },
            required: ["themeClusters", "relations", "unresolvedTensions", "convergencePrompts"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_synthesis" },
      messages: [
        {
          role: "user",
          content: `Context:
${context}

Transcript chunk:
${transcript}`,
        },
      ],
    });

    return getToolInput<Synthesis>(response, "report_synthesis");
  } catch (error: any) {
    if (isQuotaError(error)) throw new Error("QUOTA_EXCEEDED");
    console.error("Error generating synthesis:", error);
    throw error;
  }
}

/**
 * Live brainstorm analyzer: runs on a recent slice of transcript and emits the
 * same shape of "visualization actions" the old Gemini Live tool calls produced.
 * Used by useLiveAgent to drive the bubble graph from text alone.
 */
export interface LiveAnalyzerAction {
  action: "new_idea" | "build_on_idea" | "rule_feedback";
  ideaSummary?: string;
  contributor: string;
  originalText?: string;
  feedbackType?: "judgmental" | "off_topic" | "interruption" | "repeating";
  feedbackMessage?: string;
}

export interface LiveAnalyzerResult {
  visualizationActions: LiveAnalyzerAction[];
  frameworkSuggestion?: { frameworkId: string; reason: string };
}

const LIVE_ANALYZER_SYSTEM = `You are an AI synthesis agent observing a live brainstorming meeting. Your job is to map ideas as they emerge and flag rule violations.

Map every NEW idea (action='new_idea') and every EXTENSION of an existing idea (action='build_on_idea') to the visualization. Use the speaker's name as 'contributor'. Keep 'ideaSummary' to 1-3 words.

Enforce the Rules of Brainstorming via action='rule_feedback':
1. No Judgment: flag "but", "no", or negative connotations as feedbackType='judgmental'.
2. Focus on Topic: flag wild topic divergence as feedbackType='off_topic'.
3. One conversation at a time: flag overlapping talk / interruption as feedbackType='interruption'.
4. Quality: flag repeated ideas without new value as feedbackType='repeating'.

Only report what the LATEST utterances added — do not re-emit ideas already covered earlier in the transcript. If nothing new happened, return an empty list.

You may also suggest a thinking framework (frameworkId one of: 'first-principles', 'connection-circles', 'conflict-resolution', 'ishikawa', 'iceberg', 'six-hats') when the group is clearly stuck or matches a framework's purpose. Skip this field if no suggestion applies.`;

/**
 * Distill the current bubble canvas down to 3-6 core ideas.
 * Replaces the visualization with a smaller, organized set of "main themes",
 * each linked to the source bubble IDs that contributed to it.
 */
export interface DistilledIdea {
  id: string;
  summary: string; // 1-3 word title
  description: string; // one-sentence explanation
  sourceBubbleIds: string[];
  rationale: string; // why this is a core idea
}

export async function distillCoreIdeas(
  bubbleSummaries: { id: string; summary: string; contributors: string[]; originalText?: string }[],
  context: string,
): Promise<DistilledIdea[]> {
  if (bubbleSummaries.length === 0) return [];

  const bubbleList = bubbleSummaries
    .map((b, i) => `[${b.id}] "${b.summary}" — by ${b.contributors.join(", ")}${b.originalText ? ` — quote: "${b.originalText.slice(0, 200)}"` : ""}`)
    .join("\n");

  try {
    const response = await client.messages.create({
      model: SONNET,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: `You are a synthesis facilitator. Given a list of brainstormed ideas, you DISTILL them down to 3-6 core themes that capture the essential thinking of the group.

Each distilled idea must:
- Have a 1-3 word title (will appear inside a small visual bubble — DO NOT exceed 3 words)
- Reference the SOURCE bubble IDs it came from (so users can trace back)
- Have a one-sentence description explaining what the theme is
- Have a brief rationale for why it's a core idea (what cluster of input it summarizes)

Aim for 3-6 distilled ideas — fewer is fine if the input is small. Do not invent themes the input doesn't support. Group similar ideas under one theme rather than splitting hairs.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: "report_distilled_ideas",
          description: "Report the distilled core themes that summarize the brainstormed ideas.",
          input_schema: {
            type: "object",
            properties: {
              ideas: {
                type: "array",
                minItems: 1,
                maxItems: 6,
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "New unique id for this distilled bubble" },
                    summary: { type: "string", description: "1-3 word title — will fit inside a small bubble" },
                    description: { type: "string", description: "One-sentence explanation" },
                    sourceBubbleIds: { type: "array", items: { type: "string" }, description: "Source bubble IDs that contributed" },
                    rationale: { type: "string", description: "Brief explanation of why this is a core theme" },
                  },
                  required: ["id", "summary", "description", "sourceBubbleIds", "rationale"],
                },
              },
            },
            required: ["ideas"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_distilled_ideas" },
      messages: [
        {
          role: "user",
          content: `Project context: ${context}

Current bubble canvas (each is one brainstormed idea):
${bubbleList}

Distill these into 3-6 core themes.`,
        },
      ],
    });

    const { ideas } = getToolInput<{ ideas: DistilledIdea[] }>(response, "report_distilled_ideas");
    return ideas;
  } catch (error: any) {
    if (isQuotaError(error)) throw new Error("QUOTA_EXCEEDED");
    console.error("Distillation error:", error);
    throw error;
  }
}

/**
 * Collaboration coach: a SEPARATE agent from the bubble visualizer.
 * Reads the conversation periodically and only nudges the team when one of a small
 * set of conditions is clearly met (stuck, branching without convergence, no next
 * steps after a long time, dominant speaker, unresolved disagreement).
 *
 * Powered by the Creative Whack Pack facilitation template stored in
 * src/data/whack_pack_template.txt — the agent picks ONE move from that library.
 *
 * Returns null if no nudge is warranted (the common case — false positives are
 * worse than missed nudges).
 */
export interface CollaborationNudge {
  diagnosis: string; // 1-sentence read of what is happening
  category: "explorer" | "artist" | "judge" | "warrior";
  moveName: string; // e.g. "Choose using three criteria"
  movePrompt: string; // the prompt the agent suggests the team try
  trigger: "stuck" | "too_many_branches" | "no_next_steps" | "dominant_speaker" | "unresolved_disagreement";
}

const COLLAB_COACH_SYSTEM = `${whackPackTemplate}

---

ROLE FOR THIS CALL

You evaluate the LATEST state of a small-group brainstorming or makerspace project meeting and decide whether to surface ONE concise nudge from the Creative Whack Pack moves above.

NUDGE ONLY IF AT LEAST ONE OF THESE IS CLEARLY TRUE FROM THE TRANSCRIPT:
1. The group has explored 5+ different ideas/threads without any sign of shortlisting or convergence.
2. The discussion has been stuck on the same topic for a long stretch with no new evidence or progress.
3. After 20+ minutes of session time, no concrete next step, owner, or deadline has appeared.
4. One participant is contributing significantly more than all others combined.
5. The group is in disagreement that is not being resolved (no one is naming the underlying assumption).

FALSE POSITIVES ARE WORSE THAN MISSED NUDGES. If none of the above is clearly true, set shouldNudge=false and explain briefly why in the diagnosis field (this won't be shown to the user).

WHEN YOU DO NUDGE:
- Diagnose in ONE short sentence (max 14 words) — concrete, specific to what they actually said.
- Pick ONE move from the Card Library whose prompt fits the diagnosis.
- Use the move's exact prompt verbatim, OR adapt it slightly to reference what they discussed.
- Keep the suggestion non-prescriptive — you are a coach, not a director.`;

export async function evaluateCollaborationHealth(
  messages: Message[],
  context: string,
  elapsedSeconds: number,
  bypassGuards = false,
): Promise<CollaborationNudge | null> {
  // Skip if too few messages or session too short
  if (!bypassGuards && (messages.length < 8 || elapsedSeconds < 60 * 10)) return null;
  if (messages.length === 0) return null;

  const transcript = transcriptOf(messages);
  const elapsedMin = Math.round(elapsedSeconds / 60);

  try {
    const response = await client.messages.create({
      model: SONNET,
      max_tokens: 600,
      system: [
        {
          type: "text",
          text: COLLAB_COACH_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: "report_collaboration_evaluation",
          description: "Report whether to nudge the team and, if so, the suggested move.",
          input_schema: {
            type: "object",
            properties: {
              shouldNudge: { type: "boolean" },
              diagnosis: { type: "string", description: "ONE short sentence describing the current group state." },
              category: { type: "string", enum: ["explorer", "artist", "judge", "warrior"] },
              moveName: { type: "string", description: "Exact name of the chosen Whack Pack move (e.g. 'Choose using three criteria')." },
              movePrompt: { type: "string", description: "The prompt to surface to the team, verbatim or lightly adapted." },
              trigger: {
                type: "string",
                enum: ["stuck", "too_many_branches", "no_next_steps", "dominant_speaker", "unresolved_disagreement"],
              },
            },
            required: ["shouldNudge"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_collaboration_evaluation" },
      messages: [
        {
          role: "user",
          content: `Project context: ${context}

Session elapsed: ${elapsedMin} minutes
Total messages: ${messages.length}

Transcript:
${transcript}`,
        },
      ],
    });

    const result = getToolInput<{
      shouldNudge: boolean;
      diagnosis?: string;
      category?: CollaborationNudge["category"];
      moveName?: string;
      movePrompt?: string;
      trigger?: CollaborationNudge["trigger"];
    }>(response, "report_collaboration_evaluation");

    if (!result.shouldNudge || !result.diagnosis || !result.moveName || !result.movePrompt || !result.category || !result.trigger) {
      return null;
    }

    return {
      diagnosis: result.diagnosis,
      category: result.category,
      moveName: result.moveName,
      movePrompt: result.movePrompt,
      trigger: result.trigger,
    };
  } catch (error: any) {
    if (isQuotaError(error)) throw new Error("QUOTA_EXCEEDED");
    console.error("Collaboration coach error:", error);
    return null;
  }
}

export async function analyzeLiveTranscript(
  fullTranscript: string,
  recentChunk: string,
): Promise<LiveAnalyzerResult> {
  try {
    const response = await client.messages.create({
      model: HAIKU,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: LIVE_ANALYZER_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: "report_live_analysis",
          description: "Report visualization actions and an optional framework suggestion based on the latest brainstorm activity.",
          input_schema: {
            type: "object",
            properties: {
              visualizationActions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    action: { type: "string", enum: ["new_idea", "build_on_idea", "rule_feedback"] },
                    ideaSummary: { type: "string", description: "1-3 word summary; required for new_idea/build_on_idea" },
                    contributor: { type: "string", description: "Speaker name" },
                    originalText: { type: "string", description: "Quoted utterance" },
                    feedbackType: { type: "string", enum: ["judgmental", "off_topic", "interruption", "repeating"] },
                    feedbackMessage: { type: "string" },
                  },
                  required: ["action", "contributor"],
                },
              },
              frameworkSuggestion: {
                type: "object",
                properties: {
                  frameworkId: {
                    type: "string",
                    enum: ["first-principles", "connection-circles", "conflict-resolution", "ishikawa", "iceberg", "six-hats"],
                  },
                  reason: { type: "string" },
                },
                required: ["frameworkId", "reason"],
              },
            },
            required: ["visualizationActions"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_live_analysis" },
      messages: [
        {
          role: "user",
          content: `Full transcript so far (for context, do not re-analyze):
${fullTranscript || "(empty)"}

NEW utterances since last analysis (focus on these):
${recentChunk}`,
        },
      ],
    });

    return getToolInput<LiveAnalyzerResult>(response, "report_live_analysis");
  } catch (error: any) {
    if (isQuotaError(error)) throw new Error("QUOTA_EXCEEDED");
    console.error("Error in live analyzer:", error);
    throw error;
  }
}
