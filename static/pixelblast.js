(function(){
  const container = document.getElementById('bg-blast');
  if (!container || !window.THREE) return;

  const THREE = window.THREE;
  const POST = window.POSTPROCESSING || {};

  const MAX_CLICKS = 10;

  const VERTEX_SRC = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
  `;

  const FRAGMENT_SRC = `
  precision highp float;

  uniform vec3  uColor;
  uniform vec2  uResolution;
  uniform float uTime;
  uniform float uPixelSize;
  uniform float uScale;
  uniform float uDensity;
  uniform float uPixelJitter;
  uniform int   uEnableRipples;
  uniform float uRippleSpeed;
  uniform float uRippleThickness;
  uniform float uRippleIntensity;
  uniform float uEdgeFade;

  const int   MAX_CLICKS = 10;
  uniform vec2  uClickPos  [MAX_CLICKS];
  uniform float uClickTimes[MAX_CLICKS];

  float Bayer2(vec2 a) {
    a = floor(a);
    return fract(a.x / 2. + a.y * a.y * .75);
  }
  #define Bayer4(a) (Bayer2(.5*(a))*0.25 + Bayer2(a))
  #define Bayer8(a) (Bayer4(.5*(a))*0.25 + Bayer2(a))

  #define FBM_OCTAVES     5.0
  #define FBM_LACUNARITY  1.25
  #define FBM_GAIN        1.0

  float hash11(float n){ return fract(sin(n)*43758.5453); }

  float vnoise(vec3 p){
    vec3 ip = floor(p);
    vec3 fp = fract(p);
    float n000 = hash11(dot(ip + vec3(0.0,0.0,0.0), vec3(1.0,57.0,113.0)));
    float n100 = hash11(dot(ip + vec3(1.0,0.0,0.0), vec3(1.0,57.0,113.0)));
    float n010 = hash11(dot(ip + vec3(0.0,1.0,0.0), vec3(1.0,57.0,113.0)));
    float n110 = hash11(dot(ip + vec3(1.0,1.0,0.0), vec3(1.0,57.0,113.0)));
    float n001 = hash11(dot(ip + vec3(0.0,0.0,1.0), vec3(1.0,57.0,113.0)));
    float n101 = hash11(dot(ip + vec3(1.0,0.0,1.0), vec3(1.0,57.0,113.0)));
    float n011 = hash11(dot(ip + vec3(0.0,1.0,1.0), vec3(1.0,57.0,113.0)));
    float n111 = hash11(dot(ip + vec3(1.0,1.0,1.0), vec3(1.0,57.0,113.0)));
    vec3 w = fp*fp*fp*(fp*(fp*6.0-15.0)+10.0);
    float x00 = mix(n000, n100, w.x);
    float x10 = mix(n010, n110, w.x);
    float x01 = mix(n001, n101, w.x);
    float x11 = mix(n011, n111, w.x);
    float y0  = mix(x00, x10, w.y);
    float y1  = mix(x01, x11, w.y);
    return mix(y0, y1, w.z) * 2.0 - 1.0;
  }

  float fbm2(vec2 uv, float t){
    vec3 p = vec3(uv * uScale, t);
    float amp = 1.0;
    float freq = 1.0;
    float sum = 1.0;
    for (int i = 0; i < 5; ++i){
      sum  += amp * vnoise(p * freq);
      freq *= FBM_LACUNARITY;
      amp  *= FBM_GAIN;
    }
    return sum * 0.5 + 0.5;
  }

  void main(){
    float pixelSize = uPixelSize;
    vec2 fragCoord = gl_FragCoord.xy - uResolution * .5;
    float aspectRatio = uResolution.x / uResolution.y;

    vec2 pixelId = floor(fragCoord / pixelSize);
    vec2 pixelUV = fract(fragCoord / pixelSize);

    float cellPixelSize = 8.0 * pixelSize;
    vec2 cellId = floor(fragCoord / cellPixelSize);
    vec2 cellCoord = cellId * cellPixelSize;
    vec2 uv = cellCoord / uResolution * vec2(aspectRatio, 1.0);

    float base = fbm2(uv, uTime * 0.05);
    base = base * 0.5 - 0.65;
    float feed = base + (uDensity - 0.5) * 0.3;

    float speed     = uRippleSpeed;
    float thickness = uRippleThickness;
    const float dampT = 1.0;
    const float dampR = 10.0;

    if (uEnableRipples == 1) {
      for (int i = 0; i < MAX_CLICKS; ++i){
        vec2 pos = uClickPos[i];
        if (pos.x < 0.0) continue;
        float cellPixelSize = 8.0 * pixelSize;
        vec2 cuv = (((pos - uResolution * .5 - cellPixelSize * .5) / (uResolution))) * vec2(aspectRatio, 1.0);
        float t = max(uTime - uClickTimes[i], 0.0);
        float r = distance(uv, cuv);
        float waveR = speed * t;
        float ring  = exp(-pow((r - waveR) / thickness, 2.0));
        float atten = exp(-dampT * t) * exp(-dampR * r);
        feed = max(feed, ring * atten * uRippleIntensity);
      }
    }

    float bayer = Bayer8(fragCoord / uPixelSize) - 0.5;
    float bw = step(0.5, feed + bayer);

    float h = fract(sin(dot(floor(fragCoord / uPixelSize), vec2(127.1, 311.7))) * 43758.5453);
    float jitterScale = 1.0 + (h - 0.5) * uPixelJitter;
    float coverage = bw * jitterScale;

    if (uEdgeFade > 0.0) {
      vec2 norm = gl_FragCoord.xy / uResolution;
      float edge = min(min(norm.x, norm.y), min(1.0 - norm.x, 1.0 - norm.y));
      float fade = smoothstep(0.0, uEdgeFade, edge);
      coverage *= fade;
    }

    vec3 color = uColor;
    gl_FragColor = vec4(color, coverage);
  }
  `;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearAlpha(0);
  container.appendChild(renderer.domElement);

  const uniforms = {
    uResolution: { value: new THREE.Vector2(0, 0) },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#B19EEF') },
    uPixelSize: { value: 6 * renderer.getPixelRatio() },
    uScale: { value: 3 },
    uDensity: { value: 1.2 },
    uPixelJitter: { value: 0.5 },
    uEnableRipples: { value: 1 },
    uRippleSpeed: { value: 0.4 },
    uRippleThickness: { value: 0.12 },
    uRippleIntensity: { value: 1.5 },
    uEdgeFade: { value: 0.25 },
    uClickPos: { value: Array.from({ length: MAX_CLICKS }, () => new THREE.Vector2(-1, -1)) },
    uClickTimes: { value: new Float32Array(MAX_CLICKS) }
  };

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SRC,
    fragmentShader: FRAGMENT_SRC,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const quadGeom = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(quadGeom, material);
  scene.add(quad);

  const setSize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    uniforms.uResolution.value.set(renderer.domElement.width, renderer.domElement.height);
    uniforms.uPixelSize.value = 6 * renderer.getPixelRatio();
  };
  const ro = new ResizeObserver(setSize);
  ro.observe(container);
  setSize();

  let clickIx = 0;
  const mapToPixels = (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const scaleX = renderer.domElement.width / rect.width;
    const scaleY = renderer.domElement.height / rect.height;
    const fx = (e.clientX - rect.left) * scaleX;
    const fy = (rect.height - (e.clientY - rect.top)) * scaleY;
    return { fx, fy };
  };
  const onPointerDown = (e) => {
    const { fx, fy } = mapToPixels(e);
    uniforms.uClickPos.value[clickIx].set(fx, fy);
    uniforms.uClickTimes.value[clickIx] = uniforms.uTime.value;
    clickIx = (clickIx + 1) % MAX_CLICKS;
  };
  window.addEventListener('pointerdown', onPointerDown, { passive: true });

  const clock = new THREE.Clock();
  const speed = 0.6;
  const animate = () => {
    uniforms.uTime.value = clock.getElapsedTime() * speed;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
})();


