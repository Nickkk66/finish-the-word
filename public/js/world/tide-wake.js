import * as THREE from 'three';

export function createSharkWakeMaterial(map) {
 return new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
  uniforms:{map:{value:map},time:{value:0}},
  vertexShader:`uniform float time;attribute float foamAge;varying vec2 v;varying float age;
   void main(){v=uv;age=foamAge;vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);
    w.y+=sin(w.x*.055+time*.8)*.27+sin(-w.z*.09-time*.6)*.19;
    gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform sampler2D map;uniform float time;varying vec2 v;varying float age;
   void main(){vec2 flow=fract(vec2(v.x+sin(v.y*12.+time*2.4)*.08,v.y+time*.35+age*.3));
    float churn=.55+.45*pow(sin((v.x+v.y)*19.-time*6.+age*12.),2.);
    float fade=pow(1.-age,1.3);float alpha=texture2D(map,flow).a*churn*fade*.52;
    gl_FragColor=vec4(.93,1.,.98,alpha);}`
 });
}
