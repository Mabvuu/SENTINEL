export type Point={latitude:number;longitude:number};
export type Checkpoint=Point&{name:string;radius_metres:number;index?:number;status?:string;due_at?:string;checked_at?:string|null};
export type Route={id:number;site:number;name:string;boundary:Point[];checkpoints:Checkpoint[];must_follow_order:boolean;area_m2:number};
export type Round={id:number;shift:number;attendance:number|null;site:number;site_name:string;guard:string;name:string;boundary:Point[];checkpoints:Checkpoint[];must_follow_order:boolean;area_m2:number;starts_at:string;due_at:string;started_at:string|null;finished_at:string|null;status:string;completed:number;total:number;last_position:(Point&{accuracy_metres:number;captured_at:string})|null;location_fresh:boolean;late_count:number};
export type Choices={sites:(Point&{id:number;name:string;radius_metres:number})[];shifts:{id:number;site:number;label:string;starts_at:string;ends_at:string}[]};
export function when(value:string){return new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Harare',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}
