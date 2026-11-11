const GITHUB_REPO = 'aishervin/Streamer';

export async function onRequestGet(context: any) {
  const token = context.env?.GITHUB_PAT || '';
  if (!token) {
    return new Response(JSON.stringify({ error: 'GITHUB_PAT environment variable is not configured', runs: [] }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
  try {
    const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/runs?per_page=8`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'DevStudio-Streamer',
      },
    });

    if (!ghRes.ok) {
      const err = await ghRes.text();
      return new Response(JSON.stringify({ error: err }), {
        status: ghRes.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const data: any = await ghRes.json();
    const runs = (data.workflow_runs || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
      html_url: r.html_url,
      created_at: r.created_at,
      updated_at: r.updated_at,
      event: r.event,
    }));

    return new Response(JSON.stringify({ runs }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
