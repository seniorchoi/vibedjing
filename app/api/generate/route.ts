import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getYoutubeVideos(query: string): Promise<any[]> {
    console.log('YouTube search query:', query); // Log the query being sent
    const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=16&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&videoDuration=medium&key=${process.env.YOUTUBE_API_KEY}`;
  
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) {
        throw new Error(`YouTube API error: ${res.statusText}`);
      }
      const data = await res.json();
      console.log('YouTube API response items count:', data.items?.length || 0); // Log result count
      // console.log('Full YouTube API response:', data); // Uncomment for verbose response
      return data.items || [];
    } catch (error) {
      console.error('YouTube search error:', error);
      return [];
    }
  }

export async function POST(req: Request) {
  const { theme } = await req.json();

  if (!theme) {
    return new Response(JSON.stringify({ error: 'Theme is required' }), { status: 400 });
  }

  if (!process.env.YOUTUBE_API_KEY) {
    return new Response(JSON.stringify({ error: 'YouTube API key is missing' }), { status: 500 });
  }

  try {
    // Step 1: Generate YouTube search query using GPT
    const queryResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that generates a single optimized YouTube search query for music videos based on a theme. Output only the query string, nothing else.' },
        { role: 'user', content: `Generate a YouTube search query to find 16 relevant music videos for the theme: "${theme}". Make it specific.` },
      ],
    });

    const searchQuery = queryResponse.choices[0].message.content?.trim() || '';

    if (!searchQuery) {
      throw new Error('Failed to generate search query');
    }

    // Step 2: Search YouTube for videos
    const videos = await getYoutubeVideos(searchQuery);

    if (videos.length === 0) {
      throw new Error('No videos found');
    }

    // Prepare metadata list
    const metadata = videos.map((video: any) => ({
      rawTitle: video.snippet.title,
      channel: video.snippet.channelTitle,
      url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
    }));

    // Step 3: Use GPT to parse titles into clean title and artist
    const parseResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that extracts clean song title and artist from YouTube video metadata. Output ONLY valid JSON: { "songs": [{ "title": "Song Title", "artist": "Artist Name", "url": "https://..." }] }' },
        { role: 'user', content: `Extract title and artist for each of these music videos: ${JSON.stringify(metadata)}` },
      ],
    });

    const parsedContent = parseResponse.choices[0].message.content?.trim() || '';
    console.log('Raw parsed content:', parsedContent); // Log for debugging
    let cleanedContent = parsedContent.replace(/```json|```/g, '').trim();
    const data = JSON.parse(cleanedContent);
    const songs = data.songs || [];

    // Generate playlistUrl if needed (optional)
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