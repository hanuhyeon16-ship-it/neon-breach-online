const express=require('express');
const http=require('http');
const fs=require('fs');
const path=require('path');
const {WebSocketServer,WebSocket}=require('ws');

const app=express();
app.use(express.static('public'));
app.get('/healthz',(_,res)=>res.status(200).send('ok'));
const server=http.createServer(app);
const wss=new WebSocketServer({server});
const PORT=process.env.PORT||10000;

const VERSION='V4.2';
const INPUT_HZ=60, INPUT_DT=1/INPUT_HZ, SIM_HZ=60, SIM_DT=1/SIM_HZ, SNAPSHOT_MS=50;
const PLAYER_R=20, WALK=330, DASH_SPEED=720, DASH_TIME=.40, DASH_CD=1.05;
const MAX_PLAYERS=8, MAX_SPECTATORS=4, RECONNECT_MS=30000, AFK_WARN_MS=45000, AFK_SPEC_MS=60000;

const WEAPONS={
 rifle:{name:'RIFLE',damage:24,head:1.55,fire:.105,mag:24,reserve:120,reload:1.25,spread:.014,moveSpread:.030,range:1350,pellets:1,recoil:1.0},
 smg:{name:'SMG',damage:16,head:1.45,fire:.065,mag:32,reserve:160,reload:1.05,spread:.030,moveSpread:.045,range:950,pellets:1,recoil:.72},
 shotgun:{name:'SHOTGUN',damage:12,head:1.25,fire:.68,mag:6,reserve:42,reload:1.45,spread:.155,moveSpread:.050,range:610,pellets:7,recoil:2.2},
 marksman:{name:'MARKSMAN',damage:54,head:1.65,fire:.62,mag:8,reserve:40,reload:1.55,spread:.004,moveSpread:.030,range:1750,pellets:1,recoil:2.6},
 lmg:{name:'LMG',damage:20,head:1.45,fire:.085,mag:50,reserve:150,reload:2.15,spread:.028,moveSpread:.050,range:1200,pellets:1,recoil:1.25}
};

const AGENTS={
 blitz:{
  name:'BLITZ',skill:'OVERDRIVE',cooldown:14,duration:4,
  short:'4s · MOVE +15% · FIRE RATE +18%',
  effect:'4초 동안 이동속도 +15%, 연사속도 약 +18%. 데미지는 증가하지 않습니다.'
 },
 ward:{
  name:'WARD',skill:'BARRIER',cooldown:16,duration:6,
  short:'6s · BLOCK MOVEMENT + BULLETS',
  effect:'정면에 6초 방벽 설치. 플레이어 이동과 총알을 막습니다. 추가 데미지는 없습니다.'
 },
 pulse:{
  name:'PULSE',skill:'SCAN',cooldown:17,duration:3,
  short:'3s · REVEAL THROUGH WALLS + SMOKE',
  effect:'3초 동안 적을 벽과 연막 너머에서도 노란 윤곽으로 공개합니다. 데미지 증가는 없습니다.'
 },
 mist:{
  name:'MIST',skill:'SMOKE',cooldown:15,duration:7,
  short:'7s · VISION BLOCK · BULLETS PASS',
  effect:'조준 위치에 7초 연막 생성. 양 팀의 시야를 차단하지만 총알은 통과합니다. SCAN은 연막을 무시합니다.'
 }
};

const MODES={
 tdm:{name:'TEAM DEATHMATCH',roundTime:110,target:25,rounds:3,respawn:true},
 control:{name:'CONTROL',roundTime:120,target:100,rounds:3,respawn:true},
 elim:{name:'ELIMINATION',roundTime:75,target:1,rounds:4,respawn:false}
};

