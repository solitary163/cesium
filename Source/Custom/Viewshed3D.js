/**
 * @author ljh
 */

import BoundingSphere from '../Core/BoundingSphere';
import Cartesian2 from '../Core/Cartesian2';
import Cartesian3 from '../Core/Cartesian3';
import ComponentDatatype from '../Core/ComponentDatatype';
import defined from '../Core/defined';
import Ray from '../Core/Ray';
import Color from '../Core/Color';
import BoundingRectangle from '../Core/BoundingRectangle';
import destroyObject from '../Core/destroyObject';
import defineProperties from '../Core/defineProperties';
import IndexDatatype from '../Core/IndexDatatype';
import Intersect from '../Core/Intersect';
import CesiumMath from '../Core/Math';
import Matrix4 from '../Core/Matrix4';
import PixelFormat from '../Core/PixelFormat';
import PrimitiveType from '../Core/PrimitiveType';
import ScreenSpaceEventHandler from '../Core/ScreenSpaceEventHandler';
import ScreenSpaceEventType from '../Core/ScreenSpaceEventType';
import Transforms from '../Core/Transforms';
import Buffer from '../Renderer/Buffer';
import BufferUsage from '../Renderer/BufferUsage';
import ClearCommand from '../Renderer/ClearCommand';
import DrawCommand from '../Renderer/DrawCommand';
import Framebuffer from '../Renderer/Framebuffer';
import Pass from '../Renderer/Pass';
import PassState from '../Renderer/PassState';
import PixelDatatype from '../Renderer/PixelDatatype';
import RenderState from '../Renderer/RenderState';
import Sampler from '../Renderer/Sampler';
import ShaderProgram from '../Renderer/ShaderProgram';
import ShaderSource from '../Renderer/ShaderSource';
import Texture from '../Renderer/Texture';
import TextureMagnificationFilter from '../Renderer/TextureMagnificationFilter';
import TextureMinificationFilter from '../Renderer/TextureMinificationFilter';
import VertexArray from '../Renderer/VertexArray';
import BlendingState from '../Scene/BlendingState';
import Camera from '../Scene/Camera';
import FrameState from '../Scene/FrameState';
import ViewshedLineFS from './ViewshedLineFS';
import ViewshedLineVS from './ViewshedLineVS';

FrameState.prototype.viewshed3ds = [];
Camera.prototype.workingFrustums = [];

var _viewer,
    _scene,
    _screenSpaceEvnentHandler;

function addPoint(position, text, color) {
    let entity = _viewer.entities.add({
        show: true,
        position: position,
        point: {
            pixelSize: 4,
            outlineWidth: 1,
            color: color,
            show: true,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }/*,
            label: {
                show: true,
                font: '14px 黑体',
                text: text,
                pixelOffset: new Cartesian2(0, -20),
                showBackground: true,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            }//*/
    });

    return entity;
}

/**
 * 构造函数
 *
 * @param {Object} options 选项
 */
function Viewshed3D(options) {
    this._initialized = false;
    this._cameraUpdated = false;
    this._hintLineUpdated = false;

    this._depthCamera = null;
    this._depthPassState = null;

    this._viewer = options.viewer;
    this._scene = options.viewer.scene;

    this._positions = null;
    this._indices = null;
    this._drawLineCommand = null;

    this._viewerPosition = new Cartesian3(0.0, 0.0, 0.0);
    this._targetPoint = new Cartesian3(0.0, 0.0, 0.0);
    this._modelMatrix = new Matrix4();
    this._direction = 0.0;
    this._pitch = 0.0;
    this._horizontalFov = 60.0;
    this._verticalFov = 60.0;
    this._distance = 100.0,
        this._visibleAreaColor = new Color(0.0, 1.0, 0.0, 0.5);
    this._hiddenAreaColor = new Color(1.0, 0.0, 0.0, 0.5);
    this._lineColor = Color.YELLOW;

    this._textureViewMatrix = new Matrix4();
    this._textureProjMatrix = new Matrix4();

    this._resultFrameBuffer = [];
    this._resultTextures = [];
    this._lastResultTexture = null;

    this._mapDrawCommand = null;
    this._analysisCommand = null;

    this._valid = false;

    this._parentViewshed = null;
    this._childViewsheds = [];

    this._depthStencilTexture = null;
    this._canRenderDepth = false;
}

