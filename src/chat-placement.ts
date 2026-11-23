type Point={x:number;y:number};
type Rect=Point&{width:number;height:number};

export function placeChat(pointer:Point,area:Rect,requested:{width:number;height:number}) {
 const margin=8,gap=12;
 const width=Math.min(requested.width,Math.max(1,area.width-margin*2));
 const height=Math.min(requested.height,Math.max(1,area.height-margin*2));
 const above=pointer.y+gap+height>area.y+area.height-margin && pointer.y-area.y>area.y+area.height-pointer.y;
 const left=pointer.x+gap+width>area.x+area.width-margin;
 const x=Math.max(area.x+margin,Math.min(left?pointer.x-gap-width:pointer.x+gap,area.x+area.width-width-margin));
 const y=Math.max(area.y+margin,Math.min(above?pointer.y-gap-height:pointer.y+gap,area.y+area.height-height-margin));
 return {bounds:{x:Math.round(x),y:Math.round(y),width:Math.round(width),height:Math.round(height)},above,left};
}
