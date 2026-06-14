import { beforeEach, describe, expect, it, vi } from 'vitest';
import { noticeMessages, TFile } from 'obsidian';
import { WordCountTracker } from '../../src/compile/WordCountTracker';

describe('WordCountTracker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    noticeMessages.length = 0;
  });

  it('includes live session progress in today stats before a session is persisted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 31, 12, 0, 0));

    const tracker = new WordCountTracker(createPluginStub()) as any;

    tracker.isTracking = true;
    tracker.sessionStartTime = new Date(2026, 2, 31, 10, 0, 0).getTime();
    tracker.sessionStartWordCount = 100;
    tracker.lastKnownWordCount = 150;
    tracker.wordsDeleted = 10;

    const todayStats = tracker.getTodayStats();

    expect(todayStats).toMatchObject({
      wordsWritten: 60,
      wordsDeleted: 10,
      netWords: 50,
      goalMet: true,
    });
    expect(todayStats?.date).toBe('2026-03-31');
  });

  it('uses an explicit file when ending a session instead of the active workspace file', async () => {
    const sessionFile = new TFile('Story/session.md');
    const plugin = createPluginStub({
      activeFile: null,
      fileContents: new Map([[sessionFile.path, 'one two three four']]),
    });
    const tracker = new WordCountTracker(plugin as any) as any;

    tracker.sessionStartTime = Date.now() - 5_000;
    tracker.sessionStartWordCount = 1;
    tracker.lastKnownWordCount = 1;
    tracker.wordsDeleted = 0;
    tracker.isTracking = true;

    const stats = await tracker.endSession(sessionFile);

    expect(stats.wordsWritten).toBe(3);
    expect(stats.netWords).toBe(3);
    expect(plugin.settings.dailyWritingStats[0]).toMatchObject({
      date: getLocalDateKey(new Date()),
      wordsWritten: 3,
      netWords: 3,
    });
  });

  it('notifies only once when the daily writing goal has already been reached', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 31, 12, 0, 0));

    const plugin = createPluginStub();
    plugin.settings.notifyOnGoalReached = true;
    const tracker = new WordCountTracker(plugin as any);

    await tracker.recordDailyStats(60);
    await tracker.recordDailyStats(10);

    expect(noticeMessages).toEqual([
      'Daily writing goal reached! 60 words written today.',
    ]);
    expect(plugin.settings.dailyWritingStats[0]).toMatchObject({
      date: '2026-03-31',
      wordsWritten: 70,
      goalMet: true,
    });
  });

  it('only counts files under configured daily goal folders', async () => {
    const includedFile = new TFile('Drafts/Scene One.md');
    const excludedFile = new TFile('Notes/Research.md');
    const plugin = createPluginStub({
      activeFile: includedFile,
      fileContents: new Map([
        [includedFile.path, 'one two three four'],
        [excludedFile.path, 'one two three four five'],
      ]),
      dailyGoalFolders: ['Drafts'],
    });
    const tracker = new WordCountTracker(plugin as any) as any;

    expect(tracker.shouldCountFileForDailyGoal(includedFile)).toBe(true);
    expect(tracker.shouldCountFileForDailyGoal(excludedFile)).toBe(false);

    tracker.sessionStartTime = Date.now() - 5_000;
    tracker.sessionStartWordCount = 1;
    tracker.lastKnownWordCount = 1;
    tracker.wordsDeleted = 0;
    tracker.isTracking = true;

    await tracker.onDocumentChange(excludedFile);
    expect(tracker.lastKnownWordCount).toBe(1);

    const stats = await tracker.endSession(includedFile);
    expect(stats.wordsWritten).toBe(3);
  });
});

function createPluginStub(options?: {
  activeFile?: TFile | null;
  fileContents?: Map<string, string>;
  dailyGoalFolders?: string[];
}) {
  const activeFile = options?.activeFile ?? new TFile('Story/active.md');
  const fileContents = options?.fileContents ?? new Map<string, string>([
    [activeFile.path, 'alpha beta gamma'],
  ]);

  return {
    settings: {
      dailyWritingStats: [],
      dailyWordCountGoal: 50,
      dailyWordCountGoalFolders: options?.dailyGoalFolders ?? [],
      countDeletionsForGoal: true,
      notifyOnGoalReached: false,
    },
    app: {
      workspace: {
        getActiveFile: () => activeFile,
      },
      vault: {
        cachedRead: async (file: TFile) => fileContents.get(file.path) ?? '',
      },
    },
    saveSettings: vi.fn(async function saveSettings(this: any) {
      return this.settings;
    }),
  };
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
