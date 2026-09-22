export async function onRequestGet() {
  return new Response(
    JSON.stringify({
      logs: [
        {
          id: 'cf-edge-init',
          timestamp: new Date().toISOString(),
          text: 'Streami Edge Controller online on Cloudflare Pages (streami.pages.dev)',
          type: 'info',
        },
        {
          id: 'gh-conn',
          timestamp: new Date().toISOString(),
          text: 'Connected to GitHub Actions workflow dispatcher (aishervin/Streamer)',
          type: 'stream',
        },
      ],
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
