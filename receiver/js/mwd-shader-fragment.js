var MWD_SHADER_FRAGMENT =

`
uniform float       modelColorR;
uniform float       modelColorG;
uniform float       modelColorB;

void main() {
    gl_FragColor = vec4(modelColorR, modelColorG, modelColorB, 0.0);
}
`;