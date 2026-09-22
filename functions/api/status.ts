export async function onRequestGet() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      stream: {
        isStreaming: false,
        destination: null,
        targetUrlMasked: '',
        startedAt: null,
        uptimeSeconds: 0,
        reconnectCount: 0,
        pid: null,
        hasChannelSecret: true,
        hasGroupSecret: true,
      },
      system: {
        hasBackground: true,
        playlistFileExists: true,
      },
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
