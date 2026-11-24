import {z} from 'zod';
const text = z.string().trim().min(1).max(120);
const target = z.object({ automationId:z.string().max(300), name:z.string().max(300), controlType:z.string().max(80) }).strict();
const observedElement=z.object({automationId:z.string().max(300),role:z.string().max(80),name:z.string().max(300),enabled:z.boolean(),selected:z.boolean().nullable(),checkedValue:z.boolean().nullable(),expanded:z.boolean().nullable()}).strict();
const observedState=z.object({windowTitle:z.string().max(512),visibleNames:z.array(z.string().max(300)).max(100),elements:z.array(observedElement).max(100),observedAt:z.number().finite()}).strict();
const captureSchema=z.object({surface:z.literal('uia'),preState:observedState.nullable(),postState:observedState.nullable(),details:z.object({className:z.string().max(300),ancestors:z.array(z.object({role:z.string().max(80),name:z.string().max(300)}).strict()).max(5),supportedPatterns:z.array(z.string().max(120)).max(50),enabled:z.boolean(),bboxNorm:z.array(z.number().finite()).length(4),appVersion:z.string().max(120)}).strict(),env:z.object({os:z.string().max(300),dpi:z.number().positive().nullable(),resolution:z.array(z.number().int()).length(2),monitorCount:z.number().int().positive(),locale:z.string().max(80)}).strict()}).strict();
export const portableStepSchema = z.object({
  eventId:z.string().uuid(), event:z.enum(['click','doubleClick','rightClick','scroll','type','dragDrop']),
  target, window:z.object({process:text,title:z.string().max(300)}).strict(),
  scrollDelta:z.tuple([z.number().int().min(-12000).max(12000),z.number().int().min(-12000).max(12000)]).optional(),
  motion:z.object({start:z.tuple([z.number().min(0).max(1),z.number().min(0).max(1)]),end:z.tuple([z.number().min(0).max(1),z.number().min(0).max(1)])}).strict().optional(),
  capture:captureSchema.optional(), enrichment:z.boolean().default(false),
  timestamp:z.number().finite(), direction:z.enum(['up','down']).optional(),
}).strict().refine(s=>s.event!=='dragDrop'||!!s.motion,{message:'Drag requires relative start and end'}).refine(s=>s.event!=='scroll'||!!s.direction,{message:'Scroll requires direction'});

export const portableSchema=z.object({format:z.literal('lighthouse-recording'),version:z.literal(1),name:z.string().min(1).max(120),createdAt:z.number().finite(),steps:z.array(portableStepSchema).min(1).max(2000)}).strict();
export function mergeEvent(events:any[],row:any){const index=events.findIndex(e=>e.eventId===row.eventId);if(index<0)events.push({...row,enrichment:false});else if(row.enrichment&&row.capture?.postState)events[index]={...events[index],capture:{...events[index].capture,postState:row.capture.postState}};}
