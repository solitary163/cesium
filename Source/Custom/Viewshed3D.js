import defaultValue from '../core/defaultValue.js';
import defined from '../Core/defined.js';
import defineProperties from '../Core/defineProperties.js';
import createPropertyDescriptor from '../DataSources/createPropertyDescriptor.js';
import createMaterialPropertyDescriptor from '../DataSources/createMaterialPropertyDescriptor.js';
import Event from '../Core/Event.js';
import CesiumMath from '../Core/Math.js';
import Cartesian2 from '../Core/Cartesian2.js';
import Cartesian3 from '../Core/Cartesian3.js';
import Cartesian4 from '../Core/Cartesian4.js';
import Cartographic from '../Core/Cartographic.js';
import SceneMode from '../Scene/SceneMode.js';
import Matrix3 from '../Core/Matrix3.js';
import Matrix4 from '../Core/Matrix4.js';
import Intersect from '../Core/Intersect.js';
import Quaternion from '../Core/Quaternion.js';
import Rectangle from '../Core/Rectangle.js';
import Color from '../Core/Color.js';
import Camera from '../Scene/Camera.js';
import PerspectiveFrustum from '../Core/PerspectiveFrustum.js';
import BoundingSphere from '../Core/BoundingSphere.js';
import Buffer from '../Renderer/Buffer.js';
import BufferUsage from '../Renderer/BufferUsage.js';
import RenderState from '../Renderer/RenderState.js';
import VertexArray from '../Renderer/VertexArray.js';
import ShaderProgram from '../Renderer/ShaderProgram.js';
import DrawCommand from '../Renderer/DrawCommand.js';
import Pass from '../Renderer/Pass.js';
import PrimitiveType from '../Core/PrimitiveType.js';
import ComponentDatatype from '../Core/ComponentDatatype.js';
import IndexDatatype from '../Core/IndexDatatype.js';
import ShadowMap from '../Scene/ShadowMap.js';
import PostProcessStage from '../Scene/PostProcessStage.js';
import ScreenSpaceEventType from '../Core/ScreenSpaceEventType.js';
import ScreenSpaceEventHandler from '../Core/ScreenSpaceEventHandler.js';
import Texture from '../Renderer/Texture.js';

import ViewshedLineVS from './ViewshedLineVS.js';
import ViewshedLineFS from './ViewshedLineFS.js';

//import DebugCameraPrimitive from '../Scene/DebugCameraPrimitive.js';

Camera.DEFAULT_VIEW_RECTANGLE = Rectangle.fromDegrees(89.5, 20.4, 110.4, 61.2);

var defaultOptions = {
    cameraPosition: null,
    viewPosition: null,
    horizontalAngle: 120,
    verticalAngle: 90,
    visibleAreaColor: new Color(0, 1, 0),
    hiddenAreaColor: new Color(1, 0, 0),
    alpha: 0.5,
    distance: 100,
    frustum: true,
    show: true
};

/**
 * 构造函数
 *
 * @alias ViewShed3D
 * @constructor
 *
 * @param {Viewer} viewer Viewer对象
 * @param {Object} options 选项
 */
function ViewShed3D(viewer, options) {//e(t, i) {
    if (!defined(viewer)) return;
    var opts = options || {};
    this.viewer = viewer;
    this.cameraPosition = defaultValue(opts.cameraPosition, defaultOptions.cameraPosition);
    this.viewPosition = defaultValue(opts.viewPosition, defaultOptions.viewPosition);
    this._horizontalAngle = defaultValue(opts.horizontalAngle, defaultOptions.horizontalAngle);
    this._verticalAngle = defaultValue(opts.verticalAngle, defaultOptions.verticalAngle);
    this._visibleAreaColor = defaultValue(opts.visibleAreaColor, defaultOptions.visibleAreaColor);
    this._hiddenAreaColor = defaultValue(opts.hiddenAreaColor, defaultOptions.hiddenAreaColor);
    this._alpha = defaultValue(opts.alpha, defaultOptions.alpha);
    this._lineColor = new Color(1, 1, 1);
    this._distance = defaultValue(opts.distance, defaultOptions.distance);
    this._frustum = defaultValue(opts.frustum, defaultOptions.frustum);
    this.defaultShow = defaultValue(opts.show, true);
    this.calback = opts.calback;
    this._defaultColorTexture = new Texture({
        context: this.viewer.scene.context,
        source: {
            width: 1,
            height: 1,
            arrayBufferView: new Uint8Array([0, 0, 0, 0])
        },
        flipY: false
    });

    if (this.cameraPosition && this.viewPosition) {
        this._addToScene();
        this.calback && this.calback();
    } else {
        this._bindMouseEvent();
    }

    this._initialize();

    this.viewer.scene.primitives.add(this);
};

