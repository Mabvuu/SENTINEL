export type GPSReading = { latitude:number; longitude:number; accuracy_metres:number; captured_at:string };
export async function readGPS(maxAccuracyMetres=50):Promise<GPSReading> {
  if (!Number.isFinite(maxAccuracyMetres)||maxAccuracyMetres<=0) throw new Error('Invalid site accuracy setting. Ask your supervisor to update the site.');
  if (!globalThis.isSecureContext) throw new Error('Browser location needs HTTPS. On this laptop open localhost, not the network IP address.');
  if (!navigator.geolocation) throw new Error('This browser does not provide location. Try Safari or Chrome.');
  return new Promise((resolve,reject)=>{
    let finished=false;
    let watcher:number|undefined;
    let problem='No location received. Enable Location Services for your browser in Mac System Settings, then allow location for this page.';
    const finish=(reading?:GPSReading,error?:string)=>{
      if(finished)return;
      finished=true; clearTimeout(timer);
      if(watcher!==undefined)navigator.geolocation.clearWatch(watcher);
      if(reading)resolve(reading);else reject(new Error(error||problem));
    };
    const timer=setTimeout(()=>finish(),30000);
    try {
      watcher=navigator.geolocation.watchPosition(position=>{
        const {latitude,longitude,accuracy}=position.coords;
        const age=Date.now()-position.timestamp;
        if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180||!Number.isFinite(age)||age < -5000||age>15000)return;
        if(!Number.isFinite(accuracy)||accuracy<=0||accuracy>maxAccuracyMetres){
          problem=`Location is only accurate to ${Math.round(accuracy)}m; this site needs ${maxAccuracyMetres}m or better. Try your phone outdoors. No clock-in has been saved.`;
          return;
        }
        finish({latitude,longitude,accuracy_metres:accuracy,captured_at:new Date(position.timestamp).toISOString()});
      },error=>{
        if(error.code===1)finish(undefined,'Location permission is blocked. Open the site controls beside the browser address, allow Location, and check Mac System Settings → Privacy & Security → Location Services. Then try again.');
        else if(error.code===2)finish(undefined,'Your device could not determine its location. Enable Wi-Fi and Location Services, or use your phone outdoors.');
        else finish();
      },{enableHighAccuracy:true,maximumAge:0,timeout:25000});
      if(finished&&watcher!==undefined)navigator.geolocation.clearWatch(watcher);
    }catch{finish(undefined,'The browser could not start location. Check its location permissions.');}
  });
}
