export type PodcastStyle = 'technical' | 'overview';

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

const SYSTEM_PROMPTS: Record<PodcastStyle, string> = {
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
  style: PodcastStyle,
  repoName: string
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('[Script] OPENROUTER_API_KEY not set, skipping script generation');
    return '';
  }

  console.log(`[Script] Generating ${style} podcast script for ${repoName}`);

  // Clean up markdown to remove mermaid diagrams and excessive formatting
  const cleanedMarkdown = markdown
    .replace(/```mermaid[\s\S]*?```/g, '[Architecture diagram]')
    .replace(/```[\s\S]*?```/g, '[Code block]')
    .replace(/`([^`]+)`/g, '$1')
    .slice(0, 8000); // Limit input size

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: SYSTEM_PROMPTS[style],
    },
    {
      role: 'user',
      content: `Create a podcast script for the repository "${repoName}" based on this system design document:\n\n${cleanedMarkdown}`,
    },
  ];

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Repo to Podcast',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b:free',
        messages,
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
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

    console.log(`[Script] Generated script: ${script.length} chars, ~${Math.round(script.split(' ').length / 160)} min`);
    return script;
  } catch (error) {
    console.error('[Script] Error generating script:', error);
    return '';
  }
}