function createAnalysisCommand(owner, context) {
    var renderState = RenderState.fromCache({
        depthTest: {
            enabled: false
        },
        depthMask: false
    });
    //var fragmentShader = "precision highp float;\n\nuniform sampler2D u_sceneDepthTexture;\nuniform sampler2D u_depthTexture;\nuniform sampler2D u_lastResultTexture;\nuniform mat4 u_textureViewMatrix;\nuniform mat4 u_textureProjMatrix;\nuniform float u_farDist;\nuniform vec4 u_visibleAreaColor;\nuniform vec4 u_hiddenAreaColor;\n\nvarying vec2 v_textureCoordinates;\n\nvoid main()\n{\n    // result.x: 0-不在可视域范围内，0.5-不可见，1.0-可见。\n    vec4 result = texture2D(u_lastResultTexture, v_textureCoordinates);\n    // 可见就直接赋值为可见。\n    if (result.x != 1.0) {\n       float sceneDepth = czm_unpackDepth(texture2D(u_sceneDepthTexture, v_textureCoordinates));\n       sceneDepth = sceneDepth>0.0 ? sceneDepth : 1.0;\n       vec4 projPos = vec4(v_textureCoordinates*2.0-1.0, sceneDepth*2.0-1.0, 1.0);\n       vec4 texViewPos = u_textureViewMatrix * projPos;\n       vec4 texProjPos = u_textureProjMatrix * texViewPos;\n       texProjPos /= texProjPos.w;\n       texProjPos.xyz = texProjPos.xyz * 0.5 + 0.5;\n\n       // 计算最远距离的深度\n       texViewPos /= texViewPos.w;\n       texViewPos.xyz *= u_farDist / length(texViewPos.xyz);\n       vec4 farPos = u_textureProjMatrix * texViewPos;\n       float farDepth = farPos.z / farPos.w;\n       farDepth = farDepth * 0.5 + 0.5;\n       farDepth = min(farDepth, 1.0);\n\n       if (texProjPos.x > 0.0 && texProjPos.x < 1.0 &&\n           texProjPos.y > 0.0 && texProjPos.y < 1.0 &&\n           texProjPos.z > 0.5 && texProjPos.z < farDepth) {\n           float depth = texture2D(u_depthTexture, texProjPos.xy).r;\n           if (depth < 1.0 && depth - texProjPos.z < -1.0e-5) {\n               result.x = 0.5;\n           } else {\n               result.x = 1.0;\n           }\n       }\n   }\n   gl_FragColor = result;\n}";
    var fragmentShader = `
precision highp float;
uniform sampler2D u_sceneDepthTexture;
uniform sampler2D u_depthTexture;
uniform sampler2D u_lastResultTexture;
uniform mat4 u_textureViewMatrix;
uniform mat4 u_textureProjMatrix;
uniform float u_farDist;
uniform vec4 u_visibleAreaColor;
uniform vec4 u_hiddenAreaColor;
varying vec2 v_textureCoordinates;
void main()
{
    // result.x: 0-不在可视域范围内，0.5-不可见，1.0-可见。
    vec4 result = texture2D(u_lastResultTexture, v_textureCoordinates);
    // 可见就直接赋值为可见。
    if (result.x != 1.0) {
        float sceneDepth = czm_unpackDepth(texture2D(u_sceneDepthTexture, v_textureCoordinates));
        sceneDepth = sceneDepth>0.0 ? sceneDepth : 1.0;
        vec4 projPos = vec4(v_textureCoordinates*2.0-1.0, sceneDepth*2.0-1.0, 1.0);
        vec4 texViewPos = u_textureViewMatrix * projPos;
        vec4 texProjPos = u_textureProjMatrix * texViewPos;
        texProjPos /= texProjPos.w;
        texProjPos.xyz = texProjPos.xyz * 0.5 + 0.5;

        // 计算最远距离的深度
        texViewPos /= texViewPos.w;
        texViewPos.xyz *= u_farDist / length(texViewPos.xyz);
        vec4 farPos = u_textureProjMatrix * texViewPos;
        float farDepth = farPos.z / farPos.w;
        farDepth = farDepth * 0.5 + 0.5;
        farDepth = min(farDepth, 1.0);

        if (texProjPos.x > 0.0 && texProjPos.x < 1.0 &&
            texProjPos.y > 0.0 && texProjPos.y < 1.0 &&
            texProjPos.z > 0.5 && texProjPos.z < farDepth) {
            float depth = czm_unpackDepth(u_depthTexture, texProjPos.xy);//texture2D(u_depthTexture, texProjPos.xy).r;
            if (depth < 1.0 && depth - texProjPos.z < -1.0e-5) {
                result.x = 0.5;
            } else {
                result.x = 1.0;
            }
        }
    }
    gl_FragColor = result;
}`;
    var fragmentShaderSource = new ShaderSource({
        sources: [fragmentShader]
    });
    var uniformMap = {
        u_sceneDepthTexture: function() {
            //debugger;
            return owner._viewer.scene._view.pickDepths[0]._depthTexture;
            //return owner._depthStencilTexture;
        },
        u_depthTexture: function() {
            return owner._depthPassState.framebuffer.depthStencilTexture;
        },
        u_lastResultTexture: function() {
            return owner._lastResultTexture;
        },
        u_textureViewMatrix: function() {
            return owner._textureViewMatrix;
        },
        u_textureProjMatrix: function() {
            return owner._textureProjMatrix;
        },
        u_farDist: function() {
            return owner._distance;
        }
    };

    return context.createViewportQuadCommand(fragmentShaderSource, {
        renderState: renderState,
        uniformMap: uniformMap,
        owner: owner,

        pass: Pass.OPAQUE
    });
}

