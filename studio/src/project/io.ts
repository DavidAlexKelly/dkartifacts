/**
 * Projects on disk and in the browser.
 *
 * A project file is the Project object as JSON. Vector layers carry their
 * features inline; catalog layers carry only a reference, because their data
 * lives in Foundry and is read through the catalog when the project opens.
 */
import { newProject, type Project } from "./types";

const AUTOSAVE_KEY = "decho-studio:autosave/v1";

export function parseProject(text: string): Project {
  const raw = JSON.parse(text) as Partial<Project>;
  if (raw.format !== "decho-studio-project/1") {
    throw new Error("Not a Decho Studio project (expected format decho-studio-project/1)");
  }
  const base = newProject();
  return {
    ...base,
    ...raw,
    view: { ...base.view, ...(raw.view ?? {}) },
    layers: Array.isArray(raw.layers) ? raw.layers : [],
  } as Project;
}

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 1);
}

export function loadAutosave(): Project | null {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    return text ? parseProject(text) : null;
  } catch {
    return null;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Debounced; failures (quota, private mode) are ignored — it is a convenience. */
export function autosave(p: Project): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, serializeProject(p));
    } catch {
      /* ignore */
    }
  }, 800);
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}
