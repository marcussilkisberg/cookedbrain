/**
 * One gas burner, seen from above. It runs only on the home page and stops the
 * moment a round starts, so no effect ever competes with a measured stimulus.
 */
const FRAG = `
precision highp float;
uniform vec2 R;
uniform float T;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);
}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*R)/min(R.x,R.y);
  float r=length(uv)*2.;
  float a=atan(uv.y,uv.x);
  float ports=34.;
  float s=(a/6.28318+.5)*ports;
  float id=mod(floor(s),ports);
  float port=abs(fract(s)-.5)*2.;
  float wob=n(vec2(id*3.17,T*2.3))*.62+n(vec2(id*9.1,T*5.3))*.38;
  float ring=.8;
  float len=.06+.1*wob;
  float d=(r-ring)/len;
  float tongue=(1.-smoothstep(.0,1.,d+port*port*.95))*smoothstep(-.04,.1,d);
  vec3 core=vec3(.62,.84,1.);
  vec3 blue=vec3(.14,.34,1.);
  vec3 tip=vec3(1.,.5,.16);
  vec3 col=mix(core,blue,smoothstep(.0,.55,d));
  col=mix(col,tip,smoothstep(.72,1.05,d)*.55);
  vec3 c=col*tongue*1.9;
  c+=blue*exp(-abs(r-ring-.05)*7.)*.26;
  float cap=1.-smoothstep(ring-.012,ring+.002,r);
  float grain=.95+.1*n(uv*38.);
  vec3 iron=vec3(.083,.075,.07)*grain;
  iron+=blue*exp(-(ring-r)*12.)*.07;
  c=mix(c,iron,cap);
  vec3 hob=vec3(.0863,.0784,.0706);
  float a2=clamp(max(max(c.r,c.g),c.b)*1.4+cap,0.,1.);
  gl_FragColor=vec4(mix(hob,c,a2),1.);
}`;

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

export class Burner {
  private gl: WebGLRenderingContext | null = null;
  private uR: WebGLUniformLocation | null = null;
  private uT: WebGLUniformLocation | null = null;
  private raf = 0;
  private last = 0;
  private t0 = performance.now();
  private running = false;

  constructor(private canvas: HTMLCanvasElement) {
    try {
      const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
      if (!gl) return;
      const prog = gl.createProgram()!;
      for (const [type, src] of [
        [gl.VERTEX_SHADER, VERT],
        [gl.FRAGMENT_SHADER, FRAG],
      ] as const) {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        gl.attachShader(prog, s);
      }
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.uR = gl.getUniformLocation(prog, 'R');
      this.uT = gl.getUniformLocation(prog, 'T');
      this.gl = gl;
    } catch {
      this.gl = null;
    }
  }

  get works() {
    return !!this.gl;
  }

  private size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl?.viewport(0, 0, w, h);
    }
  }

  private draw(now: number) {
    const gl = this.gl;
    if (!gl) return;
    this.size();
    gl.uniform2f(this.uR, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uT, (now - this.t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  start() {
    if (!this.gl || this.running) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.draw(this.t0 + 4000);
      return;
    }
    this.running = true;
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (document.hidden || now - this.last < 32) return;
      this.last = now;
      this.draw(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
