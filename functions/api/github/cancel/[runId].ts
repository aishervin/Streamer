const GITHUB_REPO = 'aishervin/Streamer';

export async function onRequestPost(context: any) {
  const token = context.env?.GITHUB_PAT || '';
  if (!token) {
    return new Response(JSON.stringify({ error: 'GITHUB_PAT environment variable is not configured' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
  const runId = context.params.runId;
  try {
    const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${runId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'DevStudio-Streamer',
      },
    });

    if (ghRes.status === 202) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } else {
      const err = await ghRes.text();
      return new Response(JSON.stringify({ error: err }), {
        status: ghRes.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
