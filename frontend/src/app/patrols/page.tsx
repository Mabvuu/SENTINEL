'use client';
import {useEffect,useState} from 'react';
import SiteMap,{type MapPoint} from '@/components/SiteMap';
import {dashboardRequest} from '@/lib/dashboard-client';
type Position={latitude:number;longitude:number;accuracy_metres:number;captured_at:string;received_at:string};
type Attendance={id:number;guard:string;site:string;boundary:{latitude:string|number;longitude:string|number;radius_metres:number};status:string;active:boolean;shift_ends_at:string;started_at:string;last_position:Position|null};
type Feed={attendance:Attendance;server_time:string;estimated_distance_metres:number;points:MapPoint[];has_more:boolean;next_after:number};
export default function Patrols(){
 const [records,setRecords]=useState<Attendance[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[page,setPage]=useState(1),[next,setNext]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{let alive=true;dashboardRequest<{results:Attendance[];next:string|null}>('/api/patrol/history?page='+page).then(r=>{if(alive){setRecords(r.results);setNext(Boolean(r.next));setError('');}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[page,revision]);
 return <main className="patrol-page"><h1>Patrol map</h1><p>Phone GPS updates during an assigned, clocked-in shift.</p>
 <label>Guard and shift <select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select a guard’s shift</option>{records.map(r=><option key={r.id} value={r.id}>{r.guard} · {r.site} · {new Date(r.started_at).toLocaleString('en-GB',{timeZone:'Africa/Harare'})} CAT</option>)}</select></label>
 <p><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button> <button disabled={!next} onClick={()=>setPage(p=>p+1)}>Next</button> <button onClick={()=>setRevision(v=>v+1)}>Refresh shifts</button></p>
 {error&&<p className="patrol-warning" role="alert">{error}</p>}
 {!records.length&&!error&&<p>No clock-in records on this page. Assign a guard, then clock in on their phone.</p>}
 {selected&&<Trail key={selected} id={selected}/>}</main>;
}
function Trail({id}:{id:string}){
 const [feed,setFeed]=useState<Feed|null>(null),[error,setError]=useState(''),[age,setAge]=useState(0);
 useEffect(()=>{
  let alive=true,cursor=0;let points:MapPoint[]=[];let timer:ReturnType<typeof setTimeout>;
  async function update(){
   try{
    let more=true;
    while(more&&alive){
     const result=await dashboardRequest<Feed>(`/api/patrol/history?attendance=${id}&after=${cursor}`);
     if(!alive)return;
     points=[...points,...result.points];cursor=result.next_after;more=result.has_more;
     setFeed({...result,points});setAge(0);setError('');
    }
   }catch(e){if(alive)setError(e instanceof Error?e.message:'Could not load GPS updates.');}
   finally{if(alive)timer=setTimeout(update,10000);}
  }
  void update();const tick=setInterval(()=>{if(alive)setAge(v=>v+1);},1000);
  return()=>{alive=false;clearTimeout(timer);clearInterval(tick);};
 },[id]);
 if(!feed)return <p>{error||'Loading patrol…'}</p>;
 const a=feed.attendance,p=a.last_position,b=a.boundary;
 const serverNow=Date.parse(feed.server_time)+age*1000;
 const elapsed=p?Math.max(0,Math.floor((serverNow-Date.parse(p.captured_at))/1000)):null;
 const stale=p&&(serverNow-Date.parse(p.received_at)>90000||Number(elapsed)>90);
 const status=!a.active||serverNow>=Date.parse(a.shift_ends_at)?'ended':error?'connection lost':stale?'stale':a.status;
 return <section className="patrol-card"><h2>{a.guard} · {a.site}</h2>
 <div className="patrol-summary"><p>Status: <strong>{status}</strong></p><p>Estimated patrol distance: <strong>{(feed.estimated_distance_metres/1000).toFixed(2)} km</strong></p><p>Last GPS: {elapsed===null?'not received':`${elapsed} seconds ago`}</p><p>Accuracy: {p?`±${Math.round(p.accuracy_metres)} m`:'—'}</p></div>
 {error&&<p role="alert" className="patrol-warning">{error}</p>}
 <SiteMap latitude={Number(b.latitude)} longitude={Number(b.longitude)} radius={b.radius_metres} points={feed.points} position={p}/>
 <p>Orange circle: assigned site. Blue line: accepted GPS route. Blue dot: last received position.</p>
 {!feed.points.length&&<p>No patrol history yet. On the guard’s phone, clock in and start location sharing.</p>}
 <small>Distance is an estimate, not proof of walking. Poor accuracy, long gaps and implausible jumps are excluded. Site boundaries use the values saved at clock-in. Route recording starts after this update is installed.</small>
 </section>;
}
