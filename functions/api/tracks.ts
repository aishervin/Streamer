export async function onRequestGet() {
  return new Response(
    JSON.stringify({
      rawTracks: [
        { filename: 'test_tone_440hz.m4a', size: 122880, modifiedAt: new Date().toISOString() },
        { filename: 'sample_melody.m4a', size: 184320, modifiedAt: new Date().toISOString() }
      ],
      optimizedTracks: [
        { filename: 'test_tone_440hz.m4a', size: 122880, modifiedAt: new Date().toISOString(), isOptimized: true },
        { filename: 'sample_melody.m4a', size: 184320, modifiedAt: new Date().toISOString(), isOptimized: true }
      ],
      playlistCount: 2,
      hasBackground: true,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
