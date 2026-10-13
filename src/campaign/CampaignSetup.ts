/**
 * Where a campaign records its play, and how its time works. A campaign is a
 * timeline fork: its sessions write dated events into that fork, so a story's
 * canon timeline stays as it was while the campaign runs alongside it.
 *
 * Shared by both places a session is started (the Campaign view's form and the
 * session manager modal), so they offer the same choices.
 */
import { Setting } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { CalendarSystem } from '../calendar/types';
import { formatInCalendar, parseInCalendar } from '../calendar/CalendarDateText';
import type { CampaignSession, TimelineFork } from '../types';

export type CampaignRecording =
    | { kind: 'new'; name: string }
    | { kind: 'fork'; forkId: string }
    | { kind: 'none' };

export interface CampaignSetupValues {
    recording: CampaignRecording;
    /** In-world date the session starts on, in the story's calendar. */
    startDate: string;
    timeMoves: boolean;
}

/** A campaign that has been played: its fork and its most recent session. */
export interface KnownCampaign {
    fork: TimelineFork;
    latest: CampaignSession;
}

function sessionOrder(session: CampaignSession): string {
    const record = session as CampaignSession & { modified?: string; created?: string };
    return record.modified ?? record.created ?? '';
}

/** Forks that sessions record into, each with its newest session, newest campaign first. */
export function knownCampaigns(sessions: readonly CampaignSession[], forks: readonly TimelineFork[]): KnownCampaign[] {
    const latestByFork = new Map<string, CampaignSession>();
    for (const session of sessions) {
        if (!session.campaignForkId) continue;
        const current = latestByFork.get(session.campaignForkId);
        if (!current || sessionOrder(session) > sessionOrder(current)) latestByFork.set(session.campaignForkId, session);
    }
    const campaigns: KnownCampaign[] = [];
    for (const [forkId, latest] of latestByFork) {
        const fork = forks.find(candidate => candidate.id === forkId);
        if (fork) campaigns.push({ fork, latest });
    }
    return campaigns.sort((a, b) => sessionOrder(b.latest).localeCompare(sessionOrder(a.latest)));
}

/** Continue the newest campaign when there is one, otherwise start a new one. */
export function defaultCampaignSetup(campaigns: readonly KnownCampaign[], storyName: string | undefined): CampaignSetupValues {
    const latest = campaigns[0];
    if (latest) {
        return {
            recording: { kind: 'fork', forkId: latest.fork.id },
            startDate: latest.latest.inWorldDate ?? latest.fork.divergenceDate ?? '',
            timeMoves: latest.latest.timeMoves === true,
        };
    }
    return { recording: { kind: 'new', name: storyName ? `${storyName} campaign` : 'Campaign' }, startDate: '', timeMoves: false };
}

/** What is wrong with the setup, or null. A recorded campaign needs a start date the calendar can read. */
export function campaignSetupProblem(values: CampaignSetupValues, calendar: CalendarSystem): string | null {
    if (values.recording.kind === 'new' && !values.recording.name.trim()) return 'Give the new campaign a name.';
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
            .setDesc('A campaign records its play into its own timeline fork, so your story\'s main timeline stays as it is.')
            .addDropdown(dropdown => {
                dropdown.addOption('new', 'New campaign');
                for (const campaign of campaigns) dropdown.addOption(`fork:${campaign.fork.id}`, `Continue ${campaign.fork.name}`);
                dropdown.addOption('none', 'Don\'t record on the timeline');
                const current = values.recording;
                dropdown.setValue(current.kind === 'fork' ? `fork:${current.forkId}` : current.kind);
                dropdown.onChange(choice => {
                    if (choice === 'new') {
                        values.recording = { kind: 'new', name: '' };
                    } else if (choice === 'none') {
                        values.recording = { kind: 'none' };
                    } else {
                        const forkId = choice.slice('fork:'.length);
                        const campaign = campaigns.find(candidate => candidate.fork.id === forkId);
                        values.recording = { kind: 'fork', forkId };
                        // Pick up where the campaign left off.
                        if (campaign) {
                            values.startDate = campaign.latest.inWorldDate ?? campaign.fork.divergenceDate ?? values.startDate;
                            values.timeMoves = campaign.latest.timeMoves === true;
                        }
                    }
                    render();
                });
            });

        const recording = values.recording;
        if (recording.kind === 'new') {
            new Setting(section)
                .setName('Campaign name')
                .setDesc('Also the name of its timeline fork.')
                .addText(text => text.setValue(recording.name).onChange(value => { recording.name = value; }));
        }

        const dateSetting = new Setting(section)
            .setName('In-world date')
            .setDesc(recording.kind === 'fork'
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
    if (recording.kind === 'none') {
        session.campaignForkId = undefined;
        session.campaignForkName = undefined;
        return;
    }
    if (recording.kind === 'fork') {
        const fork = plugin.getTimelineFork(recording.forkId);
        session.campaignForkId = fork?.id;
        session.campaignForkName = fork?.name;
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