function createMapDrawCommand(owner, context) {
    var renderState = RenderState.fromCache({
        depthTest: {
            enabled: false
        },
        depthMask: false,
        blending: BlendingState.ALPHA_BLEND
    });
    //var fragmentShader = "precision highp float;\n\nuniform sampler2D u_resultTexture;\nuniform vec4 u_visibleAreaColor;\nuniform vec4 u_hiddenAreaColor;\n\nvarying vec2 v_textureCoordinates;\n\nvoid main()\n{\n    vec4 color = vec4(0.0);\n    // result.x: 0-不在可视域范围内，0.5-不可见，1.0-可见。\n    vec4 result = texture2D(u_resultTexture, v_textureCoordinates);\n    if (result.x > 0.9)\n       color = u_visibleAreaColor;\n    else if (result.x > 0.4)\n       color = u_hiddenAreaColor;\n    gl_FragColor = color;\n}";
    var fragmentShader = `
precision highp float;
uniform sampler2D u_resultTexture;
uniform vec4 u_visibleAreaColor;
uniform vec4 u_hiddenAreaColor;
varying vec2 v_textureCoordinates;
void main()
{
    vec4 color = vec4(0.0);
    // result.x: 0-不在可视域范围内，0.5-不可见，1.0-可见。
    vec4 result = texture2D(u_resultTexture, v_textureCoordinates);
    if (result.x > 0.9)
    {
        color = u_visibleAreaColor;
    }
    else if (result.x > 0.4)
    {
        color = u_hiddenAreaColor;
    }
    else
    {
        color = vec4(0.0, 0.0, 1.0, 0.5);
    }

    gl_FragColor = color;
}`;
    var fragmentShaderSource = new ShaderSource({
        sources: [fragmentShader]
    });
    var uniformMap = {
        u_resultTexture: function() {
            return owner._lastResultTexture;
        },
        u_visibleAreaColor: function() {
            return owner._visibleAreaColor;
        },
        u_hiddenAreaColor: function() {
            return owner._hiddenAreaColor;
        }
    };

    return context.createViewportQuadCommand(fragmentShaderSource, {
        renderState: renderState,
        uniformMap: uniformMap,
        owner: owner,

        pass: Pass.OPAQUE
    });
}

defineProperties(Viewshed3D.prototype, {
    viewerPosition: {
        get: function() {
            return this._viewerPosition;
        },
        set: function(position) {
            this._viewerPosition = position;
            this._cameraUpdated = false;
        }
    },
    direction: {
        get: function() {
            return this._direction;
        },
        set: function(direction) {
            this._direction = direction;
            this._cameraUpdated = false;
        }
    },
    pitch: {
        get: function() {
            return this._pitch;
        },
        set: function(pitch) {
            this._pitch = pitch;
            this._cameraUpdated = false;
        }
    },
    distance: {
        get: function() {
            return this._distance;
        },
        set: function(distance) {
            this._distance = distance;
            this._cameraUpdated = false;
            this._hintLineUpdated = false;
        }
    }
});

