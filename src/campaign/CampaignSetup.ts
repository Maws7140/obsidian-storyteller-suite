/**
 * Where a campaign records its play, and how its time works. A campaign either
 * has its own timeline fork (its events stay off the main timeline, for a game
 * played in a world whose story is kept separately) or its own track on the
 * main timeline (its events are part of the story, in a lane of their own).
 *
 * Shared by both places a session is started (the Campaign view's form and the
 * session manager modal), so they offer the same choices.
 */
import { Setting } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { CalendarSystem } from '../calendar/types';
import { formatInCalendar, parseInCalendar } from '../calendar/CalendarDateText';
import type { CampaignSession, TimelineFork, TimelineTrack } from '../types';

export type CampaignRecording =
    | { kind: 'new'; name: string }
    | { kind: 'new-track'; name: string }
    | { kind: 'fork'; forkId: string }
    | { kind: 'track'; trackId: string }
    | { kind: 'none' };

export interface CampaignSetupValues {
    recording: CampaignRecording;
    /** In-world date the session starts on, in the story's calendar. */
    startDate: string;
    timeMoves: boolean;
}

/** A campaign that has been played: its fork or track, and its most recent session. */
export interface KnownCampaign {
    kind: 'fork' | 'track';
    id: string;
    name: string;
    /** Where the campaign started, for a fork. */
    startDate?: string;
    latest: CampaignSession;
}

function sessionOrder(session: CampaignSession): string {
    const record = session as CampaignSession & { modified?: string; created?: string };
    return record.modified ?? record.created ?? '';
}

/** Campaigns that sessions record into, each with its newest session, newest campaign first. */
export function knownCampaigns(
    sessions: readonly CampaignSession[],
    forks: readonly TimelineFork[],
    tracks: readonly TimelineTrack[] = [],
): KnownCampaign[] {
    const latestByKey = new Map<string, CampaignSession>();
    for (const session of sessions) {
        const key = session.campaignForkId ? `fork:${session.campaignForkId}` : session.campaignTrackId ? `track:${session.campaignTrackId}` : null;
        if (!key) continue;
        const current = latestByKey.get(key);
        if (!current || sessionOrder(session) > sessionOrder(current)) latestByKey.set(key, session);
    }
    const campaigns: KnownCampaign[] = [];
    for (const [key, latest] of latestByKey) {
        const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
        if (kind === 'fork') {
            const fork = forks.find(candidate => candidate.id === id);
            if (fork) campaigns.push({ kind: 'fork', id, name: fork.name, startDate: fork.divergenceDate, latest });
        } else {
            const track = tracks.find(candidate => candidate.id === id);
            if (track) campaigns.push({ kind: 'track', id, name: track.name, latest });
        }
    }
    return campaigns.sort((a, b) => sessionOrder(b.latest).localeCompare(sessionOrder(a.latest)));
}

function continueRecording(campaign: KnownCampaign): CampaignRecording {
    return campaign.kind === 'fork' ? { kind: 'fork', forkId: campaign.id } : { kind: 'track', trackId: campaign.id };
}

/** Continue the newest campaign when there is one, otherwise start a new one on its own branch. */
export function defaultCampaignSetup(campaigns: readonly KnownCampaign[], storyName: string | undefined): CampaignSetupValues {
    const latest = campaigns[0];
    if (latest) {
        return {
            recording: continueRecording(latest),
            startDate: latest.latest.inWorldDate ?? latest.startDate ?? '',
            timeMoves: latest.latest.timeMoves === true,
        };
    }
    return { recording: { kind: 'new', name: storyName ? `${storyName} campaign` : 'Campaign' }, startDate: '', timeMoves: false };
}

/** The tag that puts an event on a campaign's track: `campaign-` and a slug of its name. */
export function campaignTrackTag(name: string): string {
    const slug = name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    return `campaign-${slug || 'play'}`;
}

/** What is wrong with the setup, or null. A recorded campaign needs a start date the calendar can read. */
export function campaignSetupProblem(values: CampaignSetupValues, calendar: CalendarSystem): string | null {
    const recording = values.recording;
    if ((recording.kind === 'new' || recording.kind === 'new-track') && !recording.name.trim()) return 'Give the new campaign a name.';
    const needsDate = values.recording.kind !== 'none' || values.timeMoves;
    if (!values.startDate.trim()) return needsDate ? 'Set the in-world date the session starts on.' : null;
    if (!parseInCalendar(values.startDate, calendar)) {
        return `"${values.startDate}" is not a date in the ${calendar.name} calendar.`;
    }
    return null;
}

/** An example date in the calendar, for the start date placeholder. */
function exampleDate(calendar: CalendarSystem): string {
    return formatInCalendar({ year: 1, month: 0, day: 1 }, calendar, 'day');
}

/**
 * The campaign fields of a new-session form. `values` is updated in place as
 * the user edits; `onChange` lets the form react (for example to re-validate).
 */
