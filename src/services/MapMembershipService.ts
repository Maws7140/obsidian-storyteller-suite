import { TFile } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { StoryMap } from '../types';

export const mapEntityKey=(type:string,id:string)=>`${type.toLowerCase().replace(/[-_ ]/g,'')}:${id}`;
/** Remove map representation, not the underlying entity or story relationships. */
export function removeMapMembership(map:StoryMap,type:string,id:string,name?:string):StoryMap {
    const next:StoryMap=JSON.parse(JSON.stringify(map));
    next.removedMapEntities=[...new Set([...(next.removedMapEntities??[]),mapEntityKey(type,id)])];
    if(type==='location'&&next.placementGrid){
        next.placementGrid.areas=next.placementGrid.areas.filter(a=>a.locationId!==id);
        next.placementGrid.agreements=next.placementGrid.agreements.filter(a=>a.a!==id&&a.b!==id);
    }
    next.markers=(next.markers??[]).filter(m=>!(type==='location'&&(m.linkedLocationId===id||(!m.linkedLocationId&&m.locationName===name)))&&!(type==='event'&&m.eventName===name)).map(m=>({...m,linkedEntityRefs:m.linkedEntityRefs?.filter(r=>!(r.entityId===id&&r.entityType===type))}));
    const fields:Record<string,string>={location:'linkedLocations',character:'linkedCharacters',event:'linkedEvents',item:'linkedItems',scene:'linkedScenes',group:'linkedGroups',culture:'linkedCultures',economy:'linkedEconomies',magicsystem:'linkedMagicSystems',reference:'linkedReferences'};
    const record=next as unknown as Record<string,unknown>;const field=fields[type];if(field&&Array.isArray(record[field]))record[field]=(record[field] as string[]).filter(v=>v!==id&&v!==name);
    return next;
}
export async function detachFromMaps(plugin:StorytellerSuitePlugin,type:string,id:string,name?:string,mapId?:string):Promise<void>{
    const maps=await plugin.listMaps();
    for(const map of maps){if(mapId&&(map.id||map.name)!==mapId)continue;
        const file=map.filePath?plugin.app.vault.getAbstractFileByPath(map.filePath):null;if(!(file instanceof TFile))continue;
        await plugin.app.fileManager.processFrontMatter(file,fm=>{
            const next=removeMapMembership({...map,...fm} as StoryMap,type,id,name);
            for(const key of ['removedMapEntities','placementGrid','markers','linkedLocations','linkedCharacters','linkedEvents','linkedItems','linkedScenes','linkedGroups','linkedCultures','linkedEconomies','linkedMagicSystems','linkedReferences']) {
                const value=(next as unknown as Record<string,unknown>)[key];if(value!==undefined)fm[key]=value;
            }
        });
    }
    if (type === 'location') {
        const location = (await plugin.listLocations()).find(l => (l.id || l.name) === id);
        const file = location?.filePath ? plugin.app.vault.getAbstractFileByPath(location.filePath) : null;
        if (file instanceof TFile) await plugin.app.fileManager.processFrontMatter(file, fm => {
            if (Array.isArray(fm.mapBindings)) fm.mapBindings = fm.mapBindings.filter((b: {mapId:string}) => mapId && b.mapId !== mapId);
            if (!mapId || fm.mapId === mapId) { delete fm.mapId; delete fm.mapCoordinates; delete fm.markerId; }
            if (Array.isArray(fm.relatedMapIds)) fm.relatedMapIds = fm.relatedMapIds.filter((id:string) => mapId && id !== mapId);
        });
    }
}
export async function restoreMapMembership(plugin:StorytellerSuitePlugin,mapId:string,type:string,id:string):Promise<void>{
    const map=(await plugin.listMaps()).find(m=>(m.id||m.name)===mapId);const file=map?.filePath?plugin.app.vault.getAbstractFileByPath(map.filePath):null;
    if(file instanceof TFile)await plugin.app.fileManager.processFrontMatter(file,fm=>{if(Array.isArray(fm.removedMapEntities))fm.removedMapEntities=fm.removedMapEntities.filter((key:string)=>key!==mapEntityKey(type,id));});
}
