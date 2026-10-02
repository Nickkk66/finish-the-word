// One trajectory drives the launch, descent and camera. The initial impulse decays
// under air resistance and gravity rather than easing upward like a platform lift.
const APEX=Math.log(115/20)/.5,FALL_RATE=1.3;
const deploy=3+APEX+(8.5-APEX)/FALL_RATE;
const oldCatchVelocity=115*Math.exp(-.5*8.5)-20;
const CATCH_TIME=.8*(oldCatchVelocity-3)/(oldCatchVelocity*FALL_RATE-3);
const land=deploy+CATCH_TIME+10.7;
export const TIDE_FLIGHT = Object.freeze({launch:3,deploy,tuck:land-2.75,seated:land-1.25,land,pack:land+.7});
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
export function tideLaunchHeight(seconds) {
 const age=Math.max(0,seconds),t=age<=APEX?age:APEX+(age-APEX)*FALL_RATE,velocity=95,drag=.5,gravity=10;
 return (velocity/drag+gravity/(drag*drag))*(1-Math.exp(-drag*t))-gravity*t/drag;
}
export const tideLaunchVelocity=seconds=>{
 const age=Math.max(0,seconds),t=age<=APEX?age:APEX+(age-APEX)*FALL_RATE;
 return (115*Math.exp(-.5*t)-20)*(age<=APEX?1:FALL_RATE);
};
export function tideFlightPose(time,origin,rider,seat,reduced=false) {
 const f=TIDE_FLIGHT;if(time<f.launch||time>=f.land)return null;
 const age=time-f.launch,open=time>=f.deploy,landing=ease((time-f.deploy)/(f.land-f.deploy)),travel=ease((time-f.launch)/(f.land-f.launch));
 const seatBlend=ease((time-f.tuck)/(f.seated-f.tuck)),drift=(1-landing)*(1-seatBlend)*(reduced?.3:1);
 const sway={x:Math.sin((time-f.deploy)*2.1+seat)*2*drift,z:Math.sin((time-f.deploy)*1.7+seat)*1.4*drift};
 const impulse=reduced?0:age*9*Math.exp(-age*.65)*(1-travel),angle=seat*2.399;
 const peak=origin.y+tideLaunchHeight(f.deploy-f.launch);
 const catchTime=CATCH_TIME,initialVelocity=tideLaunchVelocity(f.deploy-f.launch),cruiseVelocity=-3,descent=time-f.deploy;
 const caughtY=peak+(initialVelocity+cruiseVelocity)*catchTime/2;
 let y=origin.y+tideLaunchHeight(age);
 if(open){
  if(descent<catchTime)y=peak+initialVelocity*descent+(cruiseVelocity-initialVelocity)*descent*descent/(2*catchTime);
  else {const span=f.land-f.deploy-catchTime,u=clamp((descent-catchTime)/span),u2=u*u,u3=u2*u;
   y=(2*u3-3*u2+1)*caughtY+(u3-2*u2+u)*span*cruiseVelocity+(-2*u3+3*u2)*rider.y;
  }
 }
 const descending=tideLaunchVelocity(age)<0,fallingBlend=ease(-tideLaunchVelocity(age)/8),canopyBlend=open?ease(descent/.6):0;
 const tumble=reduced?0:Math.min(1,age/.25)*Math.min(1,Math.exp(-age*.25)+fallingBlend*.65);
 return {x:origin.x+(rider.x-origin.x)*travel+(Math.sin(angle)*impulse*(1-canopyBlend)+sway.x*canopyBlend),y,z:origin.z+(rider.z-origin.z)*travel+(Math.cos(angle)*impulse*(1-canopyBlend)+sway.z*canopyBlend),yaw:rider.yaw,
  seated:seatBlend===1,seatBlend,airborne:true,flightAge:age,open,descending,fallingBlend,canopyBlend,sway,landingAltitude:Math.max(0,y-rider.y),seatY:rider.y+2,
  pitch:(Math.sin(age*3.3)*.8*tumble-.35*Math.exp(-age))*(1-canopyBlend)+sway.z*.025*canopyBlend,tilt:Math.sin(age*2.5+seat)*.6*tumble*(1-canopyBlend)-sway.x*.025*canopyBlend,visible:true};
}
