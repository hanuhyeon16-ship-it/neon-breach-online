const express = require("express");
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("crypto");

const app = express();
app.use(express.static("public"));
app.get("/healthz", (_, res) => res.status(200).send("ok"));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 10000;
const MAP = { w: 2200, h: 2600 };
const MAX = 8;
const rooms = new Map();
let nextId = 1;

const blueSpawns=[{x:720,y:2210},{x:930,y:2210},{x:1140,y:2210},{x:1350,y:2210}];
const redSpawns=[{x:720,y:360},{x:930,y:360},{x:1140,y:360},{x:1350,y:360}];

const walls=[
 {x:0,y:1240,w:680,h:120},{x:1520,y:1240,w:680,h:120},
 {x:410,y:460,w:130,h:500},{x:1660,y:460,w:130,h:500},
 {x:410,y:1650,w:130,h:500},{x:1660,y:1650,w:130,h:500},
 {x:820,y:760,w:560,h:120},{x:820,y:1720,w:560,h:120},
 {x:870,y:1080,w:130,h:440},{x:1200,y:1080,w:130,h:440}
];

function safeName(v){return String(v||"PLAYER").replace(/[^\p{L}\p{N}_\- ]/gu,"").slice(0,14)||"PLAYER"}
function code(){
 const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
 let s; do{s="";for(let i=0;i<5;i++)s+=chars[Math.floor(Math.random()*chars.length)]}while(rooms.has(s));
 return s;
}
function send(ws,o){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(o))}
function count(room,team){return [...room.players.values()].filter(p=>p.team===team).length}
function spawn(room,p){
 const arr=p.team==="blue"?blueSpawns:redSpawns;
 const idx=[...room.players.values()].filter(q=>q.team===p.team).sort((a,b)=>a.id-b.id).findIndex(q=>q.id===p.id);
 const s=arr[Math.max(0,idx)%4];p.x=s.x;p.y=s.y;p.hp=100;p.ammo=24;p.dead=false;p.respawn=0;
}
function snapshot(room){
 return {
  type:"state",
  room:{code:room.code,phase:room.phase,blue:room.blue,red:room.red,blueRounds:room.blueRounds,redRounds:room.redRounds,time:room.time,countdown:room.countdown},
  players:[...room.players.values()].map(p=>({id:p.id,name:p.name,team:p.team,ready:p.ready,x:p.x,y:p.y,a:p.a,hp:p.hp,ammo:p.ammo,dead:p.dead,k:p.k,d:p.d}))
 };
}
function broadcast(room,o=snapshot(room)){for(const p of room.players.values())send(p.ws,o)}
function newRoom(host){
 const r={code:code(),host,phase:"lobby",players:new Map(),blue:0,red:0,blueRounds:0,redRounds:0,time:90,countdown:0};
 rooms.set(r.code,r);return r;
}
function tryStart(r){
 if(r.phase!=="lobby"||r.players.size<2)return;
 if(count(r,"blue")===0||count(r,"red")===0)return;
 if([...r.players.values()].some(p=>!p.ready))return;
 r.phase="countdown";r.countdown=3;for(const p of r.players.values())spawn(r,p);broadcast(r);
}
function hitRoom(r,attacker,targetId,damage){
 const t=r.players.get(targetId);
 if(!t||t.dead||t.team===attacker.team||r.phase!=="playing")return;
 t.hp-=Math.min(35,Math.max(1,damage||22));
 if(t.hp<=0){
  t.hp=0;t.dead=true;t.respawn=2.4;t.d++;
  attacker.k++;
  if(attacker.team==="blue")r.blue++;else r.red++;
  broadcast(r,{type:"kill",killer:attacker.name,victim:t.name,team:attacker.team});
 }
}
wss.on("connection",ws=>{
 const id=nextId++;
 let room=null,p=null;
 send(ws,{type:"hello",id,map:MAP,walls});
 ws.on("message",raw=>{
  let m;try{m=JSON.parse(raw)}catch{return}
  if(m.type==="create"&&!room){
   room=newRoom(id);
   p={id,ws,name:safeName(m.name),team:"blue",ready:false,x:1000,y:2400,a:0,hp:100,ammo:24,dead:false,respawn:0,k:0,d:0,lastMove:Date.now(),lastShot:0};
   room.players.set(id,p);send(ws,{type:"joined",code:room.code,id});broadcast(room);return;
  }
  if(m.type==="join"&&!room){
   const r=rooms.get(String(m.code||"").toUpperCase());
   if(!r)return send(ws,{type:"error",message:"방 코드를 확인하세요."});
   if(r.players.size>=MAX)return send(ws,{type:"error",message:"방이 가득 찼습니다."});
   if(r.phase!=="lobby")return send(ws,{type:"error",message:"이미 시작된 게임입니다."});
   room=r;const team=count(r,"blue")<=count(r,"red")?"blue":"red";
   p={id,ws,name:safeName(m.name),team,ready:false,x:1000,y:2400,a:0,hp:100,ammo:24,dead:false,respawn:0,k:0,d:0,lastMove:Date.now(),lastShot:0};
   room.players.set(id,p);send(ws,{type:"joined",code:room.code,id});broadcast(room);return;
  }
  if(!room||!p)return;
  if(m.type==="team"&&room.phase==="lobby"){
   const t=m.team==="red"?"red":"blue";if(count(room,t)<4||p.team===t){p.team=t;p.ready=false;}broadcast(room);
  }
  if(m.type==="ready"&&room.phase==="lobby"){p.ready=!!m.value;broadcast(room);tryStart(room)}
  if(m.type==="start"&&room.host===id&&room.phase==="lobby"){for(const q of room.players.values())q.ready=true;tryStart(room)}
  if(m.type==="move"&&room.phase==="playing"&&!p.dead){
   const now=Date.now(),dt=Math.max(.001,Math.min(.12,(now-p.lastMove)/1000));p.lastMove=now;
   const ox=p.x,oy=p.y,nx=Number(m.x),ny=Number(m.y);
   const maxSpeed=m.dash?850:420;
   if(Number.isFinite(nx)&&Number.isFinite(ny)&&Math.hypot(nx-ox,ny-oy)<=maxSpeed*dt+45){p.x=Math.max(20,Math.min(MAP.w-20,nx));p.y=Math.max(20,Math.min(MAP.h-20,ny))}
   p.a=Number(m.a)||0;
  }
  if(m.type==="shoot"&&room.phase==="playing"&&!p.dead){
   const now=Date.now();if(now-p.lastShot<85||p.ammo<=0)return;p.lastShot=now;p.ammo--;
   broadcast(room,{type:"shot",owner:id,team:p.team,x:p.x,y:p.y,a:Number(m.a)||0});
  }
  if(m.type==="hit")hitRoom(room,p,Number(m.target),Number(m.damage));
  if(m.type==="reload"&&room.phase==="playing"&&!p.dead)p.ammo=24;
  if(m.type==="ping")send(ws,{type:"pong",ts:m.ts});
 });
 ws.on("close",()=>{
  if(!room)return;room.players.delete(id);
  if(room.players.size===0)rooms.delete(room.code);
  else{if(room.host===id)room.host=[...room.players.keys()][0];broadcast(room)}
 });
});

