import React,{useEffect,useRef,useState} from 'react';
import {Pressable,Text,View,StyleSheet} from 'react-native';
import * as Location from 'expo-location';
type Site={latitude:string;longitude:string;radius_metres:number;max_accuracy_metres:number};
export default function LocationCheck({site}:{site:Site}){
 const [status,setStatus]=useState('Not checked yet'),[reading,setReading]=useState<Location.LocationObject|null>(null),[busy,setBusy]=useState(false);
 const watcher=useRef<Location.LocationSubscription|null>(null),mounted=useRef(true),generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;watcher.current?.remove();if(timer.current)clearTimeout(timer.current);};},[]);
 async function check(){const id=++generation.current;watcher.current?.remove();setReading(null);setBusy(true);setStatus('Allow location when your device asks…');if(timer.current)clearTimeout(timer.current);
 timer.current=setTimeout(()=>{if(mounted.current&&generation.current===id){generation.current++;watcher.current?.remove();setBusy(false);setStatus('No location received. Check browser and device location permissions, then retry.');}},30000);
 try{const p=await Location.requestForegroundPermissionsAsync();if(!mounted.current||generation.current!==id)return;if(!p.granted)throw Error('Location blocked. Allow location in your browser and device settings.');
 const sub=await Location.watchPositionAsync({accuracy:Location.Accuracy.High,timeInterval:1000,distanceInterval:0},pos=>{if(!mounted.current||generation.current!==id)return;setReading(pos);setBusy(false);setStatus('Location detected. Clock-in will take a fresh reading.');if(timer.current)clearTimeout(timer.current);},()=>{if(mounted.current&&generation.current===id){setBusy(false);setStatus('Location unavailable. Check device permissions.');}});if(!mounted.current||generation.current!==id)sub.remove();else{watcher.current=sub;setTimeout(()=>{if(generation.current===id)sub.remove();},30000);}
 }catch(e){if(mounted.current&&generation.current===id){setBusy(false);setStatus(e instanceof Error?e.message:'Location unavailable');if(timer.current)clearTimeout(timer.current);}}}
 const lat=Number(site.latitude),lon=Number(site.longitude),p=reading?.coords,rad=Math.PI/180;
 const distance=p?6371008.8*2*Math.asin(Math.sqrt(Math.min(1,Math.sin((p.latitude-lat)*rad/2)**2+Math.cos(lat*rad)*Math.cos(p.latitude*rad)*Math.sin((p.longitude-lon)*rad/2)**2))):null;
 const accurate=p?.accuracy!=null&&p.accuracy>0&&p.accuracy<=site.max_accuracy_metres;
 return <View style={s.box}><Text style={s.title}>Your location</Text><Text style={s.note}>{status}</Text>{p&&<><Text style={s.note}>{p.latitude.toFixed(5)}, {p.longitude.toFixed(5)} · accuracy {p.accuracy==null?'unknown':`±${Math.round(p.accuracy)}m`}</Text><Text style={s.note}>{Math.round(distance||0)}m from site centre · allowed radius {site.radius_metres}m</Text><Text style={s.note}>{accurate&&distance!==null&&distance+(p.accuracy||0)<=site.radius_metres?'Reading fits the site. Clock in to start duty.':!accurate?'Location detected, but accuracy is not yet sufficient to verify attendance.':'This reading does not fit fully inside the site radius.'}</Text></>}
 <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void check()} style={s.button}><Text style={s.title}>{busy?'Finding location…':'Check my location'}</Text></Pressable><Text style={s.note}>Indoor readings are supported when your device can locate you. This check does not clock you in.</Text></View>;
}
const s=StyleSheet.create({box:{padding:14,borderRadius:12,backgroundColor:'#eef4f8',marginBottom:12},title:{fontSize:13,color:'#203b58',fontWeight:'600'},note:{fontSize:12,lineHeight:18,color:'#536b80',marginVertical:5},button:{paddingVertical:12}});
