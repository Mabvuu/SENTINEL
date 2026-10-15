import {accessToken,failure,json} from '@/lib/server-api';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{resource:string}>}) {
 try{
  const {resource}=await params;
  if(!['history','address'].includes(resource))return json({detail:'Not found.'},404);
  const query=new URLSearchParams();const url=new URL(request.url);
  for(const key of ['attendance','after','page','q']){const value=url.searchParams.get(key);if(value)query.set(key,value.slice(0,200));}
  const access=await accessToken();
  // Forward JSON errors intact so missing map credentials are explained clearly.
  const base=process.env.DJANGO_API_URL;
  if(!base)return json({detail:'Backend address is not configured.'},503);
  const parsed=new URL(base);
  if(parsed.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&parsed.protocol==='http:'))return json({detail:'Backend must use HTTPS.'},503);
  const response=await fetch(base.replace(/\/+$/,'')+'/api/patrol/'+resource+'/?'+query,{headers:{Authorization:'Bearer '+access,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.headers.get('content-type')?.includes('application/json'))return json({detail:'Restart Django after installing the patrol routes.'},502);
  if(response.status>=500&&resource!=='address')return json({detail:'Patrol service unavailable. Check the Django terminal.'},502);
  return json(await response.json(),response.status);
 }catch(e){return failure(e);}
}
