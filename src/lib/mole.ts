import { mkdir, readTextFile, writeTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";

export const MOLE_SUBDIR = ".molesurface";
export const MOLE_BIN_SUBDIR = ".molesurface/bin";
export const MOLE_VERSION_FILE = ".molesurface/version";

export type MoSource = "managed" | "homebrew";

export interface MoLocation {
  path: string;
  binDir: string;
  source: MoSource;
}

// Module-level cache — detection runs once per session
let _cache: MoLocation | null | undefined = undefined;

export async function getHomeDir(): Promise<string> {
  return invoke<string>("get_home_dir");
}

/**
 * Finds the mo executable via the Rust backend (no shell scope restrictions).
 * 1. Checks ~/.molesurface/bin/mo  (managed copy)
 * 2. Falls back to `command -v mo` via /bin/sh  (Homebrew / PATH)
 */
export async function findMoLocation(homeDir: string): Promise<MoLocation | null> {
  if (_cache !== undefined) return _cache;

  const result = await invoke<{ path: string; bin_dir: string; source: string } | null>(
    "find_mo_path",
    { homeDir }
  );

  if (result) {
    _cache = { path: result.path, binDir: result.bin_dir, source: result.source as MoSource };
  } else {
    _cache = null;
  }
  return _cache;
}

/** Call after installing/removing the managed copy to force re-detection */
export function invalidateMoCache(): void {
  _cache = undefined;
}

export async function isMoleInstalled(): Promise<boolean> {
  const homeDir = await getHomeDir();
  return (await findMoLocation(homeDir)) !== null;
}

export async function getInstalledVersion(): Promise<string | null> {
  try {
    const v = await readTextFile(MOLE_VERSION_FILE, { baseDir: BaseDirectory.Home });
    return v.trim();
  } catch {
    return null;
  }
}

export async function ensureMoleDir(): Promise<void> {
  await mkdir(MOLE_SUBDIR, { baseDir: BaseDirectory.Home, recursive: true });
  await mkdir(MOLE_BIN_SUBDIR, { baseDir: BaseDirectory.Home, recursive: true });
}

export async function saveInstalledVersion(tag: string): Promise<void> {
  await writeTextFile(MOLE_VERSION_FILE, tag, { baseDir: BaseDirectory.Home });
}
