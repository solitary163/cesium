
import defaultValue from '../core/defaultValue.js';
import defined from '../Core/defined.js';
import CesiumMath from '../Core/Math.js';
import Cartesian2 from '../Core/Cartesian2.js';
import Cartesian3 from '../Core/Cartesian3.js';
import Cartesian4 from '../Core/Cartesian4.js';
import Matrix3 from '../Core/Matrix3.js';
import Quaternion from '../Core/Quaternion.js';
import Color from '../Core/Color.js';
import Camera from '../Scene/Camera.js';
import PerspectiveFrustum from '../Core/PerspectiveFrustum.js';
import ShadowMap from '../Scene/ShadowMap.js';
import PostProcessStage from '../Scene/PostProcessStage.js';
import ScreenSpaceEventType from '../Core/ScreenSpaceEventType.js';
import ScreenSpaceEventHandler from '../Core/ScreenSpaceEventHandler.js';
import Texture from '../Renderer/Texture.js';

import DebugCameraPrimitive from '../Scene/DebugCameraPrimitive.js';

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
};

ViewShed3D.prototype.update = function(e) {
    this.viewShadowMap && e.shadowMaps.push(this.viewShadowMap);
    //console.log('Primitive update()', e);
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

/**
 * 绑定鼠标事件
 */
ViewShed3D.prototype._bindMouseEvent = function() {
    var self = this, // e = this,
        viewer = this.viewer,//t = this.viewer,
        handler = new ScreenSpaceEventHandler(this.viewer.scene.canvas);
    handler.setInputAction(function (e) {
        var curPosition = (0, c.getCurrentMousePosition)(viewer.scene, e.position);
        if (curPosition) {
            if (self.cameraPosition) {
                if (self.cameraPosition && !self.viewPosition) {
                    self.viewPosition = curPosition;
                    self._addToScene();
                    self._unbindMouseEvent();
                    self.calback && self.calback();
                }
            } else {
                self.cameraPosition = curPosition;
            }
        }
    }, ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction(function (e) {
        var curPosition = (0, c.getCurrentMousePosition)(viewer.scene, e.endPosition),
            cameraPosition = self.cameraPosition;
        if (curPositionv && cameraPosition) {
            self.frustumQuaternion = self.getFrustumQuaternion(cameraPosition, curPosition);
            self.distance = Number(Cartesian3.distance(cameraPosition, curPosition).toFixed(1));
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
    this.viewer.scene.primitives.add(this);
};

/**
 * 创建ShadowMap
 *
 * @private
 */
ViewShed3D.prototype._createShadowMap = function(fromPosition, toPosition) {
    var scene = this.viewer.scene,
        lightCamera = new Camera(scene);
    lightCamera.position = fromPosition;
    lightCamera.direction = Cartesian3.subtract(toPosition, fromPosition, new Cartesian3(0, 0, 0));
    lightCamera.up = Cartesian3.normalize(fromPosition, new Cartesian3(0, 0, 0));
    this.distance = Number(Cartesian3.distance(toPosition, fromPosition).toFixed(1));
    lightCamera.frustum = new PerspectiveFrustum({
        //fov: CesiumMath.toRadians(120),
        fov: CesiumMath.toRadians(60),
        aspectRatio: scene.canvas.clientWidth / scene.canvas.clientHeight,
        near: 0.1,
        far: 20000
        //far: 5e3
    });
    this.viewShadowMap =  new ShadowMap({
        lightCamera: lightCamera,
        //enable: false,
        enable: true,
        isPointLight: false,
        isSpotLight: true,
        cascadesEnabled: false,
        context: scene.context,
        pointLightRadius: this.distance
    });
    this.viewShadowMap.debugShow = true;
    this.viewer.scene.primitives.add(new DebugCameraPrimitive({
        camera : lightCamera,
        color : Color.YELLOW
    }));
};

/**
 * 添加后期处理
 *
 * @private
 */
ViewShed3D.prototype._addPostProcess = function() {
    var self = this,
        bias = self.viewShadowMap._isPointLight ? self.viewShadowMap._pointBias : self.viewShadowMap._primitiveBias;
    this.postProcess = new PostProcessStage({
        fragmentShader: "uniform float czzj;\r\nuniform float dis;\r\nuniform float spzj;\r\nuniform vec3 visibleColor;\r\nuniform vec3 disVisibleColor;\r\nuniform float mixNum;\r\nuniform sampler2D colorTexture;\r\nuniform sampler2D stcshadow; \r\nuniform sampler2D depthTexture;\r\nuniform mat4 _shadowMap_matrix; \r\nuniform vec4 shadowMap_lightPositionEC; \r\nuniform vec3 shadowMap_lightPositionWC;\r\nuniform vec4 shadowMap_lightDirectionEC;\r\nuniform vec3 shadowMap_lightUp;\r\nuniform vec3 shadowMap_lightDir;\r\nuniform vec3 shadowMap_lightRight;\r\nuniform vec4 shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness; \r\nuniform vec4 shadowMap_texelSizeDepthBiasAndNormalShadingSmooth; \r\nvarying vec2 v_textureCoordinates;\r\nvec4 toEye(in vec2 uv, in float depth){\r\n    vec2 xy = vec2((uv.x * 2.0 - 1.0),(uv.y * 2.0 - 1.0));\r\n    vec4 posInCamera =czm_inverseProjection * vec4(xy, depth, 1.0);\r\n    posInCamera =posInCamera / posInCamera.w;\r\n    return posInCamera;\r\n}\r\nfloat getDepth(in vec4 depth){\r\n    float z_window = czm_unpackDepth(depth);\r\n    z_window = czm_reverseLogDepth(z_window);\r\n    float n_range = czm_depthRange.near;\r\n    float f_range = czm_depthRange.far;\r\n    return (2.0 * z_window - n_range - f_range) / (f_range - n_range);\r\n}\r\nfloat _czm_sampleShadowMap(sampler2D shadowMap, vec2 uv){\r\n    return texture2D(shadowMap, uv).r;\r\n}\r\nfloat _czm_shadowDepthCompare(sampler2D shadowMap, vec2 uv, float depth){\r\n    return step(depth, _czm_sampleShadowMap(shadowMap, uv));\r\n}\r\nfloat _czm_shadowVisibility(sampler2D shadowMap, czm_shadowParameters shadowParameters){\r\n    float depthBias = shadowParameters.depthBias;\r\n    float depth = shadowParameters.depth;\r\n    float nDotL = shadowParameters.nDotL;\r\n    float normalShadingSmooth = shadowParameters.normalShadingSmooth;\r\n    float darkness = shadowParameters.darkness;\r\n    vec2 uv = shadowParameters.texCoords;\r\n    depth -= depthBias;\r\n    vec2 texelStepSize = shadowParameters.texelStepSize;\r\n    float radius = 1.0;\r\n    float dx0 = -texelStepSize.x * radius;\r\n    float dy0 = -texelStepSize.y * radius;\r\n    float dx1 = texelStepSize.x * radius;\r\n    float dy1 = texelStepSize.y * radius;\r\n    float visibility = \r\n    (\r\n    _czm_shadowDepthCompare(shadowMap, uv, depth)\r\n    +_czm_shadowDepthCompare(shadowMap, uv + vec2(dx0, dy0), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(0.0, dy0), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx1, dy0), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx0, 0.0), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx1, 0.0), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx0, dy1), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(0.0, dy1), depth) +\r\n    _czm_shadowDepthCompare(shadowMap, uv + vec2(dx1, dy1), depth)\r\n    ) * (1.0 / 9.0)\r\n    ;\r\n    return visibility;\r\n}\r\nvec3 pointProjectOnPlane(in vec3 planeNormal, in vec3 planeOrigin, in vec3 point){\r\n    vec3 v01 = point -planeOrigin;\r\n    float d = dot(planeNormal, v01) ;\r\n    return (point - planeNormal * d);\r\n}\r\nfloat ptm(vec3 pt){\r\n    return sqrt(pt.x*pt.x + pt.y*pt.y + pt.z*pt.z);\r\n}\r\nvoid main() \r\n{ \r\n    const float PI = 3.141592653589793;\r\n    vec4 color = texture2D(colorTexture, v_textureCoordinates);\r\n    vec4 currD = texture2D(depthTexture, v_textureCoordinates);\r\n\r\n    // vec4 stcc = texture2D(stcshadow, v_textureCoordinates);\r\n    // gl_FragColor = currD;\r\n    // return;\r\n    if(currD.r>=1.0){\r\n        gl_FragColor = color;\r\n        return;\r\n    }\r\n    \r\n    float depth = getDepth(currD);\r\n    // gl_FragColor = vec4(depth,0.0,0.0,1.0);\r\n    // return;\r\n    // float depth = czm_unpackDepth(texture2D(depthTexture, v_textureCoordinates));\r\n    vec4 positionEC = toEye(v_textureCoordinates, depth);\r\n    vec3 normalEC = vec3(1.0);\r\n    czm_shadowParameters shadowParameters; \r\n    shadowParameters.texelStepSize = shadowMap_texelSizeDepthBiasAndNormalShadingSmooth.xy; \r\n    shadowParameters.depthBias = shadowMap_texelSizeDepthBiasAndNormalShadingSmooth.z; \r\n    shadowParameters.normalShadingSmooth = shadowMap_texelSizeDepthBiasAndNormalShadingSmooth.w; \r\n    shadowParameters.darkness = shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness.w; \r\n    shadowParameters.depthBias *= max(depth * 0.01, 1.0); \r\n    vec3 directionEC = normalize(positionEC.xyz - shadowMap_lightPositionEC.xyz); \r\n    float nDotL = clamp(dot(normalEC, -directionEC), 0.0, 1.0); \r\n    vec4 shadowPosition = _shadowMap_matrix * positionEC; \r\n    shadowPosition /= shadowPosition.w; \r\n    if (any(lessThan(shadowPosition.xyz, vec3(0.0))) || any(greaterThan(shadowPosition.xyz, vec3(1.0)))) \r\n    { \r\n        gl_FragColor = color;\r\n        return;\r\n    }\r\n\r\n    //坐标与视点位置距离，大于最大距离则舍弃阴影效果\r\n    vec4 lw = vec4(shadowMap_lightPositionWC,1.0);\r\n    vec4 vw = czm_inverseView* vec4(positionEC.xyz, 1.0);\r\n    if(distance(lw.xyz,vw.xyz)>dis){\r\n        gl_FragColor = color;\r\n        return;\r\n    }\r\n\r\n\r\n    //水平夹角限制\r\n    vec3 ptOnSP = pointProjectOnPlane(shadowMap_lightUp,lw.xyz,vw.xyz);\r\n    directionEC = ptOnSP - lw.xyz;\r\n    float directionECMO = ptm(directionEC.xyz);\r\n    float shadowMap_lightDirMO = ptm(shadowMap_lightDir.xyz);\r\n    float cosJJ = dot(directionEC,shadowMap_lightDir)/(directionECMO*shadowMap_lightDirMO);\r\n    float degJJ = acos(cosJJ)*(180.0 / PI);\r\n    degJJ = abs(degJJ);\r\n    if(degJJ>spzj/2.0){\r\n        gl_FragColor = color;\r\n        return;\r\n    }\r\n\r\n    //垂直夹角限制\r\n    vec3 ptOnCZ = pointProjectOnPlane(shadowMap_lightRight,lw.xyz,vw.xyz);\r\n    vec3 dirOnCZ = ptOnCZ - lw.xyz;\r\n    float dirOnCZMO = ptm(dirOnCZ);\r\n    float cosJJCZ = dot(dirOnCZ,shadowMap_lightDir)/(dirOnCZMO*shadowMap_lightDirMO);\r\n    float degJJCZ = acos(cosJJCZ)*(180.0 / PI);\r\n    degJJCZ = abs(degJJCZ);\r\n    if(degJJCZ>czzj/2.0){\r\n        gl_FragColor = color;\r\n        return;\r\n    }\r\n\r\n    shadowParameters.texCoords = shadowPosition.xy; \r\n    shadowParameters.depth = shadowPosition.z; \r\n    shadowParameters.nDotL = nDotL; \r\n    float visibility = _czm_shadowVisibility(stcshadow, shadowParameters); \r\n    if(visibility==1.0){\r\n        gl_FragColor = mix(color,vec4(visibleColor,1.0),mixNum);\r\n    }else{\r\n        // if(abs(shadowPosition.z-0.0)<0.01){\r\n        //     return;\r\n        // }\r\n        gl_FragColor = mix(color,vec4(disVisibleColor,1.0),mixNum);\r\n    }\r\n} ",
        uniforms: {
           czzj: function () {
              return self.verticalAngle;
           },
           dis: function () {
              return self.distance;
           },
           spzj: function () {
              return self.horizontalAngle;
           },
           visibleColor: function () {
              return self.visibleAreaColor;
           },
           disVisibleColor: function () {
              return self.hiddenAreaColor;
           },
           mixNum: function () {
              return self.alpha;
           },
           stcshadow: function () {
              return self.viewShadowMap._shadowMapTexture || self._defaultColorTexture;
           },
           _shadowMap_matrix: function () {
              return self.viewShadowMap._shadowMapMatrix;
           },
           shadowMap_lightPositionEC: function () {
              return self.viewShadowMap._lightPositionEC;
           },
           shadowMap_lightPositionWC: function () {
              return self.viewShadowMap._lightCamera.position;
           },
           shadowMap_lightDirectionEC: function () {
              return self.viewShadowMap._lightDirectionEC;
           },
           shadowMap_lightUp: function () {
              return self.viewShadowMap._lightCamera.up;
           },
           shadowMap_lightDir: function () {
              return self.viewShadowMap._lightCamera.direction;
           },
           shadowMap_lightRight: function () {
              return self.viewShadowMap._lightCamera.right;
           },
           shadowMap_texelSizeDepthBiasAndNormalShadingSmooth: function () {
              var e = new Cartesian2;
              return e.x = 1 / self.viewShadowMap._textureSize.x,
              e.y = 1 / self.viewShadowMap._textureSize.y,
              Cartesian4.fromElements(e.x, e.y, bias.depthBias, bias.normalShadingSmooth, this.combinedUniforms1);
           },
           shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness: function () {
              return Cartesian4.fromElements(n.normalOffsetScale, i.viewShadowMap._distance, i.viewShadowMap.maximumDistance, i.viewShadowMap._darkness, this.combinedUniforms2)
           },
           depthTexture1: function () {
              return self.getSceneDepthTexture(self.viewer)
           }
        }
     });
     // 添加后期处理到场景
     this.show && this.viewer.scene.postProcessStages.add(this.postProcess)
};

/**
 * 获取场景深度图
 */
ViewShed3D.prototype.getSceneDepthTexture = function(viewer) {
    var scene = viewer.scene,
        environmentState = scene._environmentState,
        view = scene._view,
        useGlobeDepthFramebuffer = environmentState.useGlobeDepthFramebuffer,
        globalDepthBuffer = useGlobeDepthFramebuffer ? n.globeDepth.framebuffer : undefined,
        sceneFramebuffer = view.sceneFramebuffer.getFramebuffer();
    return defaultValue(globalDepthBuffer, sceneFramebuffer).depthStencilTexture;
};

export default ViewShed3D;
