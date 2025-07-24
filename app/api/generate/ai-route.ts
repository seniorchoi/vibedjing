import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  const { theme } = await req.json();

  if (!theme) {
    return new Response(JSON.stringify({ error: 'Theme is required' }), { status: 400 });
  }

  try {
    const response = await openai.responses.create({
      model: 'gpt-4o',
      input: `Output ONLY valid JSON, no other text or explanations. Suggest EXACTLY 12 songs (title and artist) that match the theme perfectly (e.g., for high vibrations 80s music similar to Guardians of the Galaxy, use upbeat 80s tracks). For each song, use the web_search tool to find the official YouTube music video URL (search query: "official music video [title] by [artist] site:youtube.com"). Use REAL URLs from results—no placeholders. JSON format: { "songs": [{ "title": "Song Title", "artist": "Artist Name", "url": "https://www.youtube.com/watch?v=VIDEO_ID" }] }\n\nTheme: ${theme}`,
      tools: [{ type: 'web_search_preview' }],
    });

    const finalContent = response.output_text;
    let trimmedContent = finalContent.trim().replace(/```json|```/g, '').trim();

    const startIndex = trimmedContent.indexOf('{');
    const endIndex = trimmedContent.lastIndexOf('}') + 1;
    if (startIndex !== -1 && endIndex !== -1) {
      trimmedContent = trimmedContent.substring(startIndex, endIndex);
    }

    const data = JSON.parse(trimmedContent);
    const songs = data.songs || [];

    const videoIds = songs
      .map((song: { url: string }) => {
        const match = song.url?.match(/v=([^&]+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    const playlistUrl = videoIds.length > 0
      ? `https://www.youtube.com/embed/${videoIds[0]}?playlist=${videoIds.slice(1).join(',')}&autoplay=1&loop=1`
      : '';

    return new Response(JSON.stringify({ songs, playlistUrl }), { status: 200 });
  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error. Check terminal for details.' }), { status: 500 });
  }
}