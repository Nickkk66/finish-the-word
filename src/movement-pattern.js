// Conservative server-side evidence: many precisely repeated paths AND cadence,
// never a stationary packet, held key, a short rhythm, or a touch joystick.
const quantize=(n,scale)=>Math.round(n*scale);
export function observeMovement(player,pos,now){
 if(player.inputDevice!=='desktop')return false;
 const key=[quantize(pos.x,100),quantize(pos.y,50),quantize(pos.z,100),quantize(pos.ry,100),pos.anim].join(':');
 const watch=player.movementWatch??={samples:[],since:null,lastMatch:0};
 if(watch.samples.at(-1)?.key===key)return false;
 const previous=watch.samples.at(-1),dt=previous?now-previous.at:0;
 if(dt>2500){watch.samples=[];watch.since=null;}
 watch.samples.push({key,dt,at:now});if(watch.samples.length>200)watch.samples.shift();
 const samples=watch.samples,n=samples.length;
 let period=0;
 for(let size=8;size<=48&&size*4<=n;size++){
  const start=n-size*4,cycle=samples.slice(n-size);
  if(samples[n-1].at-samples[n-size].at<1000||new Set(cycle.map(s=>s.key)).size<4)continue;
  let matches=true;
  for(let i=start+size;i<n;i++){
   const a=samples[i],b=samples[i-size];
   if(a.key!==b.key||Math.abs(a.dt-b.dt)>40){matches=false;break;}
  }
  if(matches){period=size;break;}
 }
 if(!period){if(now-watch.lastMatch>2500)watch.since=null;return false;}
 watch.lastMatch=now;watch.since??=now;
 return now-watch.since>=60000;
}
