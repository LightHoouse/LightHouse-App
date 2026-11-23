import {test} from 'node:test';
import assert from 'node:assert/strict';
import {placeChat} from './dist/chat-placement.js';
const size={width:350,height:240};
test('flips above at bottom and left at right; respects work area and negative monitors',()=>{
 for(const area of [{x:0,y:0,width:1920,height:1040},{x:-1920,y:-300,width:1920,height:1080},{x:0,y:0,width:240,height:180}]){
  for(const x of [area.x+1,area.x+area.width/2,area.x+area.width-1])for(const y of [area.y+1,area.y+area.height/2,area.y+area.height-1]){
   const result=placeChat({x,y},area,size),b=result.bounds;
   assert.ok(b.x>=area.x&&b.y>=area.y);assert.ok(b.x+b.width<=area.x+area.width);assert.ok(b.y+b.height<=area.y+area.height);
   if(y===area.y+area.height-1)assert.equal(result.above,true);
   if(x===area.x+area.width-1)assert.equal(result.left,true);
  }
 }
 assert.equal(placeChat({x:500,y:100},{x:0,y:0,width:1920,height:1040},size).above,false);
});
