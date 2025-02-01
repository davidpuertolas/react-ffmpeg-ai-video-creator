import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Obtener el query parameter
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    if (!query) {
      return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
    }

    console.log('🔍 Searching Pexels for:', query);

    // Hacer la petición a Pexels
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`,
      {
        headers: {
          Authorization: process.env.PEXELS_API_KEY || '',
        },
      }
    );

    if (!response.ok) {
      console.error('❌ Pexels API error:', response.status, response.statusText);
      throw new Error('Failed to fetch from Pexels API');
    }

    const data = await response.json();
    console.log('✅ Pexels response received:', {
      totalResults: data.total_results,
      photosFound: data.photos.length,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Error in Pexels API route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch images' },
      { status: 500 }
    );
  }
}
