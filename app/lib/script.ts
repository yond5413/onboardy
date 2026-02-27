export type PodcastStyle = 'technical' | 'overview' | 'quick' | 'standard' | 'detailed';

export type PodcastDuration = 'quick' | 'standard' | 'detailed';
export type PodcastTone = 'professional' | 'casual' | 'technical';
export type PodcastAudience = 'executive' | 'developer' | 'beginner';
export type PodcastContentStyle = 'overview' | 'technical';

export interface PodcastSettings {
  style: PodcastContentStyle;
  duration: PodcastDuration;
  tone: PodcastTone;
  audience: PodcastAudience;
}

export const DURATION_WORDS: Record<PodcastDuration, { min: number; max: number; minutes: number }> = {
  quick: { min: 200, max: 300, minutes: 2 },
  standard: { min: 600, max: 900, minutes: 5 },
  detailed: { min: 1200, max: 1800, minutes: 10 },
};

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

const FALLBACK_MODELS = [
  'z-ai/glm-4.5-air:free',
  'arcee-ai/trinity-large-preview:free',
  'stepfun/step-3.5-flash:free',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  'openai/gpt-oss-20b:free',
];

const FINAL_FALLBACK = 'openrouter/free';

const SYSTEM_PROMPTS: Record<PodcastContentStyle, string> = {
  technical: `You are a technical architect creating a podcast script about a software system.

Create a single-narrator podcast script that is technical but accessible. Focus on:
- System architecture and design patterns
- Key components and their responsibilities
- Data flow and interactions
- Tech stack choices and rationale
- Technical trade-offs and decisions

Guidelines:
- Use a conversational, professional tone
- Target 750-850 words (5 minutes at 150-160 WPM)
- Include a brief intro hook and conclusion
- Explain technical concepts clearly without being patronizing
- Use transitions between sections
- Format as clean paragraphs, no stage directions or sound effects`,

  overview: `You are a technical architect creating a podcast script about a software system.

Create a single-narrator podcast script that provides a high-level overview. Focus on:
- What the system does and why it exists
- High-level architecture (avoid deep technical details)
- Key technologies used
- Main components at a glance
- Design philosophy and approach

Guidelines:
- Use a conversational, engaging tone
- Target 750-850 words (5 minutes at 150-160 WPM)
- Include a brief intro hook and conclusion
- Keep technical jargon minimal and explain when used
- Use transitions between sections
- Format as clean paragraphs, no stage directions or sound effects`,
};

/**
 * Generate a podcast script from markdown system design document
 */
export async function generatePodcastScript(
  markdown: string,
  contentStyle: PodcastContentStyle,
  repoName: string,
  settings?: PodcastSettings
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('[Script] OPENROUTER_API_KEY not set, skipping script generation');
    return '';
  }

  console.log(`[Script] Generating ${contentStyle} podcast script for ${repoName}`, settings);

  const duration = settings?.duration || 'standard';
  const tone = settings?.tone || 'professional';
  const audience = settings?.audience || 'developer';
  const wordTarget = DURATION_WORDS[duration];

  const toneGuidance: Record<PodcastTone, string> = {
    professional: 'Use a polished, business-appropriate tone with clear articulation.',
    casual: 'Use a friendly, conversational tone as if chatting with a colleague.',
    technical: 'Use precise technical terminology with authoritative explanations.',
  };

  const audienceGuidance: Record<PodcastAudience, string> = {
    executive: 'Focus on business value, ROI, and high-level strategic implications.',
    developer: 'Include technical details, code patterns, and implementation specifics.',
    beginner: 'Explain concepts simply, avoid jargon, and provide context for each component.',
  };

  const styleGuidance = contentStyle === 'technical' 
    ? 'Dive deep into technical architecture, design patterns, and implementation details.'
    : 'Provide a high-level overview focusing on what the system does and how it solves problems.';

  const systemPrompt = `You are a technical architect creating a podcast script about a software system.

Create a single-narrator podcast script. ${styleGuidance}

${toneGuidance[tone]}
${audienceGuidance[audience]}

Guidelines:
- Target ${wordTarget.min}-${wordTarget.max} words (${wordTarget.minutes} minutes at 150-160 WPM)
- Include a brief intro hook and conclusion
- Use smooth transitions between sections
- Format as clean paragraphs, no stage directions or sound effects`;

  // Clean up markdown to remove mermaid diagrams and excessive formatting
  const cleanedMarkdown = markdown
    .replace(/```mermaid[\s\S]*?```/g, '[Architecture diagram]')
    .replace(/```[\s\S]*?```/g, '[Code block]')
    .replace(/`([^`]+)`/g, '$1')
    .slice(0, 8000); // Limit input size

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: `Create a podcast script for the repository "${repoName}" based on this system design document:\n\n${cleanedMarkdown}`,
    },
  ];

  const models = [...FALLBACK_MODELS, FINAL_FALLBACK];
  let lastError = '';

  for (const model of models) {
    try {
      console.log(`[Script] Trying model: ${model}`);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Repo to Podcast',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 2000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429 || status >= 500) {
          console.warn(`[Script] Rate limit/server error (${status}) with model ${model}, trying next...`);
          lastError = `Status ${status}`;
          continue;
        }
        const errorText = await response.text();
        console.error('[Script] OpenRouter error:', errorText);
        return '';
      }

      const data: OpenRouterResponse = await response.json();
      const script = data.choices[0]?.message?.content?.trim();

      if (!script) {
        console.warn('[Script] Empty response from OpenRouter');
        return '';
      }

      console.log(`[Script] Generated script with ${model}: ${script.length} chars, ~${Math.round(script.split(' ').length / 160)} min`);
      return script;
    } catch (error) {
      console.warn(`[Script] Error with model ${model}:`, error instanceof Error ? error.message : error);
      lastError = error instanceof Error ? error.message : 'Unknown error';
      continue;
    }
  }

  console.error('[Script] All models failed, last error:', lastError);
  return '';
}
