/**
 * MagicFX — procedural real-time VFX for Three.js r160+
 * No image/model assets. Import Three.js in the host app and pass renderer/scene/camera.
 *
 * Public API:
 *   const fx = new MagicFX({ renderer, scene, camera, ...options });
 *   const handle = fx.cast("energyWave", { origin, direction, power, color });
 *   const charge = fx.charge("energyWave", { origin, power });
 *   handle.update({ origin, direction, power, target });
 *   handle.stop();
 *   fx.update(dt);
 *   fx.render(); // renders scene + transparent-aware post stack
 *   fx.dispose();
 *
 * Notes:
 * - The particle pool and particle GPU buffers are fixed-size and reused.
 * - Procedural shader noise replaces authored textures.
 * - Water refraction, volumetric fire, smoke depth and true curl-noise are visual
 *   approximations; they do not perform scene ray marching or fluid simulation.
 */
import * as THREE from "three";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x-a)/(b-a), 0, 1); return t*t*(3-2*t); };
const easeOut = t => 1 - Math.pow(1-clamp(t,0,1), 3);
const easeInOut = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
const vec = (v, fallback = new THREE.Vector3()) => v?.isVector3 ? v.clone() : fallback.clone();
const color = c => c?.isColor ? c.clone() : new THREE.Color(c ?? 0x72caff);

const PARTICLE_LIMIT = 1500;

const particleVertex = `
attribute vec3 iPosition;
attribute vec3 iVelocity;
attribute vec4 iColor;
attribute float iSize;
attribute float iAge;
attribute float iLife;
attribute float iRotation;
uniform float uTime;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
varying vec2 vUv;
varying vec4 vColor;
varying float vLife;
void main() {
  vUv = uv;
  float life = clamp(1.0 - iAge / max(iLife, 0.001), 0.0, 1.0);
  vLife = life;
  vec3 p = iPosition;
  float stretch = min(length(iVelocity) * 0.018, iSize * 2.8);
  vec2 q = position.xy;
  float cs = cos(iRotation), sn = sin(iRotation);
  q = mat2(cs,-sn,sn,cs) * q;
  vec3 world = p + uCameraRight * q.x * iSize + uCameraUp * q.y * (iSize + stretch);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  vColor = iColor;
}`;
const particleFragment = `
precision highp float;
varying vec2 vUv;
varying vec4 vColor;
varying float vLife;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float soft = exp(-r*r*5.5) * smoothstep(0.0, 0.16, vLife);
  float core = pow(max(0.0, 1.0-r), 5.0);
  float a = (soft * 0.72 + core * 0.55) * vColor.a * smoothstep(0.0,0.08,vLife);
  if (a < 0.006) discard;
  vec3 c=mix(vec3(0.035,0.025,0.06),vColor.rgb,clamp(vLife*1.35,0.0,1.0));
  c=mix(c,vec3(1.0),core*0.92)*(1.0+core*2.5);
  gl_FragColor = vec4(c, a);
}`;

const noiseGLSL = `
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 x) {
  vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),
                 mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),
                 mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
  float v=0.0, a=0.5;
  for(int i=0;i<4;i++){ v += a*noise3(p); p*=2.03; a*=0.5; }
  return v;
}`;

