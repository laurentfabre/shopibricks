import type {ChannelId,ProfileId} from './experience';

export type QuerySignal={id:string;text:string;profile?:ProfileId;channel:ChannelId|'chatgpt'|'mcp';provenance?:'shopper_prompt'|'tool_search';budget?:number;at?:number;observed?:{recommended:boolean;draft:boolean;gap:boolean;failed:boolean}};
export type MatchStatus='matched'|'uncovered'|'budget'|'stock';
export type ProductMatch={id:string;score:number;terms:string[]};
export type AtlasQuery=QuerySignal&{cluster:string;matches:ProductMatch[];status:MatchStatus;reason:string};
export type IntentCluster={id:string;label:string;keywords:string[];count:number;matched:number;gaps:number;productIds:string[]};
export type AtlasData={source:'examples'|'activity';sourceLabel:string;as_of:string;latest_at:string|null;period:string;truncated:boolean;queries:AtlasQuery[];clusters:IntentCluster[];summary:{queries:number;clusters:number;matched:number;gaps:number;products:number};method:string};

const groups:Array<{profile:ProfileId;channel:ChannelId;queries:string[]}>=([
 {profile:'camille',channel:'travel',queries:[
  'A lightweight bag for a Paris weekend under €80','A travel tote for the train and a market morning','Recycled travel bag with a zipped pocket','Pack a small bag for a three day city break','A waterproof travel speaker for a weekend away','A leakproof bottle for long train journeys','Travel charger for a phone and laptop under €60','A compact weekend bag with room for everyday essentials','A light travel kit for exploring Paris under €150','Small travel accessories for a train journey','A recycled daypack for a weekend away','A city break bag with a safe pocket for valuables',
 ]},
 {profile:'alex',channel:'storefront',queries:[
  'Noise cancelling headphones for focused work under €150','Quiet audio for calls in a busy office','A laptop backpack for my daily commute','A compact USB-C charger for a laptop and phone','Workday essentials for a flexible office under €200','Headphones with long battery life for working on a train','A padded laptop bag with a hidden commuter pocket','Desk notebook for work notes and daily planning','Two USB-C ports for my work devices','Comfortable audio for work calls and deep focus','A compact charger to keep in my laptop bag','An everyday work backpack made with recycled fabric',
 ]},
 {profile:'lea',channel:'gifting',queries:[
  'A thoughtful notebook gift for someone who sketches','A small creative gift set under €70','A scarf gift for a friend who loves warm earth tones','A useful design gift under €50','A premium paper notebook for a birthday gift','A watch gift with a minimal design under €100','Gift ideas for a friend who loves everyday accessories','A recycled canvas tote as a practical birthday gift','A beautifully simple notebook gift under €25','A soft scarf gift for cooler evenings','A thoughtful stationery gift for a creative friend','A practical gift for someone who loves good design under €100',
 ]},
 {profile:'noor',channel:'travel',queries:[
  'A compact camera for street photography under €200','A photography kit for city walks under €300','A camera with USB-C charging for everyday memories','A notebook for sketching and creative ideas','A pocket camera with a tactile analogue design','Photography essentials for a weekend in Paris','A camera and notebook for a creative city project','Capture travel memories with a small digital camera','A 24MP camera that fits in a day bag','A notebook for photography notes and shot planning','A camera for creative walks and everyday photos','A compact photography setup under €250',
 ]},
 {profile:'camille',channel:'storefront',queries:[
  'Wireless earbuds with a pocket charging case','Compare wireless headphones and earbuds for music','A portable speaker for sharing music outdoors','Audio with long battery life for a weekend away','Wireless earbuds for clear calls under €100','A waterproof speaker with a carry loop','Headphones with adaptive noise cancellation','Balanced sound in small wireless earbuds','A warm sounding Bluetooth speaker under €70','Wireless audio under €40','A music companion with forty hour battery life','Over-ear headphones for music and train journeys',
 ]},
 {profile:'alex',channel:'travel',queries:[
  'Trail running shoes for muddy mountain paths','Waterproof hiking shoes under €150','An ergonomic office chair for my desk','A desktop monitor for a home workspace','A running vest for a long trail race','A lightweight tent for a mountain weekend','A pair of running shoes with good grip','A full size keyboard for my office setup','A comfortable sofa for a small apartment','A trail running watch with GPS navigation','A hiking jacket for wet weather under €200','A desk chair with adjustable lumbar support',
 ]},
]);

/** Explicitly fictional, read-only corpus. No events, sales or conversations are fabricated in storage. */
export function exampleQueries():QuerySignal[]{
 return groups.flatMap((group,g)=>group.queries.map((text,i)=>({id:`example-${g}-${i}`,text,profile:group.profile,channel:group.channel})));
}