Viewshed3D.prototype.setPoseByTargetPoint = function(targetPosition) {
    this.distance = Cartesian3.distance(this._viewerPosition, targetPosition);
    var modelMatrix = Transforms.eastNorthUpToFixedFrame(this._viewerPosition);
    Matrix4.inverse(modelMatrix, modelMatrix);
    var normal = new Cartesian3();
    Matrix4.multiplyByPoint(modelMatrix, targetPosition, normal);
    Cartesian3.normalize(normal, normal);
    this.direction = CesiumMath.toDegrees(Math.asin(normal.x, normal.y));
    this.pitch = CesiumMath.toDegrees(Math.asin(normal.z));
};

/**
 * 更新，primitive继承方法
 */
Viewshed3D.prototype.update = function(frameState) {
    frameState.viewshed3ds.length = 0;
    frameState.viewshed3ds.push(this);
    if (this._drawLineCommand && frameState.passes.render) {
        //this._updateHintLine(frameState);
        frameState.commandList.push(this._drawLineCommand);
        //return;
        if (this._canRenderDepth && this._analysisCommand && this._mapDrawCommand) {
            frameState.commandList.push(this._analysisCommand);
            frameState.commandList.push(this._mapDrawCommand);
        }
    }
};

/**
 * 初始化
 *
 * @private
 */
Viewshed3D.prototype._initialize = function() {
    this._positions = new Float32Array(633);
    this._indices = new Uint16Array(408);
    var t = this._indices,
        r = 0;
    t[r++] = 0, t[r++] = 1, t[r++] = 0, t[r++] = 21, t[r++] = 0, t[r++] = 85, t[r++] = 0, t[r++] = 105;
    for (var i = 0, n = 0; n < 5; ++n) {
        i++;
        for (var a = 0; a < 20; ++a) t[r++] = i++ , t[r++] = i
    }
    i++;
    for (var s = 0; s < 20; ++s)
        for (var l = 0; l < 5; ++l) t[r++] = i, t[r++] = i++ + 5;

    var scene = this._viewer.scene,
        context = scene.context,
        width = 2048,
        height = 2048;
    if (defined(this._depthCamera)
        || (this._depthCamera = new Camera(scene), !defined(this._depthPassState))) {
        var frameBuffer = new Framebuffer({
            context: context,
            depthStencilTexture: new Texture({
                context: context,
                width: width,
                height: height,
                pixelFormat: PixelFormat.DEPTH_STENCIL,
                pixelDatatype: PixelDatatype.UNSIGNED_INT_24_8
            })
        });
        this._depthPassState = new PassState(context);
        this._depthPassState.viewport = new BoundingRectangle(0, 0, width, height);
        this._depthPassState.framebuffer = frameBuffer;
    }
    this._initialized = true;

    /*
    var context = this.scene._context;
    this._depthCamera = new Camera(this.scene);
    this._depthPassState = new PassState(context);
    var width = 2048,
        height = 2048;
    this._depthPassState.viewport = new BoundingRectangle(0, 0, witdh, height);
    this._depthPassState.framebuffer = new Framebuffer({
        context: context,
        depthStencilTexture: new Texture({
            context: context,
            width: width,
            height: height,
            pixelFormat: PixelFormat.DEPTH_STENCIL,
            pixelDatatype: PixelDatatype.UNSIGNED_INT_24_8
        })
    });

    this._initialized = true;
    //*/
};

/**
 * 更新深度相机
 *
 * @private
 */
Viewshed3D.prototype._updateCamera = function() {
    this._depthCamera.frustum.near = 0.001 * this._distance;
    this._depthCamera.frustum.far = this._distance;
    this._depthCamera.frustum.fov = CesiumMath.toRadians(this._verticalFov);
    this._depthCamera.frustum.aspectRatio = this._horizontalFov / this._verticalFov;
    this._depthCamera.setView({
        destination: this._viewerPosition,
        orientation: {
            heading: CesiumMath.toRadians(this._direction),
            pitch: CesiumMath.toRadians(this._pitch)
        }
    });
    this._modelMatrix = this._depthCamera.inverseViewMatrix;

    this._cameraUpdated = true;
};

