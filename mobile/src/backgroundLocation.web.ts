import {stopForegroundTracking} from './foregroundLocation';
export async function stopBackgroundTracking(){stopForegroundTracking();}
export async function getTrackingState(_shiftId:number){return {enabled:false,message:'Use Share while app is open for this browser preview. Background tracking is unavailable.'};}
export async function startBackgroundTracking(_shiftId:number):Promise<void>{throw new Error('Background tracking needs the installed phone app. Choose Share while app is open.');}
