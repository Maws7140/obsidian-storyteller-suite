import {describe,it,expect} from 'vitest';
import {buildChildLocationDefaults,findChildLocationMaps,locationRef,noChildMapMessage} from '../../src/utils/MapChildNavigation';
import type {Location,StoryMap} from '../../src/types';

const loc=(over:Partial<Location>&{name:string}):Location=>({description:'',history:'',...over} as Location);
const map=(over:Partial<StoryMap>&{name:string}):StoryMap=>({scale:'city',markers:[],...over} as StoryMap);

describe('child location defaults',()=>{
 it('uses the parent id as the child parent reference',()=>{
  expect(buildChildLocationDefaults({id:'p1',name:'Kingdom'})).toEqual({parentLocationId:'p1'});
 });
 it('falls back to the parent name when there is no id',()=>{
  expect(buildChildLocationDefaults({name:'Kingdom'})).toEqual({parentLocationId:'Kingdom'});
  expect(locationRef({name:'Kingdom'})).toBe('Kingdom');
 });
});

describe('child map lookup',()=>{
 const locations=[
  loc({id:'city',name:'Capital',correspondingMapId:'city-map'}),
  loc({id:'town',name:'Harbor'}),
  loc({id:'lone',name:'Ruin'}),
  loc({id:'parent',name:'Realm',childLocationIds:['city','town','lone']}),
 ];
 const parent=locations[3];

 it('matches a map through the child correspondingLocationId',()=>{
  const maps=[map({id:'harbor-map',name:'Harbor Map',correspondingLocationId:'town'})];
  expect(findChildLocationMaps(parent,locations,maps).map(m=>m.id)).toEqual(['harbor-map']);
 });

 it('matches a map through the child correspondingMapId',()=>{
  const maps=[map({id:'city-map',name:'Capital Map'})];
  expect(findChildLocationMaps(parent,locations,maps).map(m=>m.name)).toEqual(['Capital Map']);
 });

 it('returns several maps in childLocationIds order without duplicates',()=>{
  const maps=[
   map({id:'harbor-map',name:'Harbor Map',correspondingLocationId:'town'}),
   map({id:'city-map',name:'Capital Map',correspondingLocationId:'city'}),
   map({id:'city-map',name:'Capital Map',correspondingLocationId:'city'}),
  ];
  const found=findChildLocationMaps(parent,locations,maps);
  expect(found.map(m=>m.id)).toEqual(['city-map','harbor-map']);
 });

 it('returns nothing when no child location has a linked map',()=>{
  const maps=[map({id:'other',name:'Other',correspondingLocationId:'unrelated'})];
  expect(findChildLocationMaps(parent,locations,maps)).toEqual([]);
 });

 it('ignores maps linked to the parent itself',()=>{
  const maps=[map({id:'realm-map',name:'Realm Map',correspondingLocationId:'parent'})];
  expect(findChildLocationMaps(parent,locations,maps)).toEqual([]);
 });

 it('handles a location without child ids',()=>{
  expect(findChildLocationMaps({childLocationIds:undefined},locations,[map({name:'X',correspondingLocationId:'city'})])).toEqual([]);
 });

 it('builds a helpful message without em dashes',()=>{
  const message=noChildMapMessage('Realm');
  expect(message).toContain('Realm');
  expect(message).not.toContain('—');
 });
});