/**
 * 更新提示线
 *
 * @private
 */
Viewshed3D.prototype._updateHintLine = function(e) {
    //debugger;
    var i, a, s, d, p = this._positions,
        m = CesiumMath.toRadians(this._horizontalFov),
        v = CesiumMath.toRadians(this._verticalFov),
        b = Math.tan(0.5 * m),
        S = Math.tan(0.5 * v);
    a = this._distance * b;
    d = this._distance * S;
    i = -a, s = -d;
    var w = new Cartesian3(i, s, -this._distance),
        E = new Cartesian3(a, d, 0);
    Matrix4.multiplyByPoint(this._modelMatrix, w, w);
    Matrix4.multiplyByPoint(this._modelMatrix, E, E);
    var x = BoundingSphere.fromCornerPoints(w, E);
    if (e.cullingVolume.computeVisibility(x) === Intersect.OUTSIDE) {
        this._valid = false;
        return null;
        //return void(this._valid = !1);
    }
    this._valid = true;
    var P = 0;
    p[P++] = 0, p[P++] = 0, p[P++] = 0;
    for (var D, I, M = Math.PI - 0.5 * m, R = m / 4, L = 0; L < 5; ++L) {
        D = M + L * R;
        for (var B = d / (this._distance / Math.cos(D)), F = Math.atan(B), U = -F, V = F / 10, z = 0; z < 21; ++z) I = U + z * V, p[P++] = this._distance * Math.cos(I) * Math.sin(D), p[P++] = this._distance * Math.sin(I), p[P++] = this._distance * Math.cos(I) * Math.cos(D)
    }
    R = m / 20;
    for (var G = 0; G < 21; ++G) {
        D = M + G * R;
        for (var B = d / (this._distance / Math.cos(D)), F = Math.atan(B), U = -F, V = F / 2, H = 0; H < 5; ++H) I = U + H * V, p[P++] = this._distance * Math.cos(I) * Math.sin(D), p[P++] = this._distance * Math.sin(I), p[P++] = this._distance * Math.cos(I) * Math.cos(D)
    }

    var context = e.context,//W = e.context,
        indexBuffer = Buffer.createIndexBuffer({
            context: context,
            typedArray: new Uint32Array(this._indices),
            usage: BufferUsage.STATIC_DRAW,
            indexDatatype: IndexDatatype.UNSIGNED_INT
        }),
        vertexBuffer = Buffer.createVertexBuffer({
            context: context,
            typedArray: ComponentDatatype.createTypedArray(ComponentDatatype.FLOAT, this._positions),
            usage: BufferUsage.STATIC_DRAW
        }),
        attributes = [];
    attributes.push({
        index: 0,
        vertexBuffer: vertexBuffer,
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        normalize: false
    });
    var vertexArray = new VertexArray({
        context: context,
        attributes: attributes,
        indexBuffer: indexBuffer
    });
    if (defined(this._drawLineCommand)) {
        this._drawLineCommand.vertexArray.destroy();
        this._drawLineCommand.vertexArray = vertexArray;
        this._drawLineCommand.modelMatrix = this._modelMatrix;
        this._drawLineCommand.boundingVolume = x;
    } else {
        var shaderProgram = ShaderProgram.fromCache({
            context: context,
            vertexShaderSource: ViewshedLineVS,
            fragmentShaderSource: ViewshedLineFS
        }),
            renderState = RenderState.fromCache({
                depthTest: {
                    enabled: true
                },
                depthMask: true
            }),
            K = this,
            uniformMap = {
                u_bgColor: function() {
                    return K._lineColor
                },
                u_modelViewMatrix: function() {
                    return context.uniformState.modelView
                }
            };
        this._drawLineCommand = new DrawCommand({
            //debugShowBoundingVolume: true,
            //executeInClosestFrustum: true,

            owner: this,
            boundingVolume: x,
            modelMatrix: K._modelMatrix,
            primitiveType: PrimitiveType.LINES,
            vertexArray: vertexArray,
            shaderProgram: shaderProgram,
            castShadows: false,
            receiveShadows: false,
            uniformMap: uniformMap,
            renderState: renderState,
            pass: Pass.OPAQUE
        });
    }
    this._hintLineUpdated = true;
};

