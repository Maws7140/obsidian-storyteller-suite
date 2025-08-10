type Lang = 'en';

const en = {
  dashboardTitle: 'Storyteller suite',
  openDashboard: 'Open dashboard',
  createNew: 'Create new',
  uploadImage: 'Upload Image',
  // Notices
  storyCreated: (name: string) => `Story "${name}" created and activated.`,
  created: (what: string, name: string) => `${what} "${name}" created.`,
  updated: (what: string, name: string) => `${what} "${name}" updated.`,
  movedToTrash: (what: string, name: string) => `${what} "${name}" moved to trash.`,
  // Errors
  workspaceLeafCreateError: 'Error opening dashboard: Could not create workspace leaf.',
  workspaceLeafRevealError: 'Error revealing dashboard: Workspace leaf not found.',
  // Remote images
  remoteImagesBlocked: 'Remote images are blocked by settings. Import the image to your gallery to use it safely.',
  importImage: 'Import image',
};

const locales: Record<Lang, typeof en> = { en };
let current: Lang = 'en';

export function setLocale(lang: Lang) { current = lang; }
export function t<K extends keyof typeof en>(key: K, ...args: Parameters<Extract<typeof en[K], Function>>): string {
  const value = locales[current][key];
  if (typeof value === 'function') return (value as any)(...args);
  return value as string;
}