const beamVertex = `
varying vec2 vUv;
varying vec3 vPos;
void main(){ vUv=uv; vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const beamFragment = `
precision highp float;
uniform float uTime; uniform float uPower; uniform vec3 uColor; uniform float uAlpha;
varying vec2 vUv; varying vec3 vPos;
${noiseGLSL}
void main(){
  float axis=abs(vUv.x-.5)*2.0;
  float n=fbm(vec3(vUv*vec2(8.0,2.0),uTime*1.8));
  float warp=fbm(vec3(vUv.x*5.0+uTime*2.0,vUv.y*3.0,uTime*.7));
  float core=exp(-axis*axis*95.0);
  float inner=exp(-axis*axis*15.0);
  float edge=exp(-axis*axis*3.0);
  float pulse=.82+.18*sin(uTime*17.0+n*9.0);
  float energy=(core*4.8+inner*1.65+edge*.42)*(0.72+n*.48+warp*.3)*pulse;
  vec3 c=mix(uColor,vec3(1.0),clamp(core*.95,0.0,1.0));
  c*=energy*(1.0+uPower*1.2);
  float alpha=clamp((core*.98+inner*.62+edge*.24)*uAlpha,0.0,1.0);
  gl_FragColor=vec4(c,alpha);
}`;

const orbFragment = `
precision highp float;
uniform float uTime; uniform vec3 uColor; uniform float uPower;
varying vec3 vNormal; varying vec3 vView;
${noiseGLSL}
void main(){
 float fres=pow(1.0-max(dot(normalize(vNormal),normalize(vView)),0.0),2.2);
 float n=fbm(normalize(vNormal)*5.0+uTime*.7);
 float pulse=.88+.12*sin(uTime*8.0+n*12.0);
 vec3 c=mix(uColor,vec3(1.0),clamp(fres*.9+n*.18,0.0,1.0));
 float a=clamp(.24+fres*.75+n*.18,0.0,1.0);
 gl_FragColor=vec4(c*(1.5+uPower*2.0)*pulse,a);
}`;

const shieldFragment = `
precision highp float;
uniform float uTime; uniform vec3 uColor; uniform float uHit;
varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
void main(){
 vec3 p=normalize(vLocal);
 float f=pow(1.0-max(dot(normalize(vNormal),normalize(vView)),0.0),2.0);
 vec2 h=p.xy*13.0;
 vec2 gv=abs(fract(h)-.5);
 float hexLine=max(gv.x*.866+gv.y*.5,gv.y);
 float grid=1.0-smoothstep(.455,.49,hexLine);
 float wave=sin(length(p.xy)*34.0-uTime*4.0)*.5+.5;
 float a=clamp(grid*.28+f*.58+uHit*.3*wave,0.0,.86);
 gl_FragColor=vec4(uColor*(1.3+f*2.0+uHit),a);
}`;

const waterFragment = `
precision highp float;
uniform float uTime; uniform vec3 uColor;
varying vec2 vUv;
${noiseGLSL}
void main(){
 float n=fbm(vec3(vUv*vec2(8.0,3.0),uTime*1.2));
 float ripple=sin(vUv.x*38.0-uTime*4.0+n*4.0);
 float band=exp(-pow((vUv.y-.5)*5.0,2.0));
 float highlight=pow(max(0.0,ripple),8.0)*band;
 vec3 c=uColor*(.7+n*.6)+vec3(1.0)*highlight*2.2;
 float a=clamp(band*.72+highlight*.7,0.0,1.0);
 gl_FragColor=vec4(c,a);
}`;

const postVertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.0);}`;
const postFragment = `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBloom;
uniform float uChroma;
uniform float uVignette;
uniform vec2 uShock;
uniform float uShockStrength;
varying vec2 vUv;
void main(){
 vec2 uv=vUv;
 vec2 d=uv-uShock;
 float r=length(d);
 float ring=exp(-pow((r-uTime*0.0-.12)*65.0,2.0))*uShockStrength;
 uv += normalize(d+vec2(.0001))*ring*.018;
 vec2 px=1.0/uResolution;
 vec2 ca=normalize(uv-.5)*uChroma*px*2.0;
 vec4 base=texture2D(tDiffuse,uv);
 vec3 rgb;
 rgb.r=texture2D(tDiffuse,uv+ca).r;
 rgb.g=base.g;
 rgb.b=texture2D(tDiffuse,uv-ca).b;
 vec3 bloom=vec3(0.0);
 for(int x=-2;x<=2;x++) for(int y=-2;y<=2;y++){
   vec2 o=vec2(float(x),float(y))*px*2.0;
   vec4 s=texture2D(tDiffuse,uv+o);
   bloom+=max(s.rgb-vec3(.8),vec3(0.0))*.04;
 }
 rgb+=bloom*uBloom;
 float vig=1.0-uVignette*smoothstep(.28,.78,length((uv-.5)*vec2(1.0,1.0)));
 gl_FragColor=vec4(rgb*vig,base.a);
}`;