defineProperties(ViewShed3D.prototype, {
    horizontalAngle: {
        get: function() {
            return this._horizontalAngle;
        },
        set: function(value) {
            this._horizontalAngle = value;
            //this._updateHintLine();
        }
    },
    verticalAngle: {
        get: function() {
            return this._verticalAngle;
        },
        set: function(value) {
            this._verticalAngle = value;
            //this._updateHintLine();
        }
    },
    distance: {
        get: function() {
            return this._distance;
        },
        set: function(value) {
            this._distance = value;
            //this._updateHintLine();
        }
    }
});

ViewShed3D.prototype.update = function(frameState) {
    this.viewShadowMap && frameState.shadowMaps.push(this.viewShadowMap);
    if (this._drawLineCommand && frameState.passes.render) {
        frameState.commandList.push(this._drawLineCommand);
        // console.log('draw line command');
    }
    //console.log('Primitive update()', frameState);
};

ViewShed3D.prototype.getFrustumQuaternion = function(e, t) {
    var i = Cartesian3.normalize(Cartesian3.subtract(t, e, new Cartesian3(0, 0, 0)), new Cartesian3(0, 0, 0)),
        n = Cartesian3.normalize(e, new Cartesian3(0, 0, 0)),
        r = new Camera(this.viewer.scene);
    r.position = e;
    r.direction = i;
    r.up = n;
    i = r.directionWC;
    n = r.upWC;
    var a = r.rightWC,
        o = new Cartesian3,
        l = new Matrix3,
        u = new Quaternion;
    a = Cartesian3.negate(a, o);
    var d = l;
    return Matrix3.setColumn(d, 0, a, d), Matrix3.setColumn(d, 1, n, d), Matrix3.setColumn(d, 2, i, d), Quaternion.fromRotationMatrix(d, u);
};

function f(e, t) {
    if (defined(e.id)) {
        var i = e.id;
        if (i._noMousePosition) return !1;
        if (t && i == t) return !1
    }
    if (defined(e.primitive)) {
        var n = e.primitive;
        if (n._noMousePosition) return !1;
        if (t && n == t) return !1
    }
    return !0
}

function getCurrentMousePosition(e, t, i) {
    var n, r = e.pick(t);
    if (e.pickPositionSupported && defined(r) && f(r, i)) {
        var n = e.pickPosition(t);
        if (defined(n)) {
            var a = Cartographic.fromCartesian(n);
            if (a.height >= 0) return n;
            if (!defined(r.id) && a.height >= -500) return n
        }
    }
    if (e.mode === SceneMode.SCENE3D) {
        var o = e.camera.getPickRay(t);
        n = e.globe.pick(o, e)
    } else n = e.camera.pickEllipsoid(t, e.globe.ellipsoid);
    if (defined(n) && e.camera.positionCartographic.height < 1e4) {
        var a = Cartographic.fromCartesian(n);
        if (a.height < -5e3) return null
    }
    return n
}

/**
 * 绑定鼠标事件
 */
