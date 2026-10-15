'use client';
import {useState,useEffect,useRef,useCallback,useId} from 'react';
import SiteMap from './SiteMap';
import {dashboardRequest} from '@/lib/dashboard-client';
type Draft={address:string;latitude:string;longitude:string;radius_metres:string};
type Result={address:string;latitude:number;longitude:number};
type Lookup={query:string;results:Result[];loading:boolean;error:string;done:boolean};
export default function SiteAddressPicker({draft,onChange}:{draft:Draft;onChange:(patch:Partial<Draft>)=>void}) {
 const [lookup,setLookup]=useState<Lookup>({query:'',results:[],loading:false,error:'',done:false});
 const [selected,setSelected]=useState('');
 const sequence=useRef(0), timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const id=useId();
 const query=draft.address.trim();
 const current=lookup.query===query;
 const search=useCallback(async (text:string)=>{
  const token=++sequence.current;
  setLookup({query:text,results:[],loading:true,error:'',done:false});
  try {
   const data=await dashboardRequest<{results:Result[]}>('/api/patrol/address?q='+encodeURIComponent(text));
   if(token!==sequence.current)return;
   const results=(data.results||[]).filter(r=>typeof r.address==='string'&&Number.isFinite(r.latitude)&&Number.isFinite(r.longitude));
   setLookup({query:text,results,loading:false,error:'',done:true});
  } catch(e) {
   if(token===sequence.current)setLookup({query:text,results:[],loading:false,error:e instanceof Error?e.message:'Address search failed. Try again.',done:true});
  }
 },[]);
 useEffect(()=>{
  if(query.length>=3&&query.length<=200&&query!==selected)timer.current=setTimeout(()=>void search(query),900);
  return()=>{if(timer.current)clearTimeout(timer.current);sequence.current++;};
 },[query,selected,search]);
 function retry(){if(timer.current)clearTimeout(timer.current);void search(query);}
 function pick(r:Result){
  if(timer.current)clearTimeout(timer.current);sequence.current++;
  setSelected(r.address.trim());
  setLookup({query:r.address.trim(),results:[],loading:false,error:'',done:false});
  onChange({address:r.address,latitude:r.latitude.toFixed(6),longitude:r.longitude.toFixed(6)});
 }
 const lat=draft.latitude.trim()===''?NaN:Number(draft.latitude),lon=draft.longitude.trim()===''?NaN:Number(draft.longitude);
 const valid=Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
 return <section className="site-address-picker" style={{minWidth:0,gridColumn:'1 / -1'}}>
  <label htmlFor={id}>Site address</label>
  <input id={id} required maxLength={200} autoComplete="off" value={draft.address} aria-describedby={id+'-help'} onChange={e=>{sequence.current++;setSelected('');onChange({address:e.target.value});}} placeholder="e.g. Renfrew Road, Harare" style={{width:'100%',boxSizing:'border-box'}} />
  <small id={id+'-help'}>Type a street, suburb and city. Choose the matching address below.</small>
  <div role="status" aria-live="polite">{current&&lookup.loading?'Looking for matching addresses…':''}</div>
  {current&&lookup.error&&<p role="alert" style={{color:'#9f1239',background:'#fff1f2',padding:12,borderRadius:8}}>{lookup.error}</p>}
  {current&&lookup.results.length>0&&<div style={{border:'1px solid #d7dfeb',borderRadius:10,margin:'10px 0',padding:10,background:'#fff'}}>
   <p style={{margin:'0 0 8px',color:'#193453',fontWeight:600}}>Did you mean one of these addresses?</p>
   <ul aria-label="Matching addresses" style={{listStyle:'none',padding:0,margin:0,maxHeight:240,overflowY:'auto'}}>{lookup.results.map((r,i)=><li key={i}><button type="button" onClick={()=>pick(r)} style={{display:'block',width:'100%',textAlign:'left',whiteSpace:'normal',padding:12,margin:'4px 0',background:'#f3f6fa',color:'#193453',border:'1px solid #d7dfeb',borderRadius:8}}>{r.address}</button></li>)}</ul>
  </div>}
  {current&&lookup.done&&!lookup.error&&lookup.results.length===0&&<p role="status">No matching address found. Try the street name with Harare, without the house number. You can also place the pin manually.</p>}
  {selected===query&&selected&&<p style={{color:'#166534'}}>Address selected. Check that the pin matches the correct property.</p>}
  <button type="button" disabled={query.length<3||query.length>200||(current&&lookup.loading)} onClick={retry}>Search again</button>
  <small> Address lookup by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a>. Some house numbers may not be listed.</small>
  <SiteMap editable latitude={valid?lat:-17.8252} longitude={valid?lon:31.0335} radius={Number(draft.radius_metres)||100} onPick={(latitude,longitude)=>onChange({latitude:latitude.toFixed(6),longitude:longitude.toFixed(6)})}/>
  {!valid&&<p>Select a matching address or click the map to set the site location.</p>}
 </section>;
}
