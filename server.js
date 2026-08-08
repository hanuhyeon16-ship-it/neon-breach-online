const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
app.use(express.static('public'));
app.get('/healthz', (_, res) => res.status(200).send('ok'));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 10000;

const MAP={w:2200,h:2600};
const R=20, WALK=330, DASH=720, DASH_TIME=.38, DASH_CD=1.05;
const DT=1/60, ROUND_TIME=90, ROUND_KILLS=15;
const walls=[
{x:0,y:1240,w:680,h:120},{x:1520,y:1240,w:680,h:120},
{x:410,y:460,w:130,h:500},{x:1660,y:460,w:130,h:500},
{x:410,y:1650,w:130,h:500},{x:1660,y:1650,w:130,h:500},
{x:820,y:760,w:560,h:120},{x:820,y:1720,w:560,h:120},
{x:870,y:1080,w:130,h:440},{x:1200,y:1080,w:130,h:440}
];
const blueSp=[{x:700,y:2200},{x:900,y:2200},{x:1100,y:2200},{x:1300,y:2200}];
const redSp=[{x:700,y:400},{x:900,y:400},{x:1100,y:400},{x:1300,y:400}];

const rooms=new Map(); let nextId=1,nextBullet=1;
function name(v){return String(v||'PLAYER').replace(/[^\p{L}\p{N}_\- ]/gu,'').trim().slice(0,14)||'PLAYER'}
function code(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s;do{s='';for(let i=0;i<5;i++)s+=a[(Math.random()*a.length)|0]}while(rooms.has(s));return s}
function send(ws,o){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(o))}
function bc(r,o){const d=JSON.stringify(o);for(const p of r.players.values())if(p.ws.readyState===WebSocket.OPEN)p.ws.send(d)}
function count(r,t){let n=0;for(const p of r.players.values())if(p.team===t)n++;return n}
function idx(r,p){return [...r.players.values()].filter(q=>q.team===p.team).sort((a,b)=>a.id-b.id).findIndex(q=>q.id===p.id)}
function spawn(r,p){const a=p.team==='blue'?blueSp:redSp,s=a[Math.max(0,idx(r,p))%4];Object.assign(p,{x:s.x,y:s.y,vx:0,vy:0,hp:100,ammo:24,reserve:120,dead:false,respawn:0,reload:0,fireCD:0,dashCD:0,dashTime:0,dashX:0,dashY:0,input:{dx:0,dy:0},a:p.a||0})}
function circleRect(x,y,r,w){const nx=Math.max(w.x,Math.min(x,w.x+w.w)),ny=Math.max(w.y,Math.min(y,w.y+w.h)),dx=x-nx,dy=y-ny;return dx*dx+dy*dy<r*r}
function blocked(x,y){if(x<R||x>MAP.w-R||y<R||y>MAP.h-R)return true;return walls.some(w=>circleRect(x,y,R,w))}
function move(p,vx,vy,dt){const mx=vx*dt,my=vy*dt,steps=Math.max(1,Math.ceil(Math.max(Math.abs(mx),Math.abs(my))/5)),sx=mx/steps,sy=my/steps;for(let i=0;i<steps;i++){if(!blocked(p.x+sx,p.y))p.x+=sx;else p.vx=0;if(!blocked(p.x,p.y+sy))p.y+=sy;else p.vy=0}}
function lineWall(x1,y1,x2,y2){const d=Math.hypot(x2-x1,y2-y1),n=Math.max(1,Math.ceil(d/8));for(let i=1;i<=n;i++){const t=i/n,x=x1+(x2-x1)*t,y=y1+(y2-y1)*t;for(const w of walls)if(x>w.x&&x<w.x+w.w&&y>w.y&&y<w.y+w.h)return true}return false}
function newRoom(host){const r={code:code(),host,phase:'lobby',players:new Map(),bullets:[],blue:0,red:0,blueRounds:0,redRounds:0,time:ROUND_TIME,countdown:0,end:0};rooms.set(r.code,r);return r}
function snap(r){return{type:'state',room:{code:r.code,host:r.host,phase:r.phase,blue:r.blue,red:r.red,blueRounds:r.blueRounds,redRounds:r.redRounds,time:r.time,countdown:r.countdown},players:[...r.players.values()].map(p=>({id:p.id,name:p.name,team:p.team,ready:p.ready,x:p.x,y:p.y,a:p.a,hp:p.hp,ammo:p.ammo,reserve:p.reserve,dead:p.dead,k:p.k,d:p.d})),bullets:r.bullets.map(b=>({id:b.id,x:b.x,y:b.y,team:b.team}))}}
function state(r){bc(r,snap(r))}
function tryStart(r){if(r.phase!=='lobby'||r.players.size<2||count(r,'blue')<1||count(r,'red')<1)return;if([...r.players.values()].some(p=>!p.ready))return;r.phase='countdown';r.countdown=3;for(const p of r.players.values())spawn(r,p)}
function begin(r){r.phase='playing';r.time=ROUND_TIME;r.blue=r.red=0;r.bullets=[];for(const p of r.players.values())spawn(r,p)}
function finish(r,w){if(r.phase!=='playing')return;r.phase='round_end';r.end=3.5;if(w==='blue')r.blueRounds++;if(w==='red')r.redRounds++;bc(r,{type:'event',event:'round_end',winner:w})}
function kill(r,t,a){t.dead=true;t.hp=0;t.respawn=2.5;t.d++;if(a){a.k++;if(a.team==='blue')r.blue++;else r.red++;bc(r,{type:'event',event:'kill',killer:a.name,victim:t.name,team:a.team})}}
function shoot(r,p,a){if(r.phase!=='playing'||p.dead||p.reload>0||p.fireCD>0||p.ammo<=0)return;p.fireCD=.105;p.ammo--;a+=(Math.random()-.5)*.018;r.bullets.push({id:nextBullet++,owner:p.id,team:p.team,x:p.x+Math.cos(a)*28,y:p.y+Math.sin(a)*28,vx:Math.cos(a)*1050,vy:Math.sin(a)*1050,life:1.35,damage:24})}
function tickPlayer(p){p.fireCD=Math.max(0,p.fireCD-DT);p.dashCD=Math.max(0,p.dashCD-DT);if(p.reload>0){p.reload-=DT;if(p.reload<=0){const need=24-p.ammo,take=Math.min(need,p.reserve);p.ammo+=take;p.reserve-=take}}if(p.dead){p.respawn-=DT;return}let vx,vy;if(p.dashTime>0){p.dashTime-=DT;vx=p.dashX*DASH;vy=p.dashY*DASH}else{vx=p.input.dx*WALK;vy=p.input.dy*WALK}p.vx=vx;p.vy=vy;move(p,vx,vy,DT)}
function tickBullets(r){for(const b of r.bullets){const ox=b.x,oy=b.y,nx=b.x+b.vx*DT,ny=b.y+b.vy*DT;if(lineWall(ox,oy,nx,ny)){b.life=0;continue}b.x=nx;b.y=ny;b.life-=DT;if(b.life<=0)continue;for(const t of r.players.values()){if(t.dead||t.team===b.team||t.id===b.owner)continue;if(Math.hypot(b.x-t.x,b.y-t.y)<R+6){b.life=0;t.hp-=b.damage;if(t.hp<=0)kill(r,t,r.players.get(b.owner));break}}}r.bullets=r.bullets.filter(b=>b.life>0&&b.x>0&&b.x<MAP.w&&b.y>0&&b.y<MAP.h)}
function tickRoom(r){if(r.phase==='countdown'){r.countdown-=DT;if(r.countdown<=0)begin(r);return}if(r.phase==='round_end'){r.end-=DT;if(r.end<=0){if(r.blueRounds>=3||r.redRounds>=3){bc(r,{type:'event',event:'match_end',winner:r.blueRounds>r.redRounds?'blue':'red'});r.phase='lobby';r.blueRounds=r.redRounds=0;for(const p of r.players.values()){p.ready=false;spawn(r,p)}}else{r.phase='countdown';r.countdown=3;for(const p of r.players.values())spawn(r,p)}}return}if(r.phase!=='playing')return;r.time-=DT;for(const p of r.players.values()){tickPlayer(p);if(p.dead&&p.respawn<=0)spawn(r,p)}tickBullets(r);if(r.blue>=ROUND_KILLS||r.red>=ROUND_KILLS||r.time<=0)finish(r,r.blue===r.red?'draw':r.blue>r.red?'blue':'red')}

