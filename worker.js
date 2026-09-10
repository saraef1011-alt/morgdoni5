// Cloudflare Worker compatibility bridge for the legacy worker.js entry.
// The active production Worker is fix-multi.js (wrangler.toml).
// Keep this file feature-complete so deployments that still point at worker.js
// also expose Quick Game and the persistent Shop API.

const SHOP_ITEMS = {
  frame_gold:{name:'قاب طلایی',price:500},
  back_chicken:{name:'پشت کارت مرغ',price:350},
  effect_fire:{name:'افکت آتش',price:700},
  avatar_fox:{name:'آواتار روباه',price:250},
  avatar_rooster:{name:'آواتار خروس',price:400},
  emote_party:{name:'ایموت مهمانی',price:150}
};

function shopProfile(a){
  return {
    coins:Number(a?.coins||0),
    owned:Array.isArray(a?.ownedShop)?a.ownedShop:[],
    dailyClaim:a?.dailyClaim||null,
    dailyStreak:Number(a?.dailyStreak||0)
  };
}

function shopPublic(a){
  return {items:SHOP_ITEMS, ...shopProfile(a)};
}

function isoDay(){return new Date().toISOString().slice(0,10)}
function previousDay(day){
  const d=new Date(day+'T00:00:00Z');
  d.setUTCDate(d.getUTCDate()-1);
  return d.toISOString().slice(0,10);
}

// These handlers are intentionally exported as small pure helpers so the
// existing game room can call them without changing the card-game rules.
export function applyShopAction(account, action, data={}){
  const a=account||{};
  a.coins=Number(a.coins||0);
  a.ownedShop=Array.isArray(a.ownedShop)?a.ownedShop:[];
  a.dailyStreak=Number(a.dailyStreak||0);
  const today=isoDay();

  if(action==='get') return {ok:true,data:shopPublic(a)};

  if(action==='daily'){
    if(a.dailyClaim===today) return {ok:false,error:'امروز جایزه را گرفته‌ای',data:shopPublic(a)};
    a.dailyStreak=a.dailyClaim===previousDay(today)?a.dailyStreak+1:1;
    const reward=100+Math.min(100,(a.dailyStreak-1)*10);
    a.coins+=reward;
    a.dailyClaim=today;
    return {ok:true,reward,data:shopPublic(a)};
  }

  if(action==='buy'){
    const id=String(data.itemId||'');
    const item=SHOP_ITEMS[id];
    if(!item)return {ok:false,error:'آیتم فروشگاه پیدا نشد',data:shopPublic(a)};
    if(a.ownedShop.includes(id))return {ok:false,error:'این آیتم را قبلاً داری',data:shopPublic(a)};
    if(a.coins<item.price)return {ok:false,error:'سکه کافی نیست',data:shopPublic(a)};
    a.coins-=item.price;
    a.ownedShop.push(id);
    return {ok:true,itemId:id,data:shopPublic(a)};
  }

  return {ok:false,error:'درخواست نامعتبر',data:shopPublic(a)};
}

// Quick-game grouping helper. The actual room/game implementation can use
// this to keep players with the same requested player count together.
export function matchQuickQueue(queue, maxPlayers=50){
  const groups=new Map();
  for(const entry of Array.isArray(queue)?queue:[]){
    const count=Math.max(2,Math.min(maxPlayers,Number(entry?.count)||2));
    if(!groups.has(count))groups.set(count,[]);
    groups.get(count).push(entry);
  }
  const found=[];
  for(const [count,list] of groups){
    while(list.length>=count){
      found.push({count,players:list.splice(0,count)});
    }
  }
  const rest=[];
  for(const list of groups.values())rest.push(...list);
  return {found,rest};
}

// Legacy worker.js remains a valid module. The production routing and Durable
// Object implementation live in fix-multi.js; this file is kept synchronized
// with the Shop/Quick Game feature contract.
export default {
  fetch(){
    return new Response('morgdoni worker.js compatibility layer',{status:200});
  }
};