const MAPS={
 longyard:{
  name:'LONG YARD',w:2200,h:2600,
  walls:[
   {x:0,y:1240,w:680,h:120},{x:1520,y:1240,w:680,h:120},
   {x:410,y:460,w:130,h:500},{x:1660,y:460,w:130,h:500},
   {x:410,y:1650,w:130,h:500},{x:1660,y:1650,w:130,h:500},
   {x:820,y:760,w:560,h:120},{x:820,y:1720,w:560,h:120},
   {x:870,y:1080,w:130,h:440},{x:1200,y:1080,w:130,h:440}
  ],
  blue:[{x:700,y:2200},{x:900,y:2200},{x:1100,y:2200},{x:1300,y:2200}],
  red:[{x:700,y:400},{x:900,y:400},{x:1100,y:400},{x:1300,y:400}],
  control:{x:1100,y:1300,r:175}
 },
 crossdock:{
  name:'CROSS DOCK',w:2200,h:2600,
  walls:[
   {x:160,y:530,w:520,h:120},{x:1520,y:530,w:520,h:120},
   {x:160,y:1950,w:520,h:120},{x:1520,y:1950,w:520,h:120},
   {x:780,y:260,w:120,h:610},{x:1300,y:260,w:120,h:610},
   {x:780,y:1730,w:120,h:610},{x:1300,y:1730,w:120,h:610},
   {x:380,y:1110,w:480,h:100},{x:1340,y:1110,w:480,h:100},
   {x:1010,y:940,w:180,h:720}
  ],
  blue:[{x:620,y:2280},{x:850,y:2280},{x:1120,y:2280},{x:1390,y:2280}],
  red:[{x:620,y:320},{x:850,y:320},{x:1120,y:320},{x:1390,y:320}],
  control:{x:1100,y:1300,r:165}
 },
 garden:{
  name:'ROOFTOP GARDEN',w:2200,h:2600,
  walls:[
   {x:250,y:560,w:300,h:100},{x:1650,y:560,w:300,h:100},
   {x:250,y:1940,w:300,h:100},{x:1650,y:1940,w:300,h:100},
   {x:650,y:850,w:260,h:110},{x:1290,y:850,w:260,h:110},
   {x:650,y:1640,w:260,h:110},{x:1290,y:1640,w:260,h:110},
   {x:980,y:1030,w:240,h:210},{x:980,y:1360,w:240,h:210},
   {x:150,y:1240,w:500,h:110},{x:1550,y:1240,w:500,h:110}
  ],
  blue:[{x:700,y:2260},{x:920,y:2260},{x:1140,y:2260},{x:1360,y:2260}],
  red:[{x:700,y:340},{x:920,y:340},{x:1140,y:340},{x:1360,y:340}],
  control:{x:1100,y:1300,r:185}
 }
};

const PROFILE_FILE=path.join(__dirname,'data','profiles.json');
let profiles={};
try{profiles=JSON.parse(fs.readFileSync(PROFILE_FILE,'utf8'))||{}}catch{profiles={}}
let saveTimer=null;
function saveProfiles(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{fs.mkdirSync(path.dirname(PROFILE_FILE),{recursive:true});fs.writeFileSync(PROFILE_FILE,JSON.stringify(profiles,null,2))}catch{}},250)}
function getProfile(token,name){if(!profiles[token])profiles[token]={name,wins:0,losses:0,kills:0,deaths:0,rating:1000,matches:0};profiles[token].name=name;return profiles[token]}
function tier(r){if(r>=1600)return'DIAMOND';if(r>=1400)return'PLATINUM';if(r>=1200)return'GOLD';if(r>=1000)return'SILVER';return'BRONZE'}

