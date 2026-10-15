import {accessToken,checkOrigin,readJSON,json,failure} from '@/lib/server-api';
export const runtime='nodejs';

async function forward(request:Request){
 try{

  const body=request.method==='POST'?(checkOrigin(request),await readJSON(request)):undefined;
  const base=process.env.DJANGO_API_URL;if(!base)return json({detail:'Backend address is missing.'},503);
  const parsed=new URL(base);if(parsed.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&parsed.protocol==='http:'))return json({detail:'Backend must use HTTPS.'},503);
  const query=new URLSearchParams(),url=new URL(request.url);
  for(const key of ['date','shift','page']){const value=url.searchParams.get(key);if(value)query.set(key,value.slice(0,100));}
  const response=await fetch(base.replace(/\/+$/,'')+'/api/duty/admin/?'+query,{method:request.method,headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.headers.get('content-type')?.includes('application/json'))return json({detail:'Round endpoints are unavailable. Restart the backend after installation.'},502);
  if(response.status>=500)return json({detail:'Round service failed. Check the backend terminal.'},502);
  return json(await response.json(),response.status);
 }catch(e){return failure(e);}
}
export const GET=forward;export const POST=forward;
