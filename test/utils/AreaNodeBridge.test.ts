import {describe,it,expect} from 'vitest';
import {locationBindingOnMap,containEntityInArea} from '../../src/leaflet/grid/AreaNodeBridge';
import {readFileSync} from 'node:fs';
import type {StoryMap,Location} from '../../src/types';
const map:StoryMap={id:'m',name:'Map',scale:'region',markers:[],placementGrid:{version:1,size:10,width:25,height:25,presets:{},areas:[{locationId:'a',cells:['0,0','2,2'],labelCell:'2,2'}],agreements:[]}};
describe('areas extend native map nodes',()=>{
 it('uses the existing binding including custom icon and zoom limits unchanged',()=>{const binding={mapId:'m',coordinates:[12,14] as [number,number],markerIcon:'castle',zoomRange:[0,6] as [number,number]};expect(locationBindingOnMap({id:'a',name:'A',mapBindings:[binding]},map)).toBe(binding);});
 it('adapts existing area-only data to a native location node without writing a binding',()=>{const loc:Location={id:'a',name:'A'};expect(locationBindingOnMap(loc,map)?.coordinates).toEqual([22.5,22.5]);expect(loc.mapBindings).toBeUndefined();});
 it('does not revive removed locations',()=>expect(locationBindingOnMap({id:'a',name:'A'},{...map,removedMapEntities:['location:a']})).toBeUndefined());
 it('does not create a pin for an empty area',()=>expect(locationBindingOnMap({id:'b',name:'B'},map)).toBeUndefined());
 it('keeps Add location on its original placement path',()=>{const source=readFileSync('src/views/MapView.ts','utf8');const body=source.slice(source.indexOf('private showAddLocationModal'),source.indexOf('private async ensureLocationMapBinding'));expect(body).toContain('this.enablePlacementMode');expect(body).not.toContain('gridController.pick');});
 it('area canvas does not replace native click popups or draw duplicate labels',()=>{const source=readFileSync('src/leaflet/grid/GridController.ts','utf8');expect(source).not.toContain("map.on('click', this.inspect)");expect(source).not.toContain('ctx.strokeText');expect(source).toContain("map.on('storyteller:edit-area'");});
 it('native location popup contains the area edit action and tooltip',()=>{const source=readFileSync('src/leaflet/MapEntityRenderer.ts','utf8');expect(source).toContain("text: 'Edit location area'");expect(source).toContain('marker.bindTooltip(tooltip');expect(source).toContain('this.buildLocationPopup(location)');});
});

describe('grid editor mode isolation',()=>{
 it('gates painting and pointer capture on explicit grid mode',()=>{const s=readFileSync('src/leaflet/grid/GridController.ts','utf8');expect(s).toContain('const edit = this.show && !!this.editing');expect(s).toContain('if (!this.show || !this.editing');expect(s).toContain('this.panel.hidden = !visible || !this.editing');});
});

describe('location entity territory containment',()=>{
 it('preserves coordinates without an area',()=>expect(containEntityInArea(map,'missing',[12,14])).toEqual([12,14]));
 it('preserves interior positions',()=>expect(containEntityInArea(map,'a',[5,5])).toEqual([5,5]));
 it('does not place nodes in holes or between disconnected cells',()=>{const [y,x]=containEntityInArea(map,'a',[15,15]);expect((x<10&&y<10)||(x>=20&&y>=20)).toBe(true);});
 it('handles clipped edge tiles and icons larger than a cell',()=>expect(containEntityInArea(map,'a',[30,30],24)).toEqual([22.5,22.5]));
 it('constrains native entities after applying stacking offsets',()=>{const s=readFileSync('src/leaflet/MapEntityRenderer.ts','utf8');expect(s).toContain('marker.setLatLng(containEntityInArea');});
 it('mounts controls beside bottom-right quick actions',()=>{const s=readFileSync('src/views/MapView.ts','utf8');expect(s).toContain('mountToolbar(quickActions)');expect(s).not.toContain('mountToolbar(this.mapSelectorEl)');expect(s).not.toContain('mountToolbar(this.toolbarEl)');});
});