class ParticlePool {
  constructor(scene, camera, max = PARTICLE_LIMIT) {
    this.max=max; this.camera=camera; this.cursor=0; this.count=0;
    this.data=Array.from({length:max},()=>({active:false,age:0,life:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,size:.1,rot:0,spin:0,drag:.98,gravity:0,color:new THREE.Color(1,1,1),alpha:1}));
    const g=new THREE.InstancedBufferGeometry();
    const base=new THREE.PlaneGeometry(1,1);
    g.index=base.index; g.attributes.position=base.attributes.position; g.attributes.uv=base.attributes.uv;
    const attr=(name,size)=>{const a=new THREE.InstancedBufferAttribute(new Float32Array(max*size),size);g.setAttribute(name,a);return a;};
    this.aPos=attr("iPosition",3); this.aVel=attr("iVelocity",3); this.aColor=attr("iColor",4);
    this.aSize=attr("iSize",1); this.aAge=attr("iAge",1); this.aLife=attr("iLife",1); this.aRot=attr("iRotation",1);
    g.instanceCount=max;
    this.material=new THREE.ShaderMaterial({vertexShader:particleVertex,fragmentShader:particleFragment,transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uCameraRight:{value:new THREE.Vector3(1,0,0)},uCameraUp:{value:new THREE.Vector3(0,1,0)}}});
    this.mesh=new THREE.Mesh(g,this.material); this.mesh.frustumCulled=false; scene.add(this.mesh);
  }
  emit(o) {
    const p=this.data[this.cursor]; this.cursor=(this.cursor+1)%this.max;
    Object.assign(p,{active:true,age:0,life:o.life??.8,x:o.position.x,y:o.position.y,z:o.position.z,
      vx:o.velocity.x,vy:o.velocity.y,vz:o.velocity.z,size:o.size??.1,rot:o.rotation??Math.random()*TAU,
      spin:o.spin??0,drag:o.drag??.985,gravity:o.gravity??0,color:o.color?.clone?.()??new THREE.Color(o.color??0xffffff),alpha:o.alpha??1});
    return p;
  }
  burst(origin,count,colorValue,speed=3,size=.12,life=.8,spread=1) {
    const c=color(colorValue);
    for(let i=0;i<count;i++){
      const z=Math.random()*2-1, a=Math.random()*TAU, r=Math.sqrt(1-z*z);
      const d=new THREE.Vector3(r*Math.cos(a),z,r*Math.sin(a));
      d.multiplyScalar(speed*(.35+Math.random()*.9)*spread);
      this.emit({position:origin,velocity:d,color:c,size:size*(.5+Math.random()),life:life*(.65+Math.random()*.7),gravity:-.7});
    }
  }
  update(dt,time) {
    const right=new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion);
    const up=new THREE.Vector3(0,1,0).applyQuaternion(this.camera.quaternion);
    this.material.uniforms.uCameraRight.value.copy(right); this.material.uniforms.uCameraUp.value.copy(up);
    this.material.uniforms.uTime.value=time;
    const ap=this.aPos.array,av=this.aVel.array,ac=this.aColor.array,as=this.aSize.array,aa=this.aAge.array,al=this.aLife.array,ar=this.aRot.array;
    for(let i=0;i<this.max;i++){
      const p=this.data[i], k=i*3, c=i*4;
      if(p.active){
        p.age+=dt;
        if(p.age>=p.life){p.active=false;p.alpha=0;}
        else {
          const damp=Math.pow(p.drag,dt*60);
          p.vx*=damp;p.vy*=damp;p.vz*=damp;p.vy+=p.gravity*dt;
          p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.rot+=p.spin*dt;
        }
      }
      ap[k]=p.x;ap[k+1]=p.y;ap[k+2]=p.z;
      av[k]=p.vx;av[k+1]=p.vy;av[k+2]=p.vz;
      ac[c]=p.color.r;ac[c+1]=p.color.g;ac[c+2]=p.color.b;ac[c+3]=p.active?p.alpha:0;
      as[i]=p.active?p.size:0;aa[i]=p.active?p.age:1;al[i]=p.life;ar[i]=p.rot;
    }
    for(const a of [this.aPos,this.aVel,this.aColor,this.aSize,this.aAge,this.aLife,this.aRot]) a.needsUpdate=true;
  }
  dispose(){this.mesh.parent?.remove(this.mesh);this.mesh.geometry.dispose();this.material.dispose();}
}