Viewshed3D.prototype.updateDepthMap = function(e) {
    if (0.0 !== this._distance) {
        this._initialized || this._initialize();
        this._cameraUpdated || this._updateCamera();
        var frameState = this._viewer.scene._frameState;
        if ((this._hintLineUpdated || this._updateHintLine(frameState)) && this._valid) {
            /*
            var scene = this._scene,
                frameState = this._scene._frameState;//*/
            Matrix4.multiply(e.camera.workingFrustums[0].projectionMatrix, e.camera.viewMatrix, this._textureViewMatrix);
            Matrix4.inverse(this._textureViewMatrix, this._textureViewMatrix);
            Matrix4.multiply(this._depthCamera.viewMatrix, this._textureViewMatrix, this._textureViewMatrix);
            Matrix4.clone(this._depthCamera.frustum.projectionMatrix, this._textureProjMatrix);
            var clearCommand = new ClearCommand({
                depth: 1.0,
                framebuffer: this._depthPassState.framebuffer
            });

            this._scene.renderDepth(clearCommand, this._depthPassState, this._depthCamera);
        }
    }
};


Viewshed3D.prototype.execute = function(context, passState) { // e, t
    this._depthStencilTexture = passState.framebuffer.depthStencilTexture;


    if (0 !== this._distance && this._valid && context.draw(this._drawLineCommand, passState), !defined(this._parentViewshed)) {
        var width = passState.viewport.width,       // r
            height = passState.viewport.height;        // n
        if (0 === this._resultTextures.length || this._resultTextures[0].width != width || this._resultTextures[0].height != height) {
            this._resultTextures = [];
            this._resultFrameBuffer = [];
            for (var sampler = new Sampler({
                minificationFilter: TextureMinificationFilter.NEAREST,
                magnificationFilter: TextureMagnificationFilter.NEAREST
            }), s = 0; s < 2; ++s) {
                var texture = new Texture({
                    context: context,
                    width: width,
                    height: height,
                    pixelFormat: PixelFormat.RGBA,
                    pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
                    sampler: sampler
                });
                this._resultTextures.push(texture);
                var frameBuffer = new Framebuffer({
                    context: context,
                    colorTextures: [texture]
                });
                this._resultFrameBuffer.push(frameBuffer)
            }
        }
        // new ClearCommand
        var clearCommand = new ClearCommand({   // c
            color: Color.BLACK,
            framebuffer: this._resultFrameBuffer[0]
        });
        clearCommand.execute(context);
        this._lastResultTexture = this._resultTextures[0];
        this._doAnalysis(this, clearCommand, context);
        for (var s = 0; s < this._childViewsheds.length; ++s) {
            this._doAnalysis(this._childViewsheds[s], clearCommand, context);
        }
        defined(this._mapDrawCommand) || (this._mapDrawCommand = createMapDrawCommand(this, context));
        // 按指定颜色绘制区域
        //let passStateScene = this._viewer.scene._view.passState;
        context.draw(this._mapDrawCommand, passState);

        this._canRenderDepth = true;
    }
};

Viewshed3D.prototype._doAnalysis = function(owner, clearCommand, context) { // e, t, r
    if (owner._valid) {
        var frameBuffer = (this._lastResultTexture !== this._resultTextures[0]) ? this._resultFrameBuffer[0] : this._resultFrameBuffer[1];
        clearCommand.framebuffer = frameBuffer;
        clearCommand.execute(context);
        defined(owner._analysisCommand) || (owner._analysisCommand = createAnalysisCommand(owner,/* this, */context));
        owner._analysisCommand.framebuffer = frameBuffer;
        context.draw(owner._analysisCommand);
        this._lastResultTexture = frameBuffer._colorTextures[0];
    }
};

/**
 * 销毁
 */
Viewshed3D.prototype.destroy = function() {
    _screenSpaceEvnentHandler && _screenSpaceEvnentHandler.destroy();

    _screenSpaceEvnentHandler = null;
    _viewer = null;
    _scene = null;

    return destroyObject(this);
};

Viewshed3D.prototype.isViewshed = true;

export default Viewshed3D;
