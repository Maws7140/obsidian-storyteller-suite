import {describe,it,expect} from 'vitest';
import {removeMapMembership} from '../../src/services/MapMembershipService';
import type {StoryMap} from '../../src/types';
const fixture=():StoryMap=>({id:'map',name:'Map',scale:'region',markers:[{id:'pin',lat:1,lng:2,linkedLocationId:'a'},{id:'other',lat:3,lng:4,linkedLocationId:'b'}],placementGrid:{version:1,size:10,width:100,height:100,presets:{},areas:[{locationId:'a',cells:['0,0']},{locationId:'b',cells:['0,0']}],agreements:[{a:'a',b:'b',cells:['0,0'],kind:'disputed'}]},linkedLocations:['a','b']});
describe('map membership removal',()=>{
 it('removes location area, agreements, linked pins and map references together',()=>{const m=fixture();const n=removeMapMembership(m,'location','a','Alpha');expect(n.placementGrid?.areas.map(a=>a.locationId)).toEqual(['b']);expect(n.placementGrid?.agreements).toEqual([]);expect(n.markers.map(m=>m.id)).toEqual(['other']);expect(n.linkedLocations).toEqual(['b']);expect(m.placementGrid?.areas).toHaveLength(2);});
 it.each(['character','event','item','scene','reference','culture','economy','magicsystem','group'])('suppresses %s rediscovery without deleting the entity',type=>{const n=removeMapMembership(fixture(),type,'x');expect(n.removedMapEntities).toContain(`${type}:x`);expect(n.placementGrid?.areas).toHaveLength(2);});
 it('is idempotent',()=>{const n=removeMapMembership(fixture(),'location','a');expect(removeMapMembership(n,'location','a')).toEqual(n);});
 it('preserves same-name pins with a different stable ID',()=>{const m=fixture();m.markers[1].locationName='Alpha';expect(removeMapMembership(m,'location','a','Alpha').markers.map(m=>m.id)).toEqual(['other']);});
 it('removes linked entity references without destroying unrelated pin contents',()=>{const m=fixture();m.markers[1].linkedEntityRefs=[{entityType:'character',entityId:'x'},{entityType:'item',entityId:'y'}];expect(removeMapMembership(m,'character','x').markers[1].linkedEntityRefs).toEqual([{entityType:'item',entityId:'y'}]);});
});
import {readFileSync} from 'node:fs';
describe('modal deletion integration contracts',()=>{
 const source=readFileSync('src/main.ts','utf8');
 it.each(['Character','Location','Event','PlotItem','Scene','Culture','Economy','MagicSystem','Reference','CompendiumEntry'])('cleans map membership before deleting %s',kind=>{const start=source.indexOf(`async delete${kind}(`);const end=source.indexOf('await this.app.fileManager.trashFile(file)',start);expect(start).toBeGreaterThan(0);expect(source.slice(start,end)).toContain('cleanupEntityMapMembership');});
 it('uses same cleanup for groups',()=>{const start=source.indexOf('async deleteGroup(');expect(source.slice(start,start+1000)).toContain("detachFromMaps(this, 'group'");});
 it('updates the location modal draft after detaching',()=>expect(readFileSync('src/modals/LocationModal.ts','utf8')).toContain('this.location.mapBindings = this.location.mapBindings?.filter'));
});
