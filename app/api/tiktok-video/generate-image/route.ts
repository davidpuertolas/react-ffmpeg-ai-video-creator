import { TextToImage } from "deepinfra";
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'No prompt provided' },
        { status: 400 }
      );
    }

    const model = new TextToImage(
      "stabilityai/sdxl-turbo",
      process.env.DEEPINFRA_API_KEY
    );

    const response = await model.generate({ prompt });

    return NextResponse.json({ imageUrl: response.images[0] });
  } catch (error) {
    console.error('Error generating image:', error);
    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    );
  }
}
