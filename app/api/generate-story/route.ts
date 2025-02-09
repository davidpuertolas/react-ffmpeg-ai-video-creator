import OpenAI from 'openai';
import { NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a creative storyteller. Generate engaging stories in JSON format.
          Each story should have segments (we are in demo only 2 short segments), where each segment contains the narration text and a description
          of what the background image should depict. The story should be engaging and visual.`
        },
        {
          role: "user",
          content: `Create a story based on this prompt: "${prompt}".
          Return it in this JSON format:
          {
            "title": "Story title",
            "narrator": "Suggested narrator name/type",
            "segments": [
              {
                "content": "Narration text",
                "imageDescription": "Description of what should be shown in the background"
              }
            ]
          }`
        }
      ],
      temperature: 1,
      max_tokens: 1000,
    });

    const storyJson = completion.choices[0].message.content;
    if (!storyJson) {
      throw new Error('No content received from OpenAI');
    }

    try {
      const parsedJson = JSON.parse(storyJson);
      return NextResponse.json(parsedJson);
    } catch (parseError) {
      console.error('Error parsing JSON:', storyJson);
      throw new Error('Invalid JSON received from OpenAI');
    }

  } catch (error) {
    console.error('Error generating story:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate story' },
      { status: 500 }
    );
  }
}
