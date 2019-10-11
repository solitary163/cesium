/**
 * @author ljh
 */
export default "attribute vec3 position;\n\
uniform mat4 u_modelViewMatrix;\n\
void main()\n\
{\n\
    gl_Position = czm_projection* u_modelViewMatrix* vec4(position.xyz,1.0);\n\
}";
