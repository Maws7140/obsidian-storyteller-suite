import { charactersController } from './CharactersController';
import { itemsController } from './ItemsController';
import { eventsController } from './EventsController';
import { booksController } from './BooksController';
import { campaignController } from './CampaignController';
import { compendiumController } from './CompendiumController';
import { culturesController } from './CulturesController';
import { economiesController } from './EconomiesController';
import { locationsController } from './LocationsController';
import { magicSystemsController } from './MagicSystemsController';
import { mapsController } from './MapsController';
import { referencesController } from './ReferencesController';
import { writingController } from './WritingController';
import type { DashboardTabController } from './types';

export function createDashboardControllerRegistry(): Map<string, DashboardTabController> {
    return new Map<string, DashboardTabController>([
        [charactersController.id, charactersController],
        [locationsController.id, locationsController],
        [eventsController.id, eventsController],
        [itemsController.id, itemsController],
        [mapsController.id, mapsController],
        [referencesController.id, referencesController],
        [writingController.id, writingController],
        [culturesController.id, culturesController],
        [economiesController.id, economiesController],
        [magicSystemsController.id, magicSystemsController],
        [compendiumController.id, compendiumController],
        [booksController.id, booksController],
        [campaignController.id, campaignController],
    ]);
}
