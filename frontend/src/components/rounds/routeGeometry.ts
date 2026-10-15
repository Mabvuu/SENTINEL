import type {Point} from './round-types';
export function insideProperty(point:Point, outline:Point[]):boolean {
 if(outline.length<3)return false;
 const all=[...outline,point],lat=all.reduce((s,p)=>s+p.latitude,0)/all.length;
 const xy=all.map(p=>[(p.longitude-all[0].longitude)*111195*Math.cos(lat*Math.PI/180),(p.latitude-all[0].latitude)*111195]);
 const [x,y]=xy.pop()!;let inside=false;
 for(let i=0;i<xy.length;i++){
  const a=xy[i],b=xy[(i+1)%xy.length],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/length)):0;
  if((x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2<=1)return true;
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