export class MagicFX {
  constructor({renderer,scene,camera,quality=1,postprocessing=true,maxParticles=PARTICLE_LIMIT}={}) {
    if(!renderer||!scene||!camera) throw new Error("MagicFX requires { renderer, scene, camera }");
    this.renderer=renderer;this.scene=scene;this.camera=camera;this.quality=clamp(quality,.25,1);
    this.time=0;this.effects=new Set();this.lights=[];this.shake={intensity:0,duration:0,elapsed:0,offset:new THREE.Vector3()};
    this.pool=new ParticlePool(scene,camera,Math.min(maxParticles,PARTICLE_LIMIT));
    this.postEnabled=postprocessing;this._initPost();this._fps=60;this._fpsAccum=0;this._fpsFrames=0;this._qualityTimer=0;
    this._baseCameraPosition=camera.position.clone();
  }
  _initPost(){
    if(!this.postEnabled)return;
    const r=this.renderer;
    this.rt=new THREE.WebGLRenderTarget(1,1,{format:THREE.RGBAFormat,type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false});
    this.rt.texture.colorSpace=THREE.LinearSRGBColorSpace;
    this.postScene=new THREE.Scene();this.postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.postMat=new THREE.ShaderMaterial({vertexShader:postVertex,fragmentShader:postFragment,transparent:true,depthTest:false,depthWrite:false,uniforms:{
      tDiffuse:{value:this.rt.texture},uResolution:{value:new THREE.Vector2(1,1)},uTime:{value:0},
      uBloom:{value:.85},uChroma:{value:.45},uVignette:{value:.22},uShock:{value:new THREE.Vector2(.5,.5)},uShockStrength:{value:0}
    }});
    const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.postMat);this.postScene.add(quad);this._postQuad=quad;
    this._resizePost();
  }
  _resizePost(){
    if(!this.rt)return;
    const size=this.renderer.getSize(new THREE.Vector2());const pr=this.renderer.getPixelRatio();
    const w=Math.max(1,Math.floor(size.x*pr)),h=Math.max(1,Math.floor(size.y*pr));
    this.rt.setSize(w,h);this.postMat.uniforms.uResolution.value.set(w,h);
  }
  _materialOrb(c,power=1){return new THREE.ShaderMaterial({vertexShader:`varying vec3 vNormal;varying vec3 vView;void main(){vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vView=-mv.xyz;gl_Position=projectionMatrix*mv;}`,fragmentShader:orbFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:this.time},uColor:{value:c},uPower:{value:power}}});}
  _mesh(geometry,material){const m=new THREE.Mesh(geometry,material);m.frustumCulled=false;this.scene.add(m);return m;}
  _light(pos,c,power,duration=.25){const l=new THREE.PointLight(c, power*3, 5+power*14,2);l.position.copy(pos);this.scene.add(l);this.lights.push({light:l,life:duration,max:duration,intensity:l.intensity});return l;}
  _shock(pos,power){const v=pos.clone().project(this.camera);if(this.postMat){this.postMat.uniforms.uShock.value.set(v.x*.5+.5,v.y*.5+.5);this.postMat.uniforms.uShockStrength.value=Math.max(this.postMat.uniforms.uShockStrength.value,power);}}
  _shake(power,duration=.35){this.shake.intensity=Math.max(this.shake.intensity,power*.18);this.shake.duration=Math.max(this.shake.duration,duration);this.shake.elapsed=0;}
  _ring(pos,c,scale=1){
    const g=new THREE.TorusGeometry(.65,.025,6,64);const m=this._mesh(g,new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
    m.position.copy(pos);m.quaternion.copy(this.camera.quaternion);m.scale.setScalar(.01);
    this.effects.add({kind:"ring",mesh:m,age:0,life:.55,scale,color:c,dispose:()=>{this.scene.remove(m);g.dispose();m.material.dispose();}});
  }
  charge(type,{origin=new THREE.Vector3(),power=.5,color:col}={}){
    const c=color(col);const orb=this._mesh(new THREE.SphereGeometry(.5,32,24),this._materialOrb(c,power));
    orb.position.copy(origin);orb.scale.setScalar(.04);
    const handle={type,active:true,origin:origin.clone(),power:clamp(power,0,1),orb,age:0,
      update:(p={})=>{if(p.origin)handle.origin.copy(p.origin);if(p.power!==undefined)handle.power=clamp(p.power,0,1);orb.position.copy(handle.origin);},
      stop:()=>{handle.active=false;this.scene.remove(orb);orb.geometry.dispose();orb.material.dispose();this.effects.delete(state);}};
    const state={kind:"charge",handle,orb,color:c,age:0,life:99,dispose:()=>{this.scene.remove(orb);orb.geometry.dispose();orb.material.dispose();}};
    this.effects.add(state);return handle;
  }
  cast(type,{origin=new THREE.Vector3(),direction=new THREE.Vector3(0,0,-1),power=.7,color:col,target=null}={}){
    const c=color(col);const p=clamp(power,0,1);const dir=vec(direction,new THREE.Vector3(0,0,-1)).normalize();
    const end=target?.isVector3?target.clone():origin.clone().addScaledVector(dir,8+10*p);
    const state={kind:type,age:0,life:1.5,origin:origin.clone(),direction:dir,power:p,color:c,end,active:true,meshes:[],dispose:()=>{for(const m of state.meshes){this.scene.remove(m);m.geometry?.dispose();m.material?.dispose();}}};
    const add=(m)=>{state.meshes.push(m);return m;};
    const burst=(at,n=24,s=4)=>this.pool.burst(at,Math.floor(n*this.quality),c,s,.12,.7);
    const finish=(at)=>{burst(at,55,5);this._ring(at,c,1+p);this._shock(at,p);this._shake(p);this._light(at,c,2+p,.35);};
    state.update=(params={})=>{
      if(params.origin)state.origin.copy(params.origin);
      if(params.direction){state.direction.copy(params.direction).normalize();}
      if(params.target?.isVector3)state.end.copy(params.target);
      else if(params.direction)state.end.copy(state.origin).addScaledVector(state.direction,8+10*state.power);
      if(params.power!==undefined)state.power=clamp(params.power,0,1);
      if(params.color)state.color.copy(color(params.color));
      if(state.kind==="energyWave")this._placeBeam(state);
      if(state.kind==="shield"){state.mesh.position.copy(state.origin);}
    };
    state.stop=()=>{if(state.active){state.active=false;state.stopAt=state.age;state.life=Math.min(state.life,state.age+.15);}};
    if(type==="energyWave"){
      const geo=new THREE.CylinderGeometry(.5,.5,1,32,1,true);
      const mat=new THREE.ShaderMaterial({vertexShader:beamVertex,fragmentShader:beamFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uPower:{value:p},uColor:{value:c},uAlpha:{value:1}}});
      const beam=add(this._mesh(geo,mat));beam.userData.beam=true;state.beam=beam;
      const core=add(this._mesh(new THREE.CylinderGeometry(.12,.12,1,16,1,true),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false})));
      state.core=core;this._placeBeam(state);this._light(origin,c,3+p,.6);
      state.life=99;state.held=true;
    } else if(type==="powerBlast"){
      const ball=add(this._mesh(new THREE.SphereGeometry(.25,24,16),this._materialOrb(c,p)));
      state.ball=ball;state.velocity=dir.clone().multiplyScalar(12+18*p);state.life=.85;
      this.pool.burst(origin,Math.floor(12*this.quality),c,2,.07,.45);
      this._light(origin,c,2+p,.4);
    } else if(type==="air"){
      state.life=1.7;state.age=0;state.axis=dir.clone();
      for(let i=0;i<Math.floor(150*this.quality);i++){const a=Math.random()*TAU,r=.2+Math.random()*1.6;const pos=origin.clone().add(new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r,0));const tangent=new THREE.Vector3(-Math.sin(a),Math.cos(a),0).addScaledVector(dir,.2);this.pool.emit({position:pos,velocity:tangent.multiplyScalar(2+Math.random()*5),color:c,size:.025+Math.random()*.04,life:.7+Math.random()*.9,spin:4});}
      this._ring(origin,c,1+p);this._light(origin,c,1.5,.5);
    } else if(type==="water"){
      state.life=1.8;
      const curve=new THREE.CatmullRomCurve3([origin.clone(),origin.clone().add(new THREE.Vector3(0,1,0)),end.clone().lerp(origin,.35),end.clone()]);
      const g=new THREE.TubeGeometry(curve,48,.12+.13*p,10,false);
      const m=add(this._mesh(g,new THREE.ShaderMaterial({vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:waterFragment,transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uColor:{value:c}}})));
      state.ribbon=m;this.pool.burst(end,30,c,3,.07,.8);
    } else if(type==="earth"){
      state.life=1.8;state.rocks=[];
      for(let i=0;i<7;i++){const g=new THREE.DodecahedronGeometry(.25+Math.random()*.28,0);const pos=g.attributes.position;for(let j=0;j<pos.count;j++){const k=pos.getX(j)*(0.8+Math.random()*.4);pos.setX(j,k); }g.computeVertexNormals();
        const m=add(this._mesh(g,new THREE.MeshStandardMaterial({color:0x766d62,roughness:1,flatShading:true,emissive:0x21180f})));
        const a=i/7*TAU;m.position.copy(origin).add(new THREE.Vector3(Math.cos(a)*(.5+Math.random()),.15+Math.random(),Math.sin(a)*(.5+Math.random())));
        state.rocks.push({mesh:m,angle:a,r:.7+Math.random(),height:.4+Math.random()*1.3,speed:1+Math.random()*2});}
      this._ring(origin,c,1+p);this.pool.burst(origin,60,0x998b78,2,.12,1);
    } else if(type==="fire"){
      state.life=1.15;const ball=add(this._mesh(new THREE.IcosahedronGeometry(.38+.25*p,2),this._materialOrb(new THREE.Color(0xff5a12),p)));
      ball.position.copy(origin);state.ball=ball;state.velocity=dir.clone().multiplyScalar(7+12*p);
      this.pool.burst(origin,80,0xff6a12,3,.12,.8);
      this._light(origin,0xff5a12,3+p,.65);
    } else if(type==="lightning"){
      state.life=.42;state.bolt=add(this._makeBolt(origin,end,c,p));this._light(origin,c,2+p,.3);this._light(end,c,2+p,.3);this._shock(end,p);this._shake(p);
    } else if(type==="shield"){
      state.life=99;state.held=true;
      const g=new THREE.SphereGeometry(1.7,48,32);
      const mat=new THREE.ShaderMaterial({vertexShader:`varying vec3 vNormal;varying vec3 vView;varying vec3 vLocal;void main(){vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vView=-mv.xyz;vLocal=position;gl_Position=projectionMatrix*mv;}`,fragmentShader:shieldFragment,transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uColor:{value:c},uHit:{value:0}}});
      state.mesh=add(this._mesh(g,mat));state.mesh.position.copy(origin);state.mesh.scale.setScalar(.01);
    } else throw new Error(`Unknown MagicFX power: ${type}`);
    this.effects.add(state);
    if(type!=="energyWave"&&type!=="shield") finish(end);
    return state;
  }
  _placeBeam(s){
    if(!s.beam)return;
    const d=s.end.clone().sub(s.origin);const len=Math.max(.001,d.length());
    const mid=s.origin.clone().add(s.end).multiplyScalar(.5);
    s.beam.position.copy(mid);s.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());s.beam.scale.set(1.1+s.power*1.5,len,1.1+s.power*1.5);
    s.core.position.copy(mid);s.core.quaternion.copy(s.beam.quaternion);s.core.scale.set(.45+s.power*.6,len,.45+s.power*.6);
  }
  _makeBolt(a,b,c,p){
    const positions=new Float32Array(3*2*64);const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(positions,3));
    const m=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:c,transparent:true,opacity:1,blending:THREE.AdditiveBlending}));
    m.userData={a:a.clone(),b:b.clone(),power:p};this._refreshBolt(m);return m;
  }
  _refreshBolt(m){
    const {a,b,power}=m.userData;const arr=m.geometry.attributes.position.array;
    const points=[a.clone()];const segments=24;
    for(let i=1;i<segments;i++){const t=i/segments;const p=a.clone().lerp(b,t);const off=new THREE.Vector3((Math.random()-.5)*.8,(Math.random()-.5)*.8,(Math.random()-.5)*.8).multiplyScalar(power);p.add(off);points.push(p);}
    points.push(b.clone());
    let n=0;for(let i=0;i<segments;i++){for(const p of [points[i],points[i+1]]){arr[n++]=p.x;arr[n++]=p.y;arr[n++]=p.z;}}
    m.geometry.attributes.position.needsUpdate=true;m.geometry.setDrawRange(0,segments*2);
  }
  update(dt){
    dt=Math.min(Math.max(dt,0),.05);this.time+=dt;
    this.pool.update(dt,this.time);
    for(const s of this.effects){
      s.age+=dt;const t=s.age;
      if(s.kind==="charge"){
        const h=s.handle;if(!h.active){s.dispose();this.effects.delete(s);continue;}
        const k=easeOut(clamp(t/1.2,0,1));s.orb.scale.setScalar(.08+k*(.45+h.power*.7));
        s.orb.material.uniforms.uTime.value=this.time;s.orb.material.uniforms.uPower.value=h.power;
        if(Math.random()<dt*(18+30*h.power)*this.quality){const a=Math.random()*TAU,r=.7+Math.random()*.5;const pos=h.origin.clone().add(new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r,Math.sin(a*2)*.3));const v=h.origin.clone().sub(pos).normalize().multiplyScalar(1.5+Math.random()*2);this.pool.emit({position:pos,velocity:v,color:s.color,size:.035,life:.55,drag:.99});}
      } else if(s.kind==="energyWave"){
        s.beam.material.uniforms.uTime.value=this.time;s.beam.material.uniforms.uAlpha.value=s.active?1:Math.max(0,1-(t-(s.stopAt??t))/.15);
        s.beam.material.uniforms.uPower.value=s.power;
        if(Math.random()<dt*(25+40*s.power)*this.quality){const p=s.origin.clone().lerp(s.end,Math.random());this.pool.emit({position:p,velocity:new THREE.Vector3((Math.random()-.5)*2,(Math.random()-.5)*2,(Math.random()-.5)*2),color:s.color,size:.04+Math.random()*.05,life:.25});}
        if(!s.active && s.beam.material.uniforms.uAlpha.value<=0){s.dispose();this.effects.delete(s);}
      } else if(s.kind==="powerBlast"||s.kind==="fire"){
        s.ball.position.addScaledVector(s.velocity,dt);s.ball.material.uniforms.uTime.value=this.time;
        const tail=s.ball.position.clone().addScaledVector(s.direction,-.25);
        this.pool.emit({position:tail,velocity:new THREE.Vector3((Math.random()-.5)*.6,(Math.random()-.5)*.6,(Math.random()-.5)*.6),color:s.color,size:s.kind==="fire"?.12:.07,life:.3});
        if(t>s.life*.72)s.ball.scale.multiplyScalar(.96);
      } else if(s.kind==="water"){s.ribbon.material.uniforms.uTime.value=this.time;}
      else if(s.kind==="earth"){
        for(const r of s.rocks){r.angle+=dt*r.speed;r.mesh.position.set(s.origin.x+Math.cos(r.angle)*r.r,s.origin.y+r.height+Math.sin(t*4+r.angle)*.12,s.origin.z+Math.sin(r.angle)*r.r);r.mesh.rotation.x+=dt;r.mesh.rotation.y+=dt*.7;}
      } else if(s.kind==="lightning"){
        if(Math.random()<dt*30)this._refreshBolt(s.bolt);
        s.bolt.material.opacity= .5+Math.random()*.5;
      } else if(s.kind==="shield"){
        s.mesh.scale.setScalar(1.0+.035*Math.sin(t*2));s.mesh.material.uniforms.uTime.value=this.time;s.mesh.material.uniforms.uHit.value=Math.max(0,s.mesh.material.uniforms.uHit.value-dt*2);
      } else if(s.kind==="ring"){
        const k=easeOut(t/s.life);s.mesh.scale.setScalar((.01+k*2.8)*s.scale);s.mesh.material.opacity=1-k;
      }
      if(!s.held&&s.age>=s.life){
        if(s.kind==="powerBlast"||s.kind==="fire"){this.pool.burst(s.ball.position,60,s.color,5,.11,.8);this._ring(s.ball.position,s.color,1);this._shock(s.ball.position,s.power);this._shake(s.power);this._light(s.ball.position,s.color,2,.3);}
        s.dispose();this.effects.delete(s);
      }
    }
    for(let i=this.lights.length-1;i>=0;i--){const l=this.lights[i];l.life-=dt;l.light.intensity=l.intensity*Math.max(0,l.life/l.max);if(l.life<=0){this.scene.remove(l.light);this.lights.splice(i,1);}}
    if(this.shake.elapsed<this.shake.duration){this.shake.elapsed+=dt;const k=1-this.shake.elapsed/this.shake.duration;const a=this.shake.intensity*k;this.camera.position.copy(this._baseCameraPosition).add(new THREE.Vector3((Math.random()-.5)*a,(Math.random()-.5)*a,0));}
    else {this.camera.position.copy(this._baseCameraPosition);this.shake.intensity=0;}
    this._fpsAccum+=dt;this._fpsFrames++;this._qualityTimer+=dt;
    if(this._qualityTimer>1){this._fps=this._fpsFrames/this._fpsAccum;this._fpsAccum=0;this._fpsFrames=0;this._qualityTimer=0;if(this._fps<48)this.quality=Math.max(.35,this.quality-.1);else if(this._fps>57)this.quality=Math.min(1,this.quality+.025);}
    if(this.postMat){this.postMat.uniforms.uTime.value=this.time;this.postMat.uniforms.uShockStrength.value=Math.max(0,this.postMat.uniforms.uShockStrength.value-dt*1.8);}
  }
  render(){
    if(!this.postEnabled||!this.rt){this.renderer.render(this.scene,this.camera);return;}
    this._resizePost();const old=this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);this.renderer.clear();this.renderer.render(this.scene,this.camera);
    this.renderer.setRenderTarget(null);this.renderer.render(this.postScene,this.postCamera);
    this.renderer.setRenderTarget(old);
  }
  setPostFX({bloom,chroma,vignette}={}){if(!this.postMat)return;const u=this.postMat.uniforms;if(bloom!==undefined)u.uBloom.value=bloom;if(chroma!==undefined)u.uChroma.value=chroma;if(vignette!==undefined)u.uVignette.value=vignette;}
  dispose(){
    for(const s of this.effects){s.dispose?.();}this.effects.clear();
    for(const l of this.lights)this.scene.remove(l.light);this.lights.length=0;
    this.pool.dispose();if(this.rt)this.rt.dispose();if(this.postMat)this.postMat.dispose();this._postQuad?.geometry.dispose();
  }
}
export default MagicFX;