export function renderCampaignSetupFields(
    container: HTMLElement,
    values: CampaignSetupValues,
    campaigns: readonly KnownCampaign[],
    calendar: CalendarSystem,
): void {
    const section = container.createDiv('storyteller-campaign-setup');
    const render = () => {
        section.empty();
        new Setting(section)
            .setName('Campaign')
            .setDesc('Its own branch keeps play off your story\'s main timeline. The main timeline puts play in the story, in a lane of its own.')
            .addDropdown(dropdown => {
                dropdown.addOption('new', 'New campaign, on its own branch');
                dropdown.addOption('new-track', 'New campaign, on the main timeline');
                for (const campaign of campaigns) dropdown.addOption(`${campaign.kind}:${campaign.id}`, `Continue ${campaign.name}`);
                dropdown.addOption('none', 'Don\'t record on the timeline');
                const current = values.recording;
                dropdown.setValue(
                    current.kind === 'fork' ? `fork:${current.forkId}`
                        : current.kind === 'track' ? `track:${current.trackId}`
                            : current.kind,
                );
                dropdown.onChange(choice => {
                    if (choice === 'new' || choice === 'new-track') {
                        values.recording = { kind: choice, name: '' };
                    } else if (choice === 'none') {
                        values.recording = { kind: 'none' };
                    } else {
                        const campaign = campaigns.find(candidate => `${candidate.kind}:${candidate.id}` === choice);
                        if (campaign) {
                            values.recording = continueRecording(campaign);
                            // Pick up where the campaign left off.
                            values.startDate = campaign.latest.inWorldDate ?? campaign.startDate ?? values.startDate;
                            values.timeMoves = campaign.latest.timeMoves === true;
                        }
                    }
                    render();
                });
            });

        const recording = values.recording;
        if (recording.kind === 'new' || recording.kind === 'new-track') {
            new Setting(section)
                .setName('Campaign name')
                .setDesc(recording.kind === 'new' ? 'Also the name of its timeline branch.' : 'Also the name of its track.')
                .addText(text => text.setValue(recording.name).onChange(value => { recording.name = value; }));
        }

        const dateSetting = new Setting(section)
            .setName('In-world date')
            .setDesc(recording.kind === 'fork' || recording.kind === 'track'
                ? 'Where this campaign left off. Change it if time passed between sessions.'
                : `The date the session starts on, in the ${calendar.name} calendar.`);
        dateSetting.addText(text => text
            .setPlaceholder(exampleDate(calendar))
            .setValue(values.startDate)
            .onChange(value => { values.startDate = value; }));

        new Setting(section)
            .setName('Choices move time')
            .setDesc('Scenes, choices and encounters move the in-world date forward by the time they take.')
            .addToggle(toggle => toggle.setValue(values.timeMoves).onChange(value => { values.timeMoves = value; }));
    };
    render();
}

/**
 * Apply the setup to a session about to be saved: create the fork for a new
 * campaign, and copy the date and time setting onto the session.
 */
export async function applyCampaignSetup(
    plugin: StorytellerSuitePlugin,
    values: CampaignSetupValues,
    session: CampaignSession,
    calendar: CalendarSystem,
): Promise<void> {
    const parsed = values.startDate.trim() ? parseInCalendar(values.startDate, calendar) : null;
    session.inWorldDate = parsed ? formatInCalendar(parsed.date, calendar, parsed.precision === 'time' ? 'time' : 'day') : undefined;
    session.timeMoves = values.timeMoves || undefined;
    const recording = values.recording;
    session.campaignForkId = undefined;
    session.campaignForkName = undefined;
    session.campaignTrackId = undefined;
    session.campaignTag = undefined;
    if (recording.kind === 'none') return;
    if (recording.kind === 'fork') {
        const fork = plugin.getTimelineFork(recording.forkId);
        session.campaignForkId = fork?.id;
        session.campaignForkName = fork?.name;
        return;
    }
    if (recording.kind === 'track') {
        const track = plugin.getTimelineTrack(recording.trackId);
        session.campaignTrackId = track?.id;
        session.campaignTag = track?.filterCriteria?.tags?.[0];
        return;
    }
    if (recording.kind === 'new-track') {
        const name = recording.name.trim();
        const tag = campaignTrackTag(name);
        const track: TimelineTrack = {
            id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            storyId: plugin.getActiveStory()?.id,
            name,
            type: 'custom',
            description: 'A campaign played in Campaign mode. Its sessions record what happened here.',
            filterCriteria: { tags: [tag] },
            visible: true,
        };
        await plugin.createTimelineTrack(track);
        session.campaignTrackId = track.id;
        session.campaignTag = tag;
        return;
    }
    const fork = await plugin.createTimelineFork(
        recording.name.trim(),
        '',
        session.inWorldDate ?? '',
        'A campaign played in Campaign mode. Its sessions record what happened here.',
    );
    session.campaignForkId = fork.id;
    session.campaignForkName = fork.name;
}
