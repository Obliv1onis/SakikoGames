/* Pure game simulation. Browser rendering and input live in game.js. */
(function(root){
'use strict';
const W=1600,H=900,FLOOR=766;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function segmentRect(x1,y1,x2,y2,r){
 let lo=0,hi=1;
 for(const [p,d,min,max] of [[x1,x2-x1,r.x,r.x+r.w],[y1,y2-y1,r.y,r.y+r.h]]){
  if(Math.abs(d)<1e-8){if(p<min||p>max)return false;continue;}
  let a=(min-p)/d,b=(max-p)/d;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return false;
 }
 return true;
}
class GameModel{
 constructor(random=Math.random){this.random=random;this.reset();}
 reset(){this.time=0;this.hp=3;this.bonus=0;this.dodges=0;this.wave=1;this.over=false;this.nextThrow=1.5;this.serial=0;this.attack=0;this.attackBag=[];this.lastAttack=null;this.frenzy=false;this.frenzyUntil=0;this.restUntil=0;this.nextFrenzy=22+this.random()*8;this.warnings=[];this.bottles=[];this.events=[];this.player={x:820,y:FLOOR,vx:0,vy:0,facing:1,invincible:0,dash:0,cooldown:0};}
 get score(){return Math.floor(this.time*10+this.bonus);}
 // Shuffle bags guarantee variety without a predictable repeating sequence.
 pickAttack(){
  if(!this.attackBag.length){
   this.attackBag=['aimed','lob','roller','burst','bounce','fan','sweep','doubleLob','cross','changeup'];
   for(let i=this.attackBag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.attackBag[i],this.attackBag[j]]=[this.attackBag[j],this.attackBag[i]];}
   if(this.attackBag.at(-1)===this.lastAttack)this.attackBag.reverse();
  }
  return this.lastAttack=this.attackBag.pop();
 }
 warn(forcedKind){
  const kind=forcedKind||this.pickAttack();this.attack++;
  const target=clamp(this.player.x+(this.random()-.5)*220,330,W-130);
  const intensity=this.frenzy?1.2:1;
  const warning=this.frenzy?.65:.9+this.random()*.2;
  const baseFlight=Math.max(.85,1.25-this.wave*.02)/intensity;
  const add=(x,delay=0,flight=baseFlight,extra={})=>this.warnings.push({
   x:clamp(x,280,W-70),t:warning+delay,flight,kind,id:++this.serial,...extra
  });
  switch(kind){
   case 'burst':for(let i=0;i<3;i++)add(target+(i-1)*100,i*.19);break;
   case 'fan':for(let i=-1;i<=1;i++)add(target+i*190,0,baseFlight+i*.08);break;
   case 'sweep':{
    const direction=this.random()<.5?1:-1;
    for(let i=0;i<4;i++)add(target+(i-1.5)*direction*155,i*.2);
    break;
   }
   case 'doubleLob':add(target-140,0,1.85);add(target+140,.32,1.55);break;
   case 'cross':add(target-180,0,1.65);add(target+130,.28,.85);break;
   case 'changeup':add(target,0,1.9);add(target+80,.55,.85);break;
   case 'lob':add(target,0,1.7+this.random()*.35);break;
   case 'roller':add(target,0,baseFlight,{speed:620+this.random()*200});break;
   default:add(target);
  }
 }
 launch(w){
  const rolling=w.kind==='roller',x=175,y=rolling?FLOOR-32:455,t=w.flight;
  this.bottles.push({x,y,px:x,py:y,
   vx:rolling?(w.speed||680)* (this.frenzy?1.18:1):(w.x-x)/t,
   vy:rolling?0:(FLOOR-20-y-450*t*t)/t,
   gravity:rolling?0:900,kind:w.kind,bounces:0,
   angle:0,spin:rolling?15:5+this.random()*6,id:w.id,near:false});
  this.events.push({type:'throw',x,y});
 }
 step(dt,input={}){
  if(this.over)return;dt=clamp(dt,0,.05);this.events=[];this.time+=dt;
  const wave=1+Math.floor(this.time/20);if(wave!==this.wave){this.wave=wave;this.events.push({type:'wave',wave});}
  const p=this.player;p.invincible=Math.max(0,p.invincible-dt);p.cooldown=Math.max(0,p.cooldown-dt);p.dash=Math.max(0,p.dash-dt);
  const direction=(input.right?1:0)-(input.left?1:0);if(direction)p.facing=direction;
  if(input.jump&&p.y>=FLOOR-.5){p.vy=-810;this.events.push({type:'jump',x:p.x,y:p.y});}
  if(input.dash&&p.cooldown===0){p.dash=.18;p.cooldown=1.65;this.events.push({type:'dash',x:p.x,y:p.y});}
  const target=p.dash>0?p.facing*1050:direction*520;
  p.vx+=clamp(target-p.vx,-4200*dt,4200*dt);p.x=clamp(p.x+p.vx*dt,245,W-55);
  p.vy+=2100*dt;p.y=Math.min(FLOOR,p.y+p.vy*dt);if(p.y===FLOOR)p.vy=0;
  // Short, unlabelled pressure windows separated by a recovery interval.
  if(this.frenzy&&this.time>=this.frenzyUntil){
   this.frenzy=false;this.restUntil=this.time+3;
   this.nextFrenzy=this.time+20+this.random()*12;
   this.nextThrow=Math.max(this.nextThrow,3);
  }else if(!this.frenzy&&this.time>=this.nextFrenzy){
   this.frenzy=true;this.frenzyUntil=this.time+7+this.random()*3;
   this.nextThrow=Math.min(this.nextThrow,.15);
  }
  this.nextThrow-=dt;
  if(this.nextThrow<=0&&this.time>=this.restUntil){
   // Keep the simulation bounded even during overlapping volleys.
   if(this.bottles.length+this.warnings.length<22)this.warn();
   this.nextThrow=this.frenzy?.42+this.random()*.25:Math.max(1.25,2.2-this.wave*.07)+this.random()*.75;
  }
  for(const w of this.warnings)w.t-=dt;
  const ready=this.warnings.filter(w=>w.t<=0);this.warnings=this.warnings.filter(w=>w.t>0);ready.forEach(w=>this.launch(w));
  const rect={x:p.x-24,y:p.y-137,w:48,h:130};const remaining=[];
  for(const b of this.bottles){
   b.px=b.x;b.py=b.y;b.vy+=(b.gravity??900)*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.angle+=b.spin*dt;
   if(Math.hypot(b.x-p.x,b.y-(p.y-75))<140)b.near=true;
   const hit=segmentRect(b.px,b.py,b.x,b.y,{x:rect.x-10,y:rect.y-10,w:rect.w+20,h:rect.h+20});
   if(hit&&p.dash<=0&&p.invincible<=0){this.hp--;p.invincible=1.55;this.events.push({type:'hit',x:p.x,y:p.y-70});this.events.push({type:'break',x:b.x,y:b.y});if(this.hp<=0){this.over=true;this.events.push({type:'over'});}continue;}
   if(b.kind==='bounce'&&b.bounces===0&&b.y>=FLOOR-24){
    b.y=FLOOR-25;b.vy=-510;b.bounces=1;
    this.events.push({type:'bounce',x:b.x,y:b.y});
   }
   if((b.kind!=='roller'&&b.y>=FLOOR-9)||b.x>W+60||b.x<0){this.dodges++;this.bonus+=b.near?50:20;this.events.push({type:'break',x:b.x,y:Math.min(b.y,FLOOR-10)});if(b.near)this.events.push({type:'near',x:p.x,y:p.y-180});continue;}
   remaining.push(b);
  }
  this.bottles=remaining;
 }
}
const api={GameModel,segmentRect,W,H,FLOOR};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SakikoEngine=api;
})(typeof window!=='undefined'?window:globalThis);
