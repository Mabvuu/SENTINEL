'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './patrol-map.css';
export type MapPoint = { id:number; latitude:number; longitude:number; usable:boolean; is_anchor:boolean; segment_start:boolean };
type Props = { latitude:number; longitude:number; radius:number; editable?:boolean; onPick?:(lat:number,lon:number)=>void; points?:MapPoint[]; position?:{latitude:number;longitude:number;accuracy_metres:number}|null };
export default function SiteMap({latitude,longitude,radius,editable=false,onPick,points=[],position}:Props) {
 const host=useRef<HTMLDivElement>(null);
 const map=useRef<Leaflet.Map|null>(null);
 const layer=useRef<Leaflet.LayerGroup|null>(null);
 const library=useRef<typeof Leaflet|null>(null);
 const callback=useRef(onPick);
 const [ready,setReady]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{callback.current=onPick;},[onPick]);
 useEffect(()=>{
  let disposed=false;
  let observer:ResizeObserver|undefined;
  import('leaflet').then(L=>{
   if(disposed||!host.current)return;
   library.current=L;
   const m=L.map(host.current,{scrollWheelZoom:false}).setView([-17.8252,31.0335],13);
   map.current=m;
   L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
   }).on('tileerror',()=>{if(!disposed)setError('Map tiles could not load. Check your internet connection. Coordinates remain editable.');}).addTo(m);
   layer.current=L.layerGroup().addTo(m);
   m.on('click',(event:Leaflet.LeafletMouseEvent)=>{if(editable)callback.current?.(event.latlng.lat,event.latlng.lng);});
   observer=new ResizeObserver(()=>m.invalidateSize()); observer.observe(host.current);
   setReady(true);
  }).catch(()=>{if(!disposed)setError('Map could not load. Refresh the page.');});
  return()=>{disposed=true;observer?.disconnect();map.current?.remove();map.current=null;layer.current=null;};
 },[editable]);
 useEffect(()=>{
  const L=library.current,m=map.current,g=layer.current;
  if(!ready||!L||!m||!g)return;
  g.clearLayers();
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return;
  const center:Leaflet.LatLngTuple=[latitude,longitude];
  const circle=L.circle(center,{radius:Math.max(20,Math.min(radius||100,5000)),color:'#d78c36',fillOpacity:.09}).addTo(g);
  L.circleMarker(center,{radius:7,color:'#9a5d12',fillOpacity:1}).bindTooltip('Assigned site').addTo(g);
  const segments:Leaflet.LatLngTuple[][]=[];
  for(const p of points){
   if(!p.usable||!p.is_anchor)continue;
   if(p.segment_start||!segments.length)segments.push([]);
   segments[segments.length-1].push([p.latitude,p.longitude]);
  }
  for(const segment of segments)if(segment.length>1)L.polyline(segment,{color:'#2563eb',weight:4}).addTo(g);
  if(position){
   L.circle([position.latitude,position.longitude],{radius:position.accuracy_metres,color:'#2563eb',weight:1,fillOpacity:.08}).addTo(g);
   L.circleMarker([position.latitude,position.longitude],{radius:7,color:'#2563eb',fillOpacity:1}).bindTooltip('Last received phone position').addTo(g);
  }
  if(editable)m.fitBounds(circle.getBounds(),{maxZoom:17,padding:[24,24]});
  else if(!m.getContainer().dataset.fitted){m.fitBounds(circle.getBounds(),{maxZoom:17,padding:[24,24]});m.getContainer().dataset.fitted='yes';}
 },[latitude,longitude,radius,points,position,ready,editable]);
 return <div className="sentinel-map-wrap">{error&&<p role="alert">{error}</p>}<div ref={host} className="sentinel-map" aria-label={editable?'Click map to position site':'Site boundary and recorded patrol route'} />{editable&&<small>Click the map to move the site pin. Confirm the correct entrance or checkpoint before saving.</small>}</div>;
}