ViewShed3D.prototype._bindMouseEvent = function() {
    var self = this, // e = this,
        viewer = this.viewer,//t = this.viewer,
        handler = new ScreenSpaceEventHandler(this.viewer.scene.canvas);
    handler.setInputAction(function(e) {
        var curPosition = getCurrentMousePosition(viewer.scene, e.position);
        if (curPosition) {
            if (self.cameraPosition) {
                if (self.cameraPosition && !self.viewPosition) {

                    self.viewPosition = curPosition;
                    self._addToScene();
                    self._updateHintLine();
                    self._unbindMouseEvent();
                    self.calback && self.calback();

                    // 更新格网线
                    // 设置格网参数
                    console.log('MOUSE_CLICK 观察点位置', self.distance, curPosition);
                }
            } else {
                self.cameraPosition = curPosition;

                console.log('MOUSE_CLICK 相机位置', curPosition);
            }
        }
    }, ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction(function(e) {
        //return;
        var curPosition = getCurrentMousePosition(viewer.scene, e.endPosition),
            cameraPosition = self.cameraPosition;
        if (curPosition && cameraPosition) {
            self.frustumQuaternion = self.getFrustumQuaternion(cameraPosition, curPosition);
            self.distance = Number(Cartesian3.distance(cameraPosition, curPosition).toFixed(1));

            self._updateLightCamera(cameraPosition, curPosition);
            //console.log('MOUSE_MOVE', self.distance);
        }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    this._handler = handler;
};

ViewShed3D.prototype._unbindMouseEvent = function() {
    null != this._handler && (this._handler.destroy(), delete this._handler);
};

/**
 * 添加到场景
 *
 * @private
 */
ViewShed3D.prototype._addToScene = function() {
    this.frustumQuaternion = this.getFrustumQuaternion(this.cameraPosition, this.viewPosition);
    // 添加阴影图
    this._createShadowMap(this.cameraPosition, this.viewPosition);
    // 添加后期处理
    this._addPostProcess();
    //
    //!this.radar && this.addRadar(this.cameraPosition, this.frustumQuaternion);
    // 添加primitive
    //this.viewer.scene.primitives.add(this);
};

ViewShed3D.prototype._updateLightCamera = function(fromPosition, toPosition) {
    console.log('_updateLightCamera', fromPosition, toPosition);
    var lightCamera = this._lightCamera;
    if (!defined(lightCamera)) {
        lightCamera = this._lightCamera = new Camera(this.viewer.scene);
        lightCamera.frustum = new PerspectiveFrustum();
    }

    var cameraFrustum = lightCamera.frustum;
    cameraFrustum.near = 0.1;
    cameraFrustum.far = this.distance;
    cameraFrustum.fov = CesiumMath.toRadians(this.verticalAngle);
    cameraFrustum.aspectRatio = this.horizontalAngle / this.verticalAngle;
    lightCamera.setView({
        destination: fromPosition,
        orientation: {
            direction: Cartesian3.normalize(Cartesian3.subtract(toPosition, fromPosition, new Cartesian3(0, 0, 0)), new Cartesian3(0, 0, 0)),
            up: Cartesian3.normalize(fromPosition, new Cartesian3(0, 0, 0))
        }
    });

    this._modelMatrix = lightCamera.inverseViewMatrix;

    this._updateHintLine();
};

/**
 * 创建ShadowMap
 *
 * @private
 */
ViewShed3D.prototype._createShadowMap = function(fromPosition, toPosition) {
    var scene = this.viewer.scene;
    //this._updateLightCamera(fromPosition, toPosition);
    this.viewShadowMap = new ShadowMap({
        lightCamera: this._lightCamera,
        //enable: false,
        enable: false,
        isPointLight: false,
        isSpotLight: true,
        cascadesEnabled: false,
        context: scene.context,
        pointLightRadius: this.distance,


        maximumDistance: 2000,
        softShadows: false,
        darkness: 0.3,
        normalOffset: true
    });
    // this.viewShadowMap.debugShow = true;
    // this.viewer.scene.primitives.add(new DebugCameraPrimitive({
    //     camera: this._lightCamera,
    //     color: Color.YELLOW
    // }));
};

/**
 * 添加后期处理
 *
 * @private
 */
ViewShed3D.prototype._addPostProcess = function() {
    var self = this,
        bias = self.viewShadowMap._isPointLight ? self.viewShadowMap._pointBias : self.viewShadowMap._primitiveBias;
    var fs = `uniform float czzj;
uniform float dis;
uniform float spzj;
uniform vec3 visibleColor;
uniform vec3 disVisibleColor;
uniform float mixNum;
uniform sampler2D colorTexture;
uniform sampler2D stcshadow;
uniform sampler2D depthTexture;
uniform mat4 _shadowMap_matrix;
uniform vec4 shadowMap_lightPositionEC;
uniform vec3 shadowMap_lightPositionWC;
uniform vec4 shadowMap_lightDirectionEC;
uniform vec3 shadowMap_lightUp;
uniform vec3 shadowMap_lightDir;
uniform vec3 shadowMap_lightRight;
uniform vec4 shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness;
uniform vec4 shadowMap_texelSizeDepthBiasAndNormalShadingSmooth;
varying vec2 v_textureCoordinates;
vec4 toEye(in vec2 uv, in float depth){
    vec2 xy = vec2((uv.x * 2.0 - 1.0),(uv.y * 2.0 - 1.0));
    vec4 posInCamera =czm_inverseProjection * vec4(xy, depth, 1.0);
    posInCamera =posInCamera / posInCamera.w;
    return posInCamera;
}
float getDepth(in vec4 depth){
    float z_window = czm_unpackDepth(depth);
    z_window = czm_reverseLogDepth(z_window);
    float n_range = czm_depthRange.near;
    float f_range = czm_depthRange.far;
    return (2.0 * z_window - n_range - f_range) / (f_range - n_range);
}
float _czm_sampleShadowMap(sampler2D shadowMap, vec2 uv){
    return texture2D(shadowMap, uv).r;
}
float _czm_shadowDepthCompare(sampler2D shadowMap, vec2 uv, float depth){
    return step(depth, _czm_sampleShadowMap(shadowMap, uv));
}
float _czm_shadowVisibility(sampler2D shadowMap, czm_shadowParameters shadowParameters){
    float depthBias = shadowParameters.depthBias;
    float depth = shadowParameters.depth;
    float nDotL = shadowParameters.nDotL;
    float normalShadingSmooth = shadowParameters.normalShadingSmooth;
    float darkness = shadowParameters.darkness;
    vec2 uv = shadowParameters.texCoords;
    depth -= depthBias;
    vec2 texelStepSize = shadowParameters.texelStepSize;
    float radius = 1.0;
    float dx0 = -texelStepSize.x * radius;
    float dy0 = -texelStepSize.y * radius;
    float dx1 = texelStepSize.x * radius;
    float dy1 = texelStepSize.y * radius;
    float visibility =
    (
    _czm_shadowDepthCompare(shadowMap, uv, depth)
    +_czm_shadowDepthCompare(shadowMap, uv + vec2(dx0, dy0), depth) +
    _czm_shadowDepthCompare(shadowMap, uv + vec2(0.0, dy0), depth) +
    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx1, dy0), depth) +
    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx0, 0.0), depth) +
    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx1, 0.0), depth) +
    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx0, dy1), depth) +
    _czm_shadowDepthCompare(shadowMap, uv + vec2(0.0, dy1), depth) +
    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx1, dy1), depth)
    ) * (1.0 / 9.0)
    ;
    return visibility;
}
vec3 pointProjectOnPlane(in vec3 planeNormal, in vec3 planeOrigin, in vec3 point){
    vec3 v01 = point -planeOrigin;
    float d = dot(planeNormal, v01) ;
    return (point - planeNormal * d);
}
float ptm(vec3 pt){
    return sqrt(pt.x*pt.x + pt.y*pt.y + pt.z*pt.z);
}
void main()
{
//dfasdfadfadfasdfadfa
    const float PI = 3.141592653589793;
    vec4 color = texture2D(colorTexture, v_textureCoordinates);
    vec4 currD = texture2D(depthTexture, v_textureCoordinates);

    // vec4 stcc = texture2D(stcshadow, v_textureCoordinates);
    // gl_FragColor = currD;
    // return;
    if(currD.r>=1.0){
        gl_FragColor = color;
        return;
    }

    float depth = getDepth(currD);
    // gl_FragColor = vec4(depth,0.0,0.0,1.0);
    // return;
    // float depth = czm_unpackDepth(texture2D(depthTexture, v_textureCoordinates));
    vec4 positionEC = toEye(v_textureCoordinates, depth);
    vec3 normalEC = vec3(1.0);
    czm_shadowParameters shadowParameters;
    shadowParameters.texelStepSize = shadowMap_texelSizeDepthBiasAndNormalShadingSmooth.xy;
    shadowParameters.depthBias = shadowMap_texelSizeDepthBiasAndNormalShadingSmooth.z;
    shadowParameters.normalShadingSmooth = shadowMap_texelSizeDepthBiasAndNormalShadingSmooth.w;
    shadowParameters.darkness = shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness.w;
    shadowParameters.depthBias *= max(depth * 0.01, 1.0);
    vec3 directionEC = normalize(positionEC.xyz - shadowMap_lightPositionEC.xyz);
    float nDotL = clamp(dot(normalEC, -directionEC), 0.0, 1.0);
    vec4 shadowPosition = _shadowMap_matrix * positionEC;
    shadowPosition /= shadowPosition.w;
    if (any(lessThan(shadowPosition.xyz, vec3(0.0))) || any(greaterThan(shadowPosition.xyz, vec3(1.0))))
    {
        gl_FragColor = color;
        return;
    }

    //坐标与视点位置距离，大于最大距离则舍弃阴影效果
    vec4 lw = vec4(shadowMap_lightPositionWC,1.0);
    vec4 vw = czm_inverseView* vec4(positionEC.xyz, 1.0);
    if(distance(lw.xyz,vw.xyz)>dis){
        gl_FragColor = color;
        return;
    }


    //水平夹角限制
    vec3 ptOnSP = pointProjectOnPlane(shadowMap_lightUp,lw.xyz,vw.xyz);
    directionEC = ptOnSP - lw.xyz;
    float directionECMO = ptm(directionEC.xyz);
    float shadowMap_lightDirMO = ptm(shadowMap_lightDir.xyz);
    float cosJJ = dot(directionEC,shadowMap_lightDir)/(directionECMO*shadowMap_lightDirMO);
    float degJJ = acos(cosJJ)*(180.0 / PI);
    degJJ = abs(degJJ);
    if(degJJ>spzj/2.0){
        gl_FragColor = color;
        return;
    }

    //垂直夹角限制
    vec3 ptOnCZ = pointProjectOnPlane(shadowMap_lightRight,lw.xyz,vw.xyz);
    vec3 dirOnCZ = ptOnCZ - lw.xyz;
    float dirOnCZMO = ptm(dirOnCZ);
    float cosJJCZ = dot(dirOnCZ,shadowMap_lightDir)/(dirOnCZMO*shadowMap_lightDirMO);
    float degJJCZ = acos(cosJJCZ)*(180.0 / PI);
    degJJCZ = abs(degJJCZ);
    if(degJJCZ>czzj/2.0){
        gl_FragColor = color;
        return;
    }

    shadowParameters.texCoords = shadowPosition.xy;
    shadowParameters.depth = shadowPosition.z;
    shadowParameters.nDotL = nDotL;
    float visibility = _czm_shadowVisibility(stcshadow, shadowParameters);
    if(visibility==1.0){
        gl_FragColor = mix(color,vec4(visibleColor,1.0),mixNum);
    }else{
        // if(abs(shadowPosition.z-0.0)<0.01){
        //     return;
        // }
        gl_FragColor = mix(color,vec4(disVisibleColor,1.0),mixNum);
    }
}`
    this.postProcess = new PostProcessStage({
        fragmentShader: "uniform float czzj;\r\nuniform float dis;\r\nuniform float spzj;\r\nuniform vec3 visibleColor;\r\nuniform vec3 disVisibleColor;\r\nuniform float mixNum;\r\nuniform sampler2D colorTexture;\r\nuniform sampler2D stcshadow; \r\nuniform sampler2D depthTexture;\r\nuniform mat4 _shadowMap_matrix; \r\nuniform vec4 shadowMap_lightPositionEC; \r\nuniform vec3 shadowMap_lightPositionWC;\r\nuniform vec4 shadowMap_lightDirectionEC;\r\nuniform vec3 shadowMap_lightUp;\r\nuniform vec3 shadowMap_lightDir;\r\nuniform vec3 shadowMap_lightRight;\r\nuniform vec4 shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness; \r\nuniform vec4 shadowMap_texelSizeDepthBiasAndNormalShadingSmooth; \r\nvarying vec2 v_textureCoordinates;\r\nvec4 toEye(in vec2 uv, in float depth){\r\n    vec2 xy = vec2((uv.x * 2.0 - 1.0),(uv.y * 2.0 - 1.0));\r\n    vec4 posInCamera =czm_inverseProjection * vec4(xy, depth, 1.0);\r\n    posInCamera =posInCamera / posInCamera.w;\r\n    return posInCamera;\r\n}\r\nfloat getDepth(in vec4 depth){\r\n    float z_window = czm_unpackDepth(depth);\r\n    z_window = czm_reverseLogDepth(z_window);\r\n    float n_range = czm_depthRange.near;\r\n    float f_range = czm_depthRange.far;\r\n    return (2.0 * z_window - n_range - f_range) / (f_range - n_range);\r\n}\r\nfloat _czm_sampleShadowMap(sampler2D shadowMap, vec2 uv){\r\n    return texture2D(shadowMap, uv).r;\r\n}\r\nfloat _czm_shadowDepthCompare(sampler2D shadowMap, vec2 uv, float depth){\r\n    return step(depth, _czm_sampleShadowMap(shadowMap, uv));\r\n}\r\nfloat _czm_shadowVisibility(sampler2D shadowMap, czm_shadowParameters shadowParameters){\r\n    float depthBias = shadowParameters.depthBias;\r\n    float depth = shadowParameters.depth;\r\n    float nDotL = shadowParameters.nDotL;\r\n    float normalShadingSmooth = shadowParameters.normalShadingSmooth;\r\n    float darkness = shadowParameters.darkness;\r\n    vec2 uv = shadowParameters.texCoords;\r\n    depth -= depthBias;\r\n    vec2 texelStepSize = shadowParameters.texelStepSize;\r\n    float radius = 1.0;\r\n    float dx0 = -texelStepSize.x * radius;\r\n    float dy0 = -texelStepSize.y * radius;\r\n    float dx1 = texelStepSize.x * radius;\r\n    float dy1 = texelStepSize.y * radius;\r\n    float visibility = \r\n    (\r\n    _czm_shadowDepthCompare(shadowMap, uv, depth)\r\n    +_czm_shadowDepthCompare(shadowMap, uv + vec2(dx0, dy0), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(0.0, dy0), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx1, dy0), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx0, 0.0), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx1, 0.0), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx0, dy1), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(0.0, dy1), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx1, dy1), depth)\r\n    ) * (1.0 / 9.0)\r\n    ;\r\n    return visibility;\r\n}\r\nvec3 pointProjectOnPlane(in vec3 planeNormal, in vec3 planeOrigin, in vec3 point){\r\n    vec3 v01 = point -planeOrigin;\r\n    float d = dot(planeNormal, v01) ;\r\n    return (point - planeNormal * d);\r\n}\r\nfloat ptm(vec3 pt){\r\n    return sqrt(pt.x*pt.x + pt.y*pt.y + pt.z*pt.z);\r\n}\r\nvoid main() \r\n{ \r\n    const float PI = 3.141592653589793;\r\n    vec4 color = texture2D(colorTexture, v_textureCoordinates);\r\n    vec4 currD = texture2D(depthTexture, v_textureCoordinates);\r\n\r\n    // vec4 stcc = texture2D(stcshadow, v_textureCoordinates);\r\n    // gl_FragColor = currD;\r\n    // return;\r\n    if(currD.r>=1.0){\r\n        gl_FragColor = color;\r\n        return;\r\n    }\r\n    \r\n    float depth = getDepth(currD);\r\n    // gl_FragColor = vec4(depth,0.0,0.0,1.0);\r\n    // return;\r\n    // float depth = czm_unpackDepth(texture2D(depthTexture, v_textureCoordinates));\r\n    vec4 positionEC = toEye(v_textureCoordinates, depth);\r\n    vec3 normalEC = vec3(1.0);\r\n    czm_shadowParameters shadowParameters; \r\n    shadowParameters.texelStepSize = shadowMap_texelSizeDepthBiasAndNormalShadingSmooth.xy; \r\n    shadowParameters.depthBias = shadowMap_texelSizeDepthBiasAndNormalShadingSmooth.z; \r\n    shadowParameters.normalShadingSmooth = shadowMap_texelSizeDepthBiasAndNormalShadingSmooth.w; \r\n    shadowParameters.darkness = shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness.w; \r\n    shadowParameters.depthBias *= max(depth * 0.01, 1.0); \r\n    vec3 directionEC = normalize(positionEC.xyz - shadowMap_lightPositionEC.xyz); \r\n    float nDotL = clamp(dot(normalEC, -directionEC), 0.0, 1.0); \r\n    vec4 shadowPosition = _shadowMap_matrix * positionEC; \r\n    shadowPosition /= shadowPosition.w; \r\n    if (any(lessThan(shadowPosition.xyz, vec3(0.0))) || any(greaterThan(shadowPosition.xyz, vec3(1.0)))) \r\n    { \r\n        gl_FragColor = color;\r\n        return;\r\n    }\r\n\r\n    //坐标与视点位置距离，大于最大距离则舍弃阴影效果\r\n    vec4 lw = vec4(shadowMap_lightPositionWC,1.0);\r\n    vec4 vw = czm_inverseView* vec4(positionEC.xyz, 1.0);\r\n    if(distance(lw.xyz,vw.xyz)>dis){\r\n        gl_FragColor = color;\r\n        return;\r\n    }\r\n\r\n\r\n    //水平夹角限制\r\n    vec3 ptOnSP = pointProjectOnPlane(shadowMap_lightUp,lw.xyz,vw.xyz);\r\n    directionEC = ptOnSP - lw.xyz;\r\n    float directionECMO = ptm(directionEC.xyz);\r\n    float shadowMap_lightDirMO = ptm(shadowMap_lightDir.xyz);\r\n    float cosJJ = dot(directionEC,shadowMap_lightDir)/(directionECMO*shadowMap_lightDirMO);\r\n    float degJJ = acos(cosJJ)*(180.0 / PI);\r\n    degJJ = abs(degJJ);\r\n    if(degJJ>spzj/2.0){\r\n        gl_FragColor = color;\r\n        return;\r\n    }\r\n\r\n    //垂直夹角限制\r\n    vec3 ptOnCZ = pointProjectOnPlane(shadowMap_lightRight,lw.xyz,vw.xyz);\r\n    vec3 dirOnCZ = ptOnCZ - lw.xyz;\r\n    float dirOnCZMO = ptm(dirOnCZ);\r\n    float cosJJCZ = dot(dirOnCZ,shadowMap_lightDir)/(dirOnCZMO*shadowMap_lightDirMO);\r\n    float degJJCZ = acos(cosJJCZ)*(180.0 / PI);\r\n    degJJCZ = abs(degJJCZ);\r\n    if(degJJCZ>czzj/2.0){\r\n        gl_FragColor = color;\r\n        return;\r\n    }\r\n\r\n    shadowParameters.texCoords = shadowPosition.xy; \r\n    shadowParameters.depth = shadowPosition.z; \r\n    shadowParameters.nDotL = nDotL; \r\n    float visibility = _czm_shadowVisibility(stcshadow, shadowParameters); \r\n    if(visibility==1.0){\r\n        gl_FragColor = mix(color,vec4(visibleColor,1.0),mixNum);\r\n    }else{\r\n        // if(abs(shadowPosition.z-0.0)<0.01){\r\n        //     return;\r\n        // }\r\n        gl_FragColor = mix(color,vec4(disVisibleColor,1.0),mixNum);\r\n    }\r\n} ",
        uniforms: {
            czzj: function() {
                return self._verticalAngle;
            },
            dis: function() {
                return self._distance;
            },
            spzj: function() {
                return self._horizontalAngle;
            },
            visibleColor: function() {
                return self._visibleAreaColor;
            },
            disVisibleColor: function() {
                return self._hiddenAreaColor;
            },
            mixNum: function() {
                return self._alpha;
            },
            stcshadow: function() {
                return self.viewShadowMap._shadowMapTexture || self._defaultColorTexture;
            },
            _shadowMap_matrix: function() {
                return self.viewShadowMap._shadowMapMatrix;
            },
            shadowMap_lightPositionEC: function() {
                return self.viewShadowMap._lightPositionEC;
            },
            shadowMap_lightPositionWC: function() {
                return self.viewShadowMap._lightCamera.position;
            },
            shadowMap_lightDirectionEC: function() {
                return self.viewShadowMap._lightDirectionEC;
            },
            shadowMap_lightUp: function() {
                return self.viewShadowMap._lightCamera.up;
            },
            shadowMap_lightDir: function() {
                return self.viewShadowMap._lightCamera.direction;
            },
            shadowMap_lightRight: function() {
                return self.viewShadowMap._lightCamera.right;
            },
            shadowMap_texelSizeDepthBiasAndNormalShadingSmooth: function() {
                var e = new Cartesian2;
                return e.x = 1 / self.viewShadowMap._textureSize.x,
                    e.y = 1 / self.viewShadowMap._textureSize.y,
                    Cartesian4.fromElements(e.x, e.y, bias.depthBias, bias.normalShadingSmooth, this.combinedUniforms1);
            },
            shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness: function() {
                return Cartesian4.fromElements(bias.normalOffsetScale, self.viewShadowMap._distance, self.viewShadowMap.maximumDistance, self.viewShadowMap._darkness, this.combinedUniforms2);
                //return Cartesian4.fromElements(n.normalOffsetScale, i.viewShadowMap._distance, i.viewShadowMap.maximumDistance, i.viewShadowMap._darkness, this.combinedUniforms2)
            },
            depthTexture1: function() {
                return self.getSceneDepthTexture(self.viewer)
            }
        }
    });
    console.log('addPostProcess', this.show);
    this.show = true;
    // 添加后期处理到场景
    this.show && this.viewer.scene.postProcessStages.add(this.postProcess);
};

/**
 * 初始化
 *
 * @private
 */
ViewShed3D.prototype._initialize = function() {
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
};

/**
 * 更新提示线
 *
 * @private
 */
ViewShed3D.prototype._updateHintLine = function(/*e*/) { // framestate
    // console.log('updateHintLine', this._modelMatrix, this._horizontalAngle, this._verticalAngle, this._distance);
    var e = this.viewer.scene._frameState;
    var i, a, s, d, p = this._positions,
        // m = CesiumMath.toRadians(this._horizontalFov),
        // v = CesiumMath.toRadians(this._verticalFov),
        m = CesiumMath.toRadians(this._horizontalAngle),
        v = CesiumMath.toRadians(this._verticalAngle),
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
        debugger;
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

    var context = e.context,
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
            // debugShowBoundingVolume: true,
            // executeInClosestFrustum: true,

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
};

/**
 * 获取场景深度图
 */
ViewShed3D.prototype.getSceneDepthTexture = function(viewer) {
    var scene = viewer.scene,
        environmentState = scene._environmentState,
        view = scene._view,
        useGlobeDepthFramebuffer = environmentState.useGlobeDepthFramebuffer,
        globalDepthBuffer = useGlobeDepthFramebuffer ? view.globeDepth.framebuffer : undefined,
        sceneFramebuffer = view.sceneFramebuffer.getFramebuffer();
    return defaultValue(globalDepthBuffer, sceneFramebuffer).depthStencilTexture;
};

export default ViewShed3D;
