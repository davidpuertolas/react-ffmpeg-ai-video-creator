import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    console.log('🔍 Pexels API Request for query:', query);

    const apiKey = process.env.PEXELS_API_KEY;
    console.log('🔑 API Key present:', !!apiKey);

    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`;
    console.log('🌐 Pexels API URL:', url);

    const response = await fetch(url, {
      headers: {
        Authorization: apiKey || '',
      },
    });

    console.log('📡 Pexels API Response Status:', response.status);
    console.log('📡 Pexels API Response Headers:', Object.fromEntries(response.headers));

    if (!response.ok) {
      console.error('❌ Pexels API Error. Status:', response.status);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error(`Failed to fetch from Pexels: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('📦 Pexels API Response Data:', {
      totalResults: data.total_results,
      page: data.page,
      photosCount: data.photos?.length,
      firstPhotoId: data.photos?.[0]?.id
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Error in Pexels API route:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return NextResponse.json(
      { error: 'Failed to fetch images', details: error.message },
      { status: 500 }
    );
  }
}
