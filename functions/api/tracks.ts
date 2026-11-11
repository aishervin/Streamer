const REPOSITORY = 'aishervin/Streamer';
const BRANCH = 'main';
const AUDIO_FILE = /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i;

interface GitHubFile {
  name: string;
  size: number;
  type: string;
}

async function listTracks(folder: string) {
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/contents/${folder}?ref=${BRANCH}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Streamer-Pages',
      },
    },
  );

  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

  const files = await response.json() as GitHubFile[];
  return files
    .filter(file => file.type === 'file' && AUDIO_FILE.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(file => ({
      filename: file.name,
      size: file.size,
      modifiedAt: '',
    }));
}

function trackKey(filename: string) {
  return filename.replace(/\.[^.]+$/, '').toLowerCase();
}

export async function onRequestGet() {
  try {
    const [rawFiles, optimizedTracks] = await Promise.all([
      listTracks('music'),
      listTracks('music-optimized'),
    ]);
    const optimizedNames = new Set(optimizedTracks.map(track => trackKey(track.filename)));
    const rawTracks = rawFiles.map(track => ({
      ...track,
      isOptimized: optimizedNames.has(trackKey(track.filename)),
    }));

    return new Response(
      JSON.stringify({
        rawTracks,
        optimizedTracks,
        playlistCount: optimizedTracks.length,
        hasBackground: true,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
        },
      },
    );
  } catch {
    return new Response(JSON.stringify({ error: 'Unable to load the music library from GitHub.' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }
}