const rooms=new Map();let nextId=1,nextTracer=1;
function safeName(v){return String(v||'PLAYER').replace(/[^\p{L}\p{N}_\- ]/gu,'').trim().slice(0,14)||'PLAYER'}
function makeCode(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s;do{s='';for(let i=0;i<5;i++)s+=a[(Math.random()*a.length)|0]}while(rooms.has(s));return s}
function send(ws,o){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(o))}
function bc(room,o){const d=JSON.stringify(o);for(const p of room.players.values())if(p.connected&&p.ws?.readyState===WebSocket.OPEN)p.ws.send(d)}
function activePlayers(room){return [...room.players.values()].filter(p=>p.team==='blue'||p.team==='red')}
function teamPlayers(room,t){return activePlayers(room).filter(p=>p.team===t)}
function connectedCount(room){return [...room.players.values()].filter(p=>p.connected).length}
function teamIndex(room,p){return teamPlayers(room,p.team).sort((a,b)=>a.id-b.id).findIndex(q=>q.id===p.id)}
function mapOf(room){return MAPS[room.map]||MAPS.longyard}
function circleRect(x,y,r,w){const nx=Math.max(w.x,Math.min(x,w.x+w.w)),ny=Math.max(w.y,Math.min(y,w.y+w.h)),dx=x-nx,dy=y-ny;return dx*dx+dy*dy<r*r}
function dynamicRects(room){return room.barriers.map(b=>({x:b.x-b.w/2,y:b.y-b.h/2,w:b.w,h:b.h}))}
function blocked(room,x,y,r=PLAYER_R){const m=mapOf(room);if(x<r||x>m.w-r||y<r||y>m.h-r)return true;for(const w of m.walls)if(circleRect(x,y,r,w))return true;for(const w of dynamicRects(room))if(circleRect(x,y,r,w))return true;return false}
function moveSub(room,p,vx,vy,dt){const mx=vx*dt,my=vy*dt,steps=Math.max(1,Math.ceil(Math.max(Math.abs(mx),Math.abs(my))/4)),sx=mx/steps,sy=my/steps;for(let i=0;i<steps;i++){if(!blocked(room,p.x+sx,p.y,p.r))p.x+=sx;if(!blocked(room,p.x,p.y+sy,p.r))p.y+=sy}}
function rayRectDist(ox,oy,dx,dy,max,w){for(let d=0;d<=max;d+=7){const x=ox+dx*d,y=oy+dy*d;if(x>w.x&&x<w.x+w.w&&y>w.y&&y<w.y+w.h)return d}return Infinity}
function rayWallDistance(room,ox,oy,dx,dy,max){let best=Infinity;for(const w of mapOf(room).walls)best=Math.min(best,rayRectDist(ox,oy,dx,dy,max,w));for(const w of dynamicRects(room))best=Math.min(best,rayRectDist(ox,oy,dx,dy,max,w));return best}
function rayCircle(ox,oy,dx,dy,cx,cy,r,max){const lx=cx-ox,ly=cy-oy,t=lx*dx+ly*dy;if(t<0||t>max)return null;const px=ox+dx*t,py=oy+dy*t,perp=Math.hypot(px-cx,py-cy);if(perp>r)return null;const thc=Math.sqrt(Math.max(0,r*r-perp*perp));const hit=t-thc;return hit>=0?{dist:hit,perp}:null}
function historyPos(p,shotTime){if(!p.history?.length)return{x:p.x,y:p.y};let best=p.history[0],bd=Math.abs(best.t-shotTime);for(const h of p.history){const d=Math.abs(h.t-shotTime);if(d<bd){best=h;bd=d}}return{x:best.x,y:best.y}}
function spawn(room,p){
 const m=mapOf(room),arr=p.team==='blue'?m.blue:m.red,s=arr[Math.max(0,teamIndex(room,p))%arr.length];
 Object.assign(p,{
  x:s.x,y:s.y,hp:100,dead:false,respawn:0,respawnAt:0,
  reload:0,fireCD:0,dashCD:0,dashTime:0,dashX:0,dashY:0,
  inputX:0,inputY:0,barrierBuff:0,
  lastAction:Date.now(),afkWarned:false,afkGraceUntil:Date.now()+12000
 });
 const w=WEAPONS[p.weapon]||WEAPONS.rifle;p.ammo=w.mag;p.reserve=w.reserve;p.history=[];
}
function newPlayer(id,ws,m,team){const name=safeName(m.name),token=String(m.token||`guest-${id}-${Date.now()}`);const pr=getProfile(token,name);return{id,ws,connected:true,disconnectAt:0,token,name,team,ready:false,r:PLAYER_R,a:0,k:0,d:0,ack:0,weapon:WEAPONS[m.weapon]?m.weapon:'rifle',agent:AGENTS[m.agent]?m.agent:'blitz',skillCD:0,scanUntil:0,lastAction:Date.now(),afkWarned:false,ping:0,profile:pr,history:[],inputCredit:.12,respawnAt:0,afkGraceUntil:Date.now()+12000}}
function makeRoom(host){const room={code:makeCode(),host,phase:'lobby',players:new Map(),map:'longyard',mode:'tdm',blue:0,red:0,blueRounds:0,redRounds:0,time:MODES.tdm.roundTime,countdown:0,endTimer:0,controlBlue:0,controlRed:0,barriers:[],smokes:[],matchParticipants:new Set()};rooms.set(room.code,room);return room}
function profileView(p){const q=p.profile;return{wins:q.wins,losses:q.losses,kills:q.kills,deaths:q.deaths,rating:q.rating,tier:tier(q.rating),matches:q.matches}}
function snapshot(room){return{type:'state',version:VERSION,serverTime:Date.now(),room:{code:room.code,host:room.host,phase:room.phase,map:room.map,mode:room.mode,blue:room.blue,red:room.red,blueRounds:room.blueRounds,redRounds:room.redRounds,time:room.time,countdown:room.countdown,controlBlue:room.controlBlue,controlRed:room.controlRed},players:[...room.players.values()].map(p=>({id:p.id,name:p.name,team:p.team,ready:p.ready,connected:p.connected,x:p.x,y:p.y,a:p.a,hp:p.hp,ammo:p.ammo,reserve:p.reserve,reload:p.reload||0,dead:!!p.dead,respawn:p.dead&&p.respawnAt?Math.max(0,(p.respawnAt-Date.now())/1000):0,k:p.k,d:p.d,ack:p.ack,weapon:p.weapon,agent:p.agent,skillCD:p.skillCD,dashCD:p.dashCD,dashTime:p.dashTime,dashX:p.dashX,dashY:p.dashY,overdrive:p.overdrive||0,scan:p.scanUntil>Date.now(),ping:p.ping,profile:profileView(p)})),barriers:room.barriers.map(b=>({x:b.x,y:b.y,w:b.w,h:b.h,team:b.team,life:b.life})),smokes:room.smokes.map(s=>({x:s.x,y:s.y,r:s.r,life:s.life,team:s.team}))}}
function state(room){bc(room,snapshot(room))}
function eligibleReady(room){return activePlayers(room).filter(p=>p.connected)}
function tryStart(room){const ps=eligibleReady(room);if(room.phase!=='lobby'||ps.length<2||teamPlayers(room,'blue').filter(p=>p.connected).length<1||teamPlayers(room,'red').filter(p=>p.connected).length<1)return;if(ps.some(p=>!p.ready))return;room.phase='countdown';room.countdown=3;for(const p of activePlayers(room))spawn(room,p);room.matchParticipants=new Set(ps.map(p=>p.id));bc(room,{type:'event',event:'countdown'})}
function startRound(room){const md=MODES[room.mode];room.phase='playing';room.time=md.roundTime;room.blue=0;room.red=0;room.controlBlue=0;room.controlRed=0;room.barriers=[];room.smokes=[];for(const p of activePlayers(room)){p.k=0;p.d=0;p.skillCD=0;spawn(room,p)}bc(room,{type:'event',event:'round_start',mode:room.mode,map:room.map})}
function finishRound(room,winner){if(room.phase!=='playing')return;room.phase='round_end';room.endTimer=3.5;if(winner==='blue')room.blueRounds++;if(winner==='red')room.redRounds++;bc(room,{type:'event',event:'round_end',winner})}
function updateProfiles(room,winner){for(const id of room.matchParticipants){const p=room.players.get(id);if(!p)continue;const pr=p.profile;pr.matches++;pr.kills+=p.k;pr.deaths+=p.d;if(p.team===winner){pr.wins++;pr.rating=Math.min(2000,pr.rating+25)}else if(p.team==='blue'||p.team==='red'){pr.losses++;pr.rating=Math.max(600,pr.rating-20)}}saveProfiles()}
function finishMatch(room,winner){updateProfiles(room,winner);bc(room,{type:'event',event:'match_end',winner});room.phase='lobby';room.blueRounds=room.redRounds=room.blue=room.red=0;room.controlBlue=room.controlRed=0;for(const p of room.players.values()){p.ready=false;if(p.team==='blue'||p.team==='red')spawn(room,p)}}
function kill(room,t,a,headshot=false){
 t.dead=true;t.hp=0;t.respawn=2.5;t.respawnAt=Date.now()+2500;t.inputX=0;t.inputY=0;t.d++;
 if(a){a.k++;if(room.mode!=='control'){if(a.team==='blue')room.blue++;else room.red++}send(a.ws,{type:'hitconfirm',headshot,kill:true});bc(room,{type:'event',event:'kill',killer:a.name,victim:t.name,team:a.team,headshot})}
}
function useSkill(room,p,m){
 if(room.phase!=='playing'||p.dead||p.skillCD>0)return;
 const a=AGENTS[p.agent];if(!a)return;
 p.lastAction=Date.now();
 if(p.agent==='blitz'){
  p.skillCD=a.cooldown;p.overdrive=4;
  send(p.ws,{type:'event',event:'skill',skill:'overdrive',team:p.team});
 }else if(p.agent==='ward'){
  const x=p.x+Math.cos(p.a)*95,y=p.y+Math.sin(p.a)*95;
  if(blocked(room,x,y,18)){send(p.ws,{type:'error',message:'방벽을 설치할 공간이 부족합니다.'});return}
  p.skillCD=a.cooldown;
  room.barriers.push({x,y,w:120,h:28,team:p.team,life:6});
  bc(room,{type:'event',event:'skill_fx',skill:'barrier',x,y,team:p.team});
 }else if(p.agent==='pulse'){
  p.skillCD=a.cooldown;
  const until=Date.now()+3000;
  for(const q of room.players.values())if(q.team!==p.team&&q.team!=='spec')q.scanUntil=Math.max(q.scanUntil||0,until);
  bc(room,{type:'event',event:'skill_fx',skill:'scan',team:p.team});
 }else if(p.agent==='mist'){
  const tx=Number(m.x),ty=Number(m.y),dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy)||1,dist=Math.min(500,d);
  const x=p.x+dx/d*dist,y=p.y+dy/d*dist;
  if(blocked(room,x,y,10)){send(p.ws,{type:'error',message:'연막을 그 위치에 설치할 수 없습니다.'});return}
  p.skillCD=a.cooldown;
  room.smokes.push({x,y,r:185,team:p.team,life:7});
  bc(room,{type:'event',event:'skill_fx',skill:'smoke',x,y,team:p.team});
 }
}
function fire(room,p,m){const w=WEAPONS[p.weapon];if(room.phase!=='playing'||p.dead||p.reload>0||p.fireCD>0||p.ammo<=0||!w)return;const effectiveFire=w.fire*(p.overdrive>0?.85:1);p.fireCD=effectiveFire;p.ammo--;p.lastAction=Date.now();const now=Date.now(),rewind=Math.min(250,(p.ping||80)/2+60),shotTime=Math.max(now-rewind,Math.min(now,Number(m.ts)||now));const moving=Math.hypot(p.inputX,p.inputY)>.15;const spread=w.spread+(moving?w.moveSpread:0);const rays=[];let anyHead=false,anyHit=false;for(let pellet=0;pellet<w.pellets;pellet++){const ang=(Number(m.a)||p.a)+(Math.random()-.5)*spread*2,dx=Math.cos(ang),dy=Math.sin(ang);let max=w.range,wallDist=rayWallDistance(room,p.x,p.y,dx,dy,max),best=null,bestDist=wallDist;for(const t of room.players.values()){if(t.dead||t.team===p.team||t.team==='spec'||!t.connected)continue;const hp=historyPos(t,shotTime),hit=rayCircle(p.x,p.y,dx,dy,hp.x,hp.y,t.r,max);if(hit&&hit.dist<bestDist){best=t;bestDist=hit.dist;best={target:t,perp:hit.perp,dist:hit.dist}}}let endDist=Math.min(max,bestDist);let head=false;if(best){head=best.perp<=7;const dmg=Math.round(w.damage*(head?w.head:1));best.target.hp-=dmg;anyHit=true;anyHead=anyHead||head;if(best.target.hp<=0)kill(room,best.target,p,head);else send(p.ws,{type:'hitconfirm',headshot:head,kill:false})}rays.push({x1:p.x,y1:p.y,x2:p.x+dx*endDist,y2:p.y+dy*endDist,head})}bc(room,{type:'shot',id:nextTracer++,owner:p.id,team:p.team,weapon:p.weapon,rays})}
function processInput(room,p,m){
 if(room.phase!=='playing'||p.dead||p.team==='spec')return;
 const incomingSeq=Math.max(0,Number(m.seq)||0);
 if(incomingSeq<p.ack)return;
 p.ack=incomingSeq;
 let dx=Math.max(-1,Math.min(1,Number(m.dx)||0)),dy=Math.max(-1,Math.min(1,Number(m.dy)||0)),l=Math.hypot(dx,dy);
 if(l>1){dx/=l;dy/=l}
 p.inputX=dx;p.inputY=dy;p.a=Number(m.a)||0;
 if(Math.hypot(dx,dy)>.01){p.lastAction=Date.now();p.afkWarned=false}
 if(m.dash&&p.dashCD<=0){
  let xx=dx,yy=dy;
  if(Math.hypot(xx,yy)<.01){xx=Math.cos(p.a);yy=Math.sin(p.a)}
  l=Math.hypot(xx,yy)||1;
  p.dashX=xx/l;p.dashY=yy/l;p.dashTime=DASH_TIME;p.dashCD=DASH_CD;
  p.lastAction=Date.now();p.afkWarned=false;
 }
}
function simulatePlayer(room,p,dt){
 if(p.dead||p.team==='spec'||room.phase!=='playing')return;
 const speedMul=p.overdrive>0?1.15:1;
 let vx,vy;
 if(p.dashTime>0){
  p.dashTime=Math.max(0,p.dashTime-dt);
  vx=p.dashX*DASH_SPEED*speedMul;vy=p.dashY*DASH_SPEED*speedMul;
 }else{
  vx=p.inputX*WALK*speedMul;vy=p.inputY*WALK*speedMul;
 }
 moveSub(room,p,vx,vy,dt);
}
function tickRoom(room,dt){
 const now=Date.now();
 for(const p of room.players.values()){
  p.fireCD=Math.max(0,p.fireCD-dt);p.dashCD=Math.max(0,p.dashCD-dt);p.skillCD=Math.max(0,p.skillCD-dt);p.overdrive=Math.max(0,(p.overdrive||0)-dt);
  if(p.reload>0){p.reload-=dt;if(p.reload<=0){const w=WEAPONS[p.weapon],need=w.mag-p.ammo,take=Math.min(need,p.reserve);p.ammo+=take;p.reserve-=take}}
  if(p.team!=='spec'){p.history.push({t:now,x:p.x,y:p.y});while(p.history.length&&now-p.history[0].t>400)p.history.shift()}
  if(p.connected&&room.phase==='playing'&&p.team!=='spec'&&now>(p.afkGraceUntil||0)){
   if(now-p.lastAction>AFK_WARN_MS&&!p.afkWarned){p.afkWarned=true;send(p.ws,{type:'event',event:'afk_warning'})}
   if(now-p.lastAction>AFK_SPEC_MS){
    p.team='spec';p.dead=false;p.hp=100;p.respawn=0;p.respawnAt=0;p.inputX=0;p.inputY=0;p.ready=false;
    bc(room,{type:'event',event:'afk_spectate',name:p.name});
   }
  }
 }
 room.barriers.forEach(b=>b.life-=dt);room.barriers=room.barriers.filter(b=>b.life>0);room.smokes.forEach(s=>s.life-=dt);room.smokes=room.smokes.filter(s=>s.life>0);
 if(room.phase==='countdown'){room.countdown-=dt;if(room.countdown<=0)startRound(room);return}if(room.phase==='round_end'){room.endTimer-=dt;if(room.endTimer<=0){const need=MODES[room.mode].rounds;if(room.blueRounds>=need||room.redRounds>=need)finishMatch(room,room.blueRounds>room.redRounds?'blue':'red');else{room.phase='countdown';room.countdown=3;for(const p of activePlayers(room))spawn(room,p)}}return}if(room.phase!=='playing')return;
 room.time-=dt;const md=MODES[room.mode];
 for(const p of activePlayers(room)){
  if(p.dead&&md.respawn){
   p.respawn=p.respawnAt?Math.max(0,(p.respawnAt-now)/1000):0;
   if(!p.respawnAt||now>=p.respawnAt){spawn(room,p);continue}
  }
  if(!p.dead&&p.connected)simulatePlayer(room,p,dt);
 }
 if(room.mode==='control'){const z=mapOf(room).control;let b=0,r=0;for(const p of activePlayers(room)){if(p.dead||!p.connected)continue;if(Math.hypot(p.x-z.x,p.y-z.y)<=z.r){if(p.team==='blue')b++;else r++}}if(b>0&&r===0)room.controlBlue=Math.min(md.target,room.controlBlue+dt);if(r>0&&b===0)room.controlRed=Math.min(md.target,room.controlRed+dt);room.blue=Math.floor(room.controlBlue);room.red=Math.floor(room.controlRed)}
 if(room.mode==='elim'){const aliveB=teamPlayers(room,'blue').some(p=>p.connected&&!p.dead),aliveR=teamPlayers(room,'red').some(p=>p.connected&&!p.dead);if(!aliveB||!aliveR){finishRound(room,!aliveB&&!aliveR?'draw':aliveB?'blue':'red');return}}
 if(room.blue>=md.target||room.red>=md.target||room.time<=0){let w='draw';if(room.mode==='control'){w=room.controlBlue===room.controlRed?'draw':room.controlBlue>room.controlRed?'blue':'red'}else w=room.blue===room.red?'draw':room.blue>room.red?'blue':'red';finishRound(room,w)}
}
function removeExpired(){const now=Date.now();for(const room of rooms.values()){for(const [id,p] of room.players){if(!p.connected&&now-p.disconnectAt>RECONNECT_MS)room.players.delete(id)}if(room.players.size===0)rooms.delete(room.code);else if(!room.players.has(room.host)||!room.players.get(room.host).connected){const n=[...room.players.values()].find(p=>p.connected);if(n)room.host=n.id}}}

