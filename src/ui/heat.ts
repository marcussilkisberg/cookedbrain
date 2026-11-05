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
float fbm(vec2 p){
  float v=0.,a=.5;
  for(int i=0;i<5;i++){v+=a*n(p);p=p*2.07+vec2(1.7,9.2);a*=.5;}
  return v;
}
void main(){
  vec2 uv=gl_FragCoord.xy/R;
  // A tall flame rising from the bottom centre of the canvas.
  float x=(uv.x-.5)*R.x/R.y;
  float y=uv.y;
  float t=T*.9;
  float wob=fbm(vec2(x*2.2+t*.3,y*2.6-t*1.5))-.5;
  float wob2=fbm(vec2(x*5.+t*.6,y*7.-t*3.2))-.5;
  float xx=x+wob*.22*(.2+y)+wob2*.06;
  float width=.26*pow(1.-y,.9)+.015;
  float body=1.-smoothstep(0.,width,abs(xx));
  float core=1.-smoothstep(0.,width*.42,abs(xx));
  float flick=fbm(vec2(x*3.,y*4.-t*2.4));
  float tip=smoothstep(.98,.55,y+flick*.2);
  float a=body*tip;
  float c=core*tip*smoothstep(.9,.2,y);
  vec3 blue=vec3(.17,.38,1.);
  vec3 pale=vec3(.62,.84,1.);
  vec3 ember=vec3(1.,.45,.15);
  vec3 col=mix(blue,pale,c);
  col=mix(col,ember,smoothstep(.45,.95,y)*.6*body);
  col*=a*1.7;
  // Glow around the flame, and a nozzle at the base.
  col+=blue*exp(-abs(xx)*7.)*smoothstep(1.,.1,y)*.18;
  float noz=1.-smoothstep(.0,.025,abs(y-.015))*step(.0,1.);
  float nozw=1.-smoothstep(.08,.1,abs(x));
  col=mix(col,vec3(.22,.2,.18),noz*nozw*.9);
  vec3 bg=vec3(.0863,.0784,.0706);
  float al=clamp(max(max(col.r,col.g),col.b),0.,1.);
  gl_FragColor=vec4(mix(bg,col,al),1.);
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
