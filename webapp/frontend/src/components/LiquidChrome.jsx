import { Renderer, Program, Mesh, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec3 uResolution;
uniform vec3 uBaseColor;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uFrequencyX;
uniform float uFrequencyY;
uniform vec2 uMouse;
uniform float uMouseInfluence;
uniform bool uInteractive;

#define PI 3.14159265359

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = vUv;
  vec2 p = uv * vec2(uFrequencyX, uFrequencyY);

  float t = uTime * uSpeed;

  float wave = fbm(p + t * 0.3);
  wave += sin(uv.x * 6.2832 * uFrequencyX + t) * uAmplitude * 0.5;
  wave += cos(uv.y * 6.2832 * uFrequencyY + t * 0.7) * uAmplitude * 0.5;

  float ripples = sin((uv.x * 10.0 + wave * 5.0) * 6.2832 + t * 2.0) *
                  cos((uv.y * 10.0 + wave * 3.0) * 6.2832 + t * 1.5);

  float metallic = smoothstep(0.3, 0.7, wave);
  float specular = pow(max(0.0, ripples), 32.0) * metallic;

  vec3 color = uBaseColor;
  color += metallic * 0.15 * vec3(ripples);
  color += specular * vec3(1.0, 0.95, 0.9);

  vec3 lightDir = normalize(vec3(1.0, 1.0, 2.0));
  float diffuse = max(dot(normalize(vec3(wave * 0.5, 1.0, wave * 0.3)), lightDir), 0.0);
  color *= 0.5 + 0.5 * diffuse;

  if (uInteractive) {
    float mDist = length(uv - uMouse);
    float ripple = exp(-mDist * mDist * 20.0) * 0.3;
    color += ripple * vec3(0.4, 0.35, 0.5);
  }

  float alpha = 1.0;
  gl_FragColor = vec4(color, alpha);
}
`;

export default function LiquidChrome({
  baseColor = [0.043, 0.039, 0.051],
  speed = 0.3,
  amplitude = 0.25,
  frequencyX = 3,
  frequencyY = 3,
  interactive = true,
  mouseInfluence = 2
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    let program;
    let currentMouse = [0.5, 0.5];
    let targetMouse = [0.5, 0.5];

    function handleMouseMove(e) {
      const rect = gl.canvas.getBoundingClientRect();
      targetMouse = [
        (e.clientX - rect.left) / rect.width,
        1.0 - (e.clientY - rect.top) / rect.height
      ];
    }

    function handleMouseLeave() {
      targetMouse = [0.5, 0.5];
    }

    function resize() {
      renderer.setSize(container.offsetWidth, container.offsetHeight);
      if (program) {
        program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height];
      }
    }
    window.addEventListener('resize', resize);

    resize();

    const geometry = new Triangle(gl);
    program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height] },
        uBaseColor: { value: new Float32Array(baseColor) },
        uSpeed: { value: speed },
        uAmplitude: { value: amplitude },
        uFrequencyX: { value: frequencyX },
        uFrequencyY: { value: frequencyY },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uMouseInfluence: { value: mouseInfluence },
        uInteractive: { value: interactive ? 1 : 0 }
      }
    });

    const mesh = new Mesh(gl, { geometry, program });
    container.appendChild(gl.canvas);

    if (interactive) {
      gl.canvas.addEventListener('mousemove', handleMouseMove);
      gl.canvas.addEventListener('mouseleave', handleMouseLeave);
    }

    let animationFrameId;

    function update(time) {
      animationFrameId = requestAnimationFrame(update);
      program.uniforms.uTime.value = time * 0.001;

      if (interactive) {
        currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0]);
        currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1]);
        program.uniforms.uMouse.value[0] = currentMouse[0];
        program.uniforms.uMouse.value[1] = currentMouse[1];
      } else {
        program.uniforms.uMouse.value[0] = 0.5;
        program.uniforms.uMouse.value[1] = 0.5;
      }

      renderer.render({ scene: mesh });
    }
    animationFrameId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      if (interactive) {
        gl.canvas.removeEventListener('mousemove', handleMouseMove);
        gl.canvas.removeEventListener('mouseleave', handleMouseLeave);
      }
      container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [baseColor, speed, amplitude, frequencyX, frequencyY, interactive, mouseInfluence]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