wss.on('connection',ws=>{const id=nextId++;let room=null,p=null;send(ws,{type:'hello',id,version:VERSION,weapons:WEAPONS,agents:AGENTS,modes:MODES,maps:MAPS});ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}
 if(m.type==='resume'&&!room){for(const r of rooms.values()){const found=[...r.players.values()].find(q=>q.token===String(m.token||'')&&!q.connected);if(found){room=r;p=found;const oldId=found.id;r.players.delete(oldId);p.id=id;p.ws=ws;p.connected=true;p.disconnectAt=0;r.players.set(id,p);if(r.host===oldId)r.host=id;if(r.matchParticipants?.has(oldId)){r.matchParticipants.delete(oldId);r.matchParticipants.add(id)}send(ws,{type:'joined',code:r.code,id,resumed:true});bc(r,{type:'event',event:'reconnected',name:p.name});state(r);return}}send(ws,{type:'resume_fail'});return}
 if(m.type==='create'&&!room){room=makeRoom(id);p=newPlayer(id,ws,m,'blue');room.players.set(id,p);spawn(room,p);send(ws,{type:'joined',code:room.code,id});state(room);return}
 if(m.type==='join'&&!room){const r=rooms.get(String(m.code||'').toUpperCase().trim());if(!r)return send(ws,{type:'error',message:'방 코드를 확인하세요.'});const playing=r.phase!=='lobby';const active=activePlayers(r).filter(q=>q.connected).length;if(!playing&&active>=MAX_PLAYERS)return send(ws,{type:'error',message:'플레이어 자리가 가득 찼습니다.'});const specs=[...r.players.values()].filter(q=>q.team==='spec'&&q.connected).length;if(playing&&specs>=MAX_SPECTATORS)return send(ws,{type:'error',message:'관전자 자리도 가득 찼습니다.'});room=r;let team='spec';if(!playing)team=teamPlayers(r,'blue').filter(q=>q.connected).length<=teamPlayers(r,'red').filter(q=>q.connected).length?'blue':'red';p=newPlayer(id,ws,m,team);room.players.set(id,p);if(team!=='spec')spawn(room,p);send(ws,{type:'joined',code:room.code,id,spectator:team==='spec'});state(room);return}
 if(!room||!p)return;
 if(m.type==='team'&&room.phase==='lobby'){const t=['blue','red','spec'].includes(m.team)?m.team:'spec';if(t==='spec'){p.team='spec';p.ready=false;p.dead=false;p.hp=100;p.respawn=0;p.respawnAt=0;p.inputX=0;p.inputY=0}else{const other=t==='blue'?'red':'blue',tc=teamPlayers(room,t).filter(q=>q.connected).length,oc=teamPlayers(room,other).filter(q=>q.connected).length;if(tc<4&&tc<=oc+1){p.team=t;p.ready=false;spawn(room,p)}else send(ws,{type:'error',message:'팀 밸런스 때문에 이동할 수 없습니다.'})}}
 if(m.type==='ready'&&room.phase==='lobby'&&p.team!=='spec'){p.ready=!!m.value;tryStart(room)}
 if(m.type==='start'&&room.host===p.id&&room.phase==='lobby'){for(const q of activePlayers(room).filter(q=>q.connected))q.ready=true;tryStart(room)}
 if(m.type==='select_map'&&room.host===p.id&&room.phase==='lobby'&&MAPS[m.map])room.map=m.map;
 if(m.type==='select_mode'&&room.host===p.id&&room.phase==='lobby'&&MODES[m.mode])room.mode=m.mode;
 if(m.type==='loadout'&&room.phase==='lobby'){if(WEAPONS[m.weapon])p.weapon=m.weapon;if(AGENTS[m.agent])p.agent=m.agent}
 if(m.type==='input'){processInput(room,p,m)}
 if(m.type==='shoot'){fire(room,p,m)}
 if(m.type==='reload'&&room.phase==='playing'&&!p.dead&&p.reload<=0){const w=WEAPONS[p.weapon];if(p.ammo<w.mag&&p.reserve>0){p.reload=w.reload;p.lastAction=Date.now()}}
 if(m.type==='skill')useSkill(room,p,m)
 if(m.type==='ping')send(ws,{type:'pong',ts:m.ts});if(m.type==='ping_report')p.ping=Math.max(0,Math.min(999,Number(m.ping)||0));
 });ws.on('close',()=>{if(!room||!p)return;p.connected=false;p.disconnectAt=Date.now();p.inputX=0;p.inputY=0;p.dashTime=0;bc(room,{type:'event',event:'disconnected',name:p.name});state(room)})});

setInterval(()=>{for(const r of rooms.values())tickRoom(r,SIM_DT);removeExpired()},1000/SIM_HZ);
setInterval(()=>{for(const r of rooms.values())state(r)},SNAPSHOT_MS);
server.listen(PORT,'0.0.0.0',()=>console.log(`NEON BREACH ${VERSION} on ${PORT}`));
