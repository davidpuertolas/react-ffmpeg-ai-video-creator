import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { topic } = await req.json();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Genera un guión viral para TikTok. Devuelve un JSON con un array de segmentos (2 segmentos maximo). Cada segmento debe tener 'text' (el texto a narrar) y 'imagePrompt' (descripción para buscar una imagen de fondo). Máximo 3-4 segmentos, cada uno con texto corto y engaging."
        },
        {
          role: "user",
          content: `Genera un guión viral de TikTok sobre: ${topic}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const script = JSON.parse(completion.choices[0].message.content!);
    return NextResponse.json(script.segments);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Error generating script' }, { status: 500 });
  }
}
