'use client';
import {useEffect,useRef,useState} from 'react';
import type * as Leaflet from 'leaflet';
import type {Point,Checkpoint} from './round-types';
import 'leaflet/dist/leaflet.css';
type TrackPoint=Point&{usable:boolean;is_anchor:boolean;segment_start:boolean};
type Props={invalidCheckpoints?:number[];attendanceRadius?:number;onMoveBoundary?:(i:number,p:Point)=>void;onMoveCheckpoint?:(i:number,p:Point)=>void;center:Point;boundary:Point[];checkpoints:Checkpoint[];fitKey:string;onPick?:(p:Point)=>void;position?:(Point&{accuracy_metres:number})|null;fresh?:boolean;points?:TrackPoint[]};
export default function RoundMap({center,boundary,checkpoints,fitKey,onPick,position,fresh=false,points=[],invalidCheckpoints=[],attendanceRadius,onMoveBoundary,onMoveCheckpoint}:Props){
 const host=useRef<HTMLDivElement>(null),map=useRef<Leaflet.Map|null>(null),layer=useRef<Leaflet.LayerGroup|null>(null),lib=useRef<typeof Leaflet|null>(null),pick=useRef(onPick),fitted=useRef('');
 const [ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{pick.current=onPick;},[onPick]);
 useEffect(()=>{let dead=false;let observer:ResizeObserver|undefined;
  import('leaflet').then(L=>{if(dead||!host.current)return;lib.current=L;
   const m=L.map(host.current,{scrollWheelZoom:false});map.current=m;
   L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).on('tileerror',()=>{if(!dead)setError('Map tiles unavailable. Check your internet connection.');}).addTo(m);
   L.control.scale({imperial:false}).addTo(m);layer.current=L.layerGroup().addTo(m);
   m.on('click',(e:Leaflet.LeafletMouseEvent)=>pick.current?.({latitude:e.latlng.lat,longitude:e.latlng.lng}));
   observer=new ResizeObserver(()=>m.invalidateSize());observer.observe(host.current);setReady(true);
  }).catch(()=>{if(!dead)setError('Map unavailable. Refresh and try again.');});
  return()=>{dead=true;observer?.disconnect();map.current?.remove();map.current=null;};
 },[]);
 useEffect(()=>{const L=lib.current,m=map.current,g=layer.current;if(!L||!m||!g||!ready)return;g.clearLayers();
  const coords=(p:Point):Leaflet.LatLngTuple=>[p.latitude,p.longitude];
  if(attendanceRadius&&attendanceRadius>0)L.circle(coords(center),{radius:attendanceRadius,color:'#2468bb',weight:2,dashArray:'6 6',fillOpacity:.04,interactive:false}).bindTooltip('Clock-in area').addTo(g);
  if(onMoveBoundary)boundary.forEach((p,i)=>{
   const marker=L.marker(coords(p),{draggable:true,bubblingMouseEvents:false,icon:L.divIcon({className:'sr-corner',html:'<span>'+(i+1)+'</span>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(g);
   marker.bindTooltip('Corner '+(i+1)+' — drag to move');marker.on('dragend',()=>{const q=marker.getLatLng();onMoveBoundary(i,{latitude:q.lat,longitude:q.lng});});
  });
  if(boundary.length>=3)L.polygon(boundary.map(coords),{color:'#15803d',weight:3,fillColor:'#4ade80',fillOpacity:.28}).addTo(g);
  else if(boundary.length)L.polyline(boundary.map(coords),{color:'#526778',dashArray:'5 6'}).addTo(g);
  if(checkpoints.length>1)L.polyline(checkpoints.map(coords),{color:'#ad855c',weight:2,dashArray:'3 8',opacity:.6}).bindTooltip('Planned checkpoint order — not recorded movement').addTo(g);
  checkpoints.forEach((cp,i)=>{const color=invalidCheckpoints.includes(i)?'#dc2626':cp.checked_at?'#127b65':['late','missed','overdue'].includes(cp.status||'')?'#b93835':'#b37715';
   L.circle(coords(cp),{radius:cp.radius_metres,color,weight:1,fillOpacity:.1}).addTo(g);
   const label=document.createElement('span');label.textContent=(i+1)+'. '+cp.name;
   const marker=L.marker(coords(cp),{draggable:!!onMoveCheckpoint,bubblingMouseEvents:false,icon:L.divIcon({className:'sr-number',html:`<span style="background:${color}">${i+1}</span>`,iconSize:[30,30],iconAnchor:[15,15]})}).bindTooltip(label).addTo(g);
   if(onMoveCheckpoint)marker.on('dragend',()=>{const p=marker.getLatLng();onMoveCheckpoint(i,{latitude:p.lat,longitude:p.lng});});
  });
  let segment:Leaflet.LatLngTuple[]=[];
  const flush=()=>{if(segment.length>1)L.polyline(segment,{color:'#2468bb',weight:4}).addTo(g);segment=[];};
  points.forEach(p=>{if(!p.usable||!p.is_anchor){if(!p.usable)flush();return;}if(p.segment_start)flush();segment.push(coords(p));});flush();
  if(position){const color=fresh?'#2468bb':'#7f8b99';L.circle(coords(position),{radius:position.accuracy_metres,color,weight:1,fillOpacity:.1}).addTo(g);L.circleMarker(coords(position),{radius:7,color:'#fff',weight:3,fillColor:color,fillOpacity:1}).bindTooltip(fresh?'Latest phone location':'Last known position — not live').addTo(g);}
  if(fitted.current!==fitKey){if(boundary.length>=3)m.fitBounds(L.latLngBounds([...boundary,...checkpoints].map(coords)),{padding:[35,35],maxZoom:19});else m.setView(coords(center),17);fitted.current=fitKey;}
 },[ready,center,boundary,checkpoints,fitKey,position,fresh,points,attendanceRadius,onMoveBoundary,onMoveCheckpoint,invalidCheckpoints]);
 return <><div ref={host} className="sr-map" aria-label="Property boundary, numbered checkpoints and recorded path"/>{error&&<p role="alert">{error}</p>}</>;
}
