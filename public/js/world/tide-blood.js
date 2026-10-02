import * as THREE from 'three';

// A diluted plume on the moving water, with wispy irregular edges rather than a
// flat red disc. Each wreck owns its material so overlapping losses age separately.
export function createBloodPool(parent, geometry) {
 const material=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,side:THREE.DoubleSide,
  uniforms:{time:{value:0},age:{value:0}},
  vertexShader:`uniform float time;varying vec2 v;
   void main(){v=uv;vec4 w=modelMatrix*vec4(position,1.);
    w.y+=sin(w.x*.055+time*.8)*.27+sin(-w.z*.09-time*.6)*.19;
    gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform float time;uniform float age;varying vec2 v;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
   float fbm(vec2 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.07)*.15;}
   void main(){vec2 p=(v-.5)*2.;float spread=mix(.22,.9,1.-exp(-age*.65));
    vec2 flow=p+vec2(sin(p.y*5.+time*.13),cos(p.x*4.-time*.1))*.09;
    float cloud=fbm(flow*5.+vec2(time*.035,-time*.026));
    float edge=length(p*vec2(.94,1.07))+(cloud-.5)*.24;
    float wisps=1.-smoothstep(spread*.6,spread,edge);
    float density=wisps*(.4+.6*cloud);
    float appear=smoothstep(0.,.12,age),dilution=mix(1.,.38,1.-exp(-age/70.));
    vec3 color=mix(vec3(.66,.025,.05),vec3(.40,.045,.065),cloud);
    gl_FragColor=vec4(color,density*.86*appear*dilution);
   }`
 });
 const mesh=new THREE.Mesh(geometry,material);mesh.rotation.x=-Math.PI/2;mesh.visible=false;parent.add(mesh);
 return {mesh,update(seconds,origin,water,time){
  mesh.visible=seconds>=0;
  mesh.position.set(origin.x,water+.035,origin.z);
  material.uniforms.age.value=Math.max(0,seconds);material.uniforms.time.value=time;
 },dispose(){mesh.removeFromParent();material.dispose();}};
}