setInterval(()=>{
 for(const r of rooms.values()){
  if(r.phase==="countdown"){r.countdown-=.1;if(r.countdown<=0){r.phase="playing";r.time=90;r.blue=0;r.red=0;for(const p of r.players.values())spawn(r,p)}}
  else if(r.phase==="playing"){
   r.time-=.1;
   for(const p of r.players.values())if(p.dead){p.respawn-=.1;if(p.respawn<=0)spawn(r,p)}
   if(r.blue>=15||r.red>=15||r.time<=0){
    const win=r.blue===r.red?"draw":r.blue>r.red?"blue":"red";
    if(win==="blue")r.blueRounds++;if(win==="red")r.redRounds++;
    broadcast(r,{type:"roundEnd",winner:win});
    if(r.blueRounds>=3||r.redRounds>=3){broadcast(r,{type:"matchEnd",winner:r.blueRounds>r.redRounds?"blue":"red"});r.phase="lobby";r.blueRounds=r.redRounds=0;for(const p of r.players.values())p.ready=false}
    else{r.phase="countdown";r.countdown=4;for(const p of r.players.values())spawn(r,p)}
   }
  }
  broadcast(r);
 }
},100);

setInterval(()=>{
 for(const ws of wss.clients){
  if(ws.isAlive===false){ws.terminate();continue}
  ws.isAlive=false;ws.ping();
 }
},30000);
wss.on("connection",ws=>{ws.isAlive=true;ws.on("pong",()=>ws.isAlive=true)});

server.listen(PORT,"0.0.0.0",()=>console.log("NEON BREACH listening on",PORT));
