const REPO = "tw93/mole";
const API_BASE = `https://api.github.com/repos/${REPO}`;

export interface MoleRelease {
  tag: string;
  body: string;
  publishedAt: string;
  assets: { name: string; browser_download_url: string }[];
}

export async function fetchLatestRelease(): Promise<MoleRelease> {
  const res = await fetch(`${API_BASE}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = await res.json();
  return {
    tag: data.tag_name as string,
    body: (data.body as string) ?? "",
    publishedAt: data.published_at as string,
    assets: (data.assets as any[]).map((a) => ({
      name: a.name as string,
      browser_download_url: a.browser_download_url as string,
    })),
  };
}

export function getAssetUrlForArch(
  assets: MoleRelease["assets"],
  arch: string
): string | null {
  const archKey = arch === "arm64" ? "arm64" : "amd64";
  const asset = assets.find((a) => a.name === `binaries-darwin-${archKey}.tar.gz`);
  return asset?.browser_download_url ?? null;
}

export function isNewerVersion(latest: string, installed: string): boolean {
  // Normalize tags like "V1.30.0" → "1.30.0"
  const normalize = (v: string) => v.replace(/^[Vv]/, "");
  const [lMajor, lMinor, lPatch] = normalize(latest).split(".").map(Number);
  const [iMajor, iMinor, iPatch] = normalize(installed).split(".").map(Number);
  if (lMajor !== iMajor) return lMajor > iMajor;
  if (lMinor !== iMinor) return lMinor > iMinor;
  return lPatch > iPatch;
}
