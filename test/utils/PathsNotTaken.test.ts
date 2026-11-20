import { describe, expect, it } from 'vitest';
import { PATH_NOT_TAKEN_TAG, pathsNotTakenEvents } from '../../src/utils/PathsNotTaken';

describe('paths not taken', () => {
    const scene = {
        id: 'ev1',
        name: 'Session 2: The Mines of Moria',
        dateTime: '3019-01-13 to 3019-01-15',
        filePath: 'Events/Session 2 The Mines of Moria.md',
        branches: ['Fellowship campaign'],
        pathsNotTaken: ['Run for the Dimrill Gate', ' '],
    };

    it('makes one faded marker per choice, at the start of the scene, opening the scene event', () => {
        const ghosts = pathsNotTakenEvents(scene);
        expect(ghosts).toHaveLength(1);
        expect(ghosts[0]).toMatchObject({
            id: 'ev1::path-not-taken::0',
            name: 'Not taken: Run for the Dimrill Gate',
            dateTime: '3019-01-13',
            filePath: scene.filePath,
            branches: ['Fellowship campaign'],
            tags: [PATH_NOT_TAKEN_TAG],
        });
    });

    it('makes nothing for an event without choices passed over, an undated one, or a marker itself', () => {
        expect(pathsNotTakenEvents({ name: 'Plain', dateTime: '3019' })).toEqual([]);
        expect(pathsNotTakenEvents({ ...scene, dateTime: undefined })).toEqual([]);
        expect(pathsNotTakenEvents(pathsNotTakenEvents(scene)[0])).toEqual([]);
    });
});
