import { IDLE_MS, MIN_IDLE_MS, PRESENCE_REPLY_MS } from '../public/js/shared/presence.js';
const PLAY_PHASES=new Set(['choosing','typing','cardReveal','roulette','rouletteReveal','tideAnswer']);
const CINEMATICS=new Set(['roundEnd','tideIntro','tideReveal','tideFlood','tideResolve','ended']);
export const presenceMethods = {
 presenceDelay(){const value=new Uint32Array(1);this.crypto.getRandomValues(value);return MIN_IDLE_MS+value[0]%(IDLE_MS-MIN_IDLE_MS+1);},
 resetPresenceIdle(player,meaningful=true){
  player.lastMeaningfulAt??=player.lastActivityAt;
  if(meaningful)player.lastMeaningfulAt=this.now();
  player.lastActivityAt=this.now();player.idleCheckAt=Math.min(this.now()+this.presenceDelay(),player.lastMeaningfulAt+IDLE_MS);player.needsPresence=false;
 },
 presenceBusy(player){
  const part=this.participant(player.id),phase=this.match.phase;
  return !!part&&(part.alive&&PLAY_PHASES.has(phase)||CINEMATICS.has(phase));
 },
 refreshPresencePhase(){
  for(const p of this.players.values()){
   if(p.isBot)continue;
   if(this.presenceBusy(p)&&p.presence&&!p.presence.pausedAt){
    p.presence.remaining=Math.max(0,p.presence.endsAt-this.now());p.presence.pausedAt=this.now();p.needsPresence=true;
    this.send(p,{t:'presencePaused',token:p.presence.token});this.armPresence(p);
   }else if(!this.presenceBusy(p)&&(p.presence?.pausedAt||p.needsPresence)){
    if(p.presence?.pausedAt){p.presence.endsAt=this.now()+p.presence.remaining;p.presence.pausedAt=null;this.sendPresence(p);}
    p.needsPresence=false;this.armPresence(p);
   }
  }
 },
 armPresence(player) {
  if(player.isBot)return;
  this.cancel(player.presenceTimer);
  player.idleCheckAt??=this.now()+this.presenceDelay();
  const deadline=player.presence?.endsAt??player.idleCheckAt;
  const delay=player.presence?.pausedAt||player.needsPresence?5000:Math.max(0,deadline-this.now());
  player.presenceTimer=this.schedule(()=>{
   player.presenceTimer=null;if(this.players.get(player.id)!==player)return;
   // Keep gameplay and its animations intact. An overdue player cannot collect rewards.
   if(this.presenceBusy(player)){
    if(player.presence&&!player.presence.pausedAt){
     player.presence.remaining=Math.max(0,player.presence.endsAt-this.now());player.presence.pausedAt=this.now();
     this.send(player,{t:'presencePaused',token:player.presence.token});
    }
    player.needsPresence=true;return this.armPresence(player);
   }
   if(player.presence?.pausedAt){
    player.presence.endsAt=this.now()+player.presence.remaining;player.presence.pausedAt=null;
    player.needsPresence=false;this.sendPresence(player);return this.armPresence(player);
   }
   if(player.presence)return this.kickInactive(player);
   player.needsPresence=false;player.presence={token:this.crypto.randomUUID(),endsAt:this.now()+PRESENCE_REPLY_MS};
   this.sendPresence(player);this.armPresence(player);
  },delay);
 },
 sendPresence(player){if(player.presence&&!player.presence.pausedAt)this.send(player,{t:'presenceCheck',token:player.presence.token,remainingMs:Math.max(0,player.presence.endsAt-this.now())});},
 noteActivity(player,game=false,meaningful=false){
  if(player.isBot)return;
  if(game){
   // A valid turn interaction also proves presence if a lobby check was paused.
   const check=player.presence;player.presence=null;player.movementWatch=null;player.lastGameActivityAt=this.now();
   if(check)this.send(player,{t:'presenceCleared',token:check.token});
  }else if(player.presence||!this.allow(player,'activity'))return;
  this.resetPresenceIdle(player,game||meaningful);this.armPresence(player);
 },
 onPresenceReply(player,msg){
  const check=player.presence;if(!check||msg.token!==check.token||check.pausedAt)return;
  if(this.now()>=check.endsAt){if(this.presenceBusy(player)){this.armPresence(player);return;}return this.kickInactive(player);}
  player.presence=null;player.movementWatch=null;this.resetPresenceIdle(player);this.armPresence(player);
  this.send(player,{t:'presenceCleared',token:check.token});
 },
 kickInactive(player,automated=false){
  if(this.presenceBusy(player)){player.needsPresence=true;this.armPresence(player);return;}
  const part=this.participant(player.id);if(part)part.disqualified=true;
  const conn=player.conn;this.send(player,{t:'kicked',reason:automated?'Repeated automated movement without gameplay.':'No response to the inactivity check.'});
  if(conn)this.conns.delete(conn);this.removePlayer(player.id);
  if(conn)this.closeConn(conn,automated?4005:4003,automated?'automated_activity':'inactive');
 },
 canAward(id){
  const p=this.players.get(id);
  const activeGrace=p&&this.presenceBusy(p)&&Number.isFinite(p.lastGameActivityAt)&&this.now()-p.lastGameActivityAt<IDLE_MS;
  return !!id&&!this.participant(id)?.disqualified&&!!p&&(p.isBot||!p.presence&&(activeGrace||!p.needsPresence&&this.now()<p.idleCheckAt));
 },
};
