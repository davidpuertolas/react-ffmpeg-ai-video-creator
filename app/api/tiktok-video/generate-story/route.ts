import OpenAI from 'openai';
import { NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an expert storyteller and TIKTOK video script writer. Create a captivating 40/60-second story divided into segments (can do lots of segments (from 4 to 10), that would dinamimize the story a lots, lots of bg images etc)(This is a demo, just create 1 segment).
    The story/video should be based on the following user prompt: "${prompt}".

    Key requirements:
    1. Story Structure:
    - Start with a powerful hook in the first seconds to grab attention
    - Build tension and intrigue throughout if needed, if the type of video is not a story, just create the best for it.
    - End with a satisfying or surprising conclusion

    2. Narration Guidelines:
    - Keep narration concise and natural to fit 10 seconds
    - Use engaging, conversational language
    - Create emotional connection through vivid descriptions
    - Maintain clear pacing and rhythm

    3. Visual Descriptions:
    - Format as SDXL prompts
    - Include key style elements: (cinematic, dramatic lighting, high detail, 8k uhd)
    - Specify camera angles and shot types
    - Add artistic direction (color palette, mood, atmosphere)
    - Focus on the main subject and important details
    - Make them so clickbaity, engaging and exagerated as possible.

    Return ONLY a JSON with this exact format:
    {
      "segments": [
        {
          "timeStart": 0,
          "timeEnd": X,
          "narration": "engaging narration text",
          "visualDescription": "SDXL-optimized visual description"
        }
      ]
    }`;

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 1,
    });

    const response = JSON.parse(completion.choices[0].message.content);
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error generating story:', error);
    return NextResponse.json(
      { error: 'Failed to generate story' },
      { status: 500 }
    );
  }
}
