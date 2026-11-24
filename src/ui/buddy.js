const shapes={arrow:'M8 5 26 17 18 19 14 27Z',triangle:'M16 5 28 26 4 26Z',diamond:'M16 3 28 16 16 29 4 16Z'};
function render(value){const shape=document.getElementById('cursor-shape');shape.setAttribute('d',shapes[value.shape]||shapes.arrow);shape.setAttribute('fill',value.color);}
window.lighthouse.cursor().then(render);window.lighthouse.onCursor(render);
