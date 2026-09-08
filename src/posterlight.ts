import Phaser from "phaser";

/**
 * M26 poster-graded Light2D pipeline. A drop-in subclass of Phaser's
 * LightPipeline (per-pixel diffuse over a normal map, quadratic falloff,
 * additive ambient) with one change: the diffuse term uses a half-lambert
 * wrap so FLAT poster surfaces — the whole point of the flat-graphic style —
 * still receive a broad, soft pool of light. With plain Light2D a perfectly
 * flat wall's normal is perpendicular to every in-plane light direction and
 * its diffuse collapses to ~0.1; the wrap keeps flat response around 0.45
 * while bevels and edges (the drawn geometry's normal map) push toward 1.0,
 * which is exactly where the poster relief should catch the light.
 *
 * The fragment shader is Phaser's Light-frag source (MIT, copyright
 * Photon Storm) with the single diffuse line modified.
 */
const POSTER_LIGHT_FRAG = [
    '#define SHADER_NAME POSTER_LIGHT_FS',
    'precision mediump float;',
    'struct Light',
    '{',
    '    vec2 position;',
    '    vec3 color;',
    '    float intensity;',
    '    float radius;',
    '};',
    'const int kMaxLights = %LIGHT_COUNT%;',
    'uniform vec4 uCamera; /* x, y, rotation, zoom */',
    'uniform vec2 uResolution;',
    'uniform sampler2D uMainSampler;',
    'uniform sampler2D uNormSampler;',
    'uniform vec3 uAmbientLightColor;',
    'uniform Light uLights[kMaxLights];',
    'uniform mat3 uInverseRotationMatrix;',
    'uniform int uLightCount;',
    'varying vec2 outTexCoord;',
    'varying float outTexId;',
    'varying float outTintEffect;',
    'varying vec4 outTint;',
    'void main ()',
    '{',
    '    vec3 finalColor = vec3(0.0, 0.0, 0.0);',
    '    vec4 texel = vec4(outTint.bgr * outTint.a, outTint.a);',
    '    vec4 texture = texture2D(uMainSampler, outTexCoord);',
    '    vec4 color = texture * texel;',
    '    if (outTintEffect == 1.0)',
    '    {',
    '        color.rgb = mix(texture.rgb, outTint.bgr * outTint.a, texture.a);',
    '    }',
    '    else if (outTintEffect == 2.0)',
    '    {',
    '        color = texel;',
    '    }',
    '    vec3 normalMap = texture2D(uNormSampler, outTexCoord).rgb;',
    '    vec3 normal = normalize(uInverseRotationMatrix * vec3(normalMap * 2.0 - 1.0));',
    '    vec2 res = vec2(min(uResolution.x, uResolution.y)) * uCamera.w;',
    '    for (int index = 0; index < kMaxLights; ++index)',
    '    {',
    '        if (index < uLightCount)',
    '        {',
    '            Light light = uLights[index];',
    '            vec3 lightDir = vec3((light.position.xy / res) - (gl_FragCoord.xy / res), 0.1);',
    '            vec3 lightNormal = normalize(lightDir);',
    '            float distToSurf = length(lightDir) * uCamera.w;',
    '            float diffuseFactor = max(dot(normal, lightNormal) * 0.62 + 0.38, 0.0);',
    '            float radius = (light.radius / res.x * uCamera.w) * uCamera.w;',
    '            float attenuation = clamp(1.0 - distToSurf * distToSurf / (radius * radius), 0.0, 1.0);',
    '            vec3 diffuse = light.color * diffuseFactor;',
    '            finalColor += (attenuation * diffuse) * light.intensity;',
    '        }',
    '    }',
    '    vec4 colorOutput = vec4(uAmbientLightColor + finalColor, 1.0);',
    '    gl_FragColor = color * vec4(colorOutput.rgb * colorOutput.a, colorOutput.a);',
    '}',
].join("\n");

export class PosterLightPipeline extends Phaser.Renderer.WebGL.Pipelines.LightPipeline {
  constructor(game: Phaser.Game) {
    super({ game, fragShader: POSTER_LIGHT_FRAG });
  }
}

/** Registers the pipeline on the renderer and returns the instance. */
export function installPosterPipeline(game: Phaser.Game): PosterLightPipeline {
  const pipeline = new PosterLightPipeline(game);
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  renderer.pipelines.add("PosterLight", pipeline);
  return pipeline;
}