wss.on('connection',ws=>{const id=nextId++;let room=null,p=null;send(ws,{type:'hello',id,map:MAP,walls});ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}
if(m.type==='create'&&!room){room=newRoom(id);p={id,ws,name:name(m.name),team:'blue',ready:false,r:R,a:0,k:0,d:0};room.players.set(id,p);spawn(room,p);send(ws,{type:'joined',code:room.code,id});state(room);return}
if(m.type==='join'&&!room){const r=rooms.get(String(m.code||'').toUpperCase().trim());if(!r)return send(ws,{type:'error',message:'방 코드를 확인하세요.'});if(r.players.size>=8)return send(ws,{type:'error',message:'방이 가득 찼습니다.'});if(r.phase!=='lobby')return send(ws,{type:'error',message:'이미 시작된 방입니다.'});room=r;p={id,ws,name:name(m.name),team:count(r,'blue')<=count(r,'red')?'blue':'red',ready:false,r:R,a:0,k:0,d:0};r.players.set(id,p);spawn(r,p);send(ws,{type:'joined',code:r.code,id});state(r);return}
if(!room||!p)return;
if(m.type==='team'&&room.phase==='lobby'){const t=m.team==='red'?'red':'blue';if(count(room,t)<4||p.team===t){p.team=t;p.ready=false;spawn(room,p)}}
if(m.type==='ready'&&room.phase==='lobby'){p.ready=!!m.value;tryStart(room)}
if(m.type==='start'&&room.phase==='lobby'&&room.host===id){for(const q of room.players.values())q.ready=true;tryStart(room)}
if(m.type==='input'&&room.phase==='playing'&&!p.dead){let dx=Math.max(-1,Math.min(1,Number(m.dx)||0)),dy=Math.max(-1,Math.min(1,Number(m.dy)||0));const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l}p.input.dx=dx;p.input.dy=dy;p.a=Number(m.a)||0;if(m.dash&&p.dashCD<=0){let qx=dx,qy=dy;if(Math.hypot(qx,qy)<.01){qx=Math.cos(p.a);qy=Math.sin(p.a)}const ql=Math.hypot(qx,qy)||1;p.dashX=qx/ql;p.dashY=qy/ql;p.dashTime=DASH_TIME;p.dashCD=DASH_CD}}
if(m.type==='shoot')shoot(room,p,Number(m.a)||0);
if(m.type==='reload'&&room.phase==='playing'&&!p.dead&&p.reload<=0&&p.ammo<24&&p.reserve>0)p.reload=1.15;
if(m.type==='ping')send(ws,{type:'pong',ts:m.ts});
});ws.on('close',()=>{if(!room)return;room.players.delete(id);if(room.players.size===0)rooms.delete(room.code);else{if(room.host===id)room.host=[...room.players.keys()][0];state(room)}})});

setInterval(()=>{for(const r of rooms.values())tickRoom(r)},1000/60);
setInterval(()=>{for(const r of rooms.values())state(r)},50);
server.listen(PORT,'0.0.0.0',()=>console.log('NEON BREACH NETCODE v2 on',PORT));
