/**
 * @author ljh
 */

import Cartesian2 from '../Core/Cartesian2';
import Cartesian3 from '../Core/Cartesian3';
import Ray from '../Core/Ray';
import Color from '../Core/Color';
import ScreenSpaceEventHandler from '../Core/ScreenSpaceEventHandler';
import ScreenSpaceEventType from '../Core/ScreenSpaceEventType';

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
 * @alias Sightline
 * @constructor
 *
 * @param {Object} options 选项
 */
function Sightline(options) {
    this._viewer = options.viewer;
    this._scene = options.viewer.scene;

    this._visibleColor = new Color(0.0, 1.0, 0.0, 1.0);//options.visibleColor || Color.GREEN;
    this._hidenColor = new Color(1.0, 0.0, 0.0, 1.0);//options.hidenColor || Color.RED;

    this._viewerPoint = null;
    this._targetPoint = null;
    this._barrierPoint = null;

    this._viewerPointEntity = null;
    this._targetPointEntity = null;
    this._barrierPointEntity = null;
    this._visibleLineEntity = null;
    this._hidenLineEntity = null;

    _viewer = this._viewer;
    _scene = this._scene;

    /*
    var that = this;
    _screenSpaceEvnentHandler = new ScreenSpaceEventHandler(_viewer.canvas);
    _screenSpaceEvnentHandler.setInputAction(function(evt) {
        var worldPos = _scene.pickPosition(evt.position);
        if (!that._viewerPoint) {
            that._viewerPoint = worldPos;
            that._viewerPointEntity = addPoint(that._viewerPoint, 'viewPoint', Color.GREEN);
        } else if (!that._targetPoint) {
            that._targetPoint = worldPos;

            that.update();
        }
    }, ScreenSpaceEventType.LEFT_CLICK);
    //*/
}

/**
 * @private
 */
Sightline.prototype.removePoints = function () {
    this._viewerPointEntity && this._viewer.entities.remove(this._viewerPointEntity);
    this._targetPointEntity && this._viewer.entities.remove(this._targetPointEntity);
    this._barrierPointEntity && this._viewer.entities.remove(this._barrierPointEntity);
}

/**
 * @private
 */
Sightline.prototype.removeLines = function () {
    this._visibleLineEntity && this._viewer.entities.remove(this._visibleLineEntity);
    this._hidenLineEntity && this._viewer.entities.remove(this._hidenLineEntity);
}

/**
 * @private
 */
Sightline.prototype.update = function () {
    if (this._viewerPoint && this._targetPoint) {
        this.removePoints();
        this.removeLines();

        this._viewerPointEntity = addPoint(this._viewerPoint, 'viewPoint', Color.GREEN);
        var tempPoint = new Cartesian3(0.0, 0.0, 0.0);
        var direction = Cartesian3.normalize(Cartesian3.subtract(this._targetPoint, this._viewerPoint, tempPoint), tempPoint);
        var ray = new Ray(this._viewerPoint, direction);
        var result = _scene.pickFromRay(ray);
        if (result && result.position) {
            this._barrierPoint = result.position;

            this._visibleLineEntity = _viewer.entities.add({
                polyline: {
                    positions: [this._viewerPoint, this._barrierPoint],
                    width: 2.0,
                    material: Color.GREEN//this._visibleColor
                }
            });
            this._hidenLineEntity = _viewer.entities.add({
                polyline: {
                    positions: [this._barrierPoint, this._targetPoint],
                    width: 2.0,
                    material: Color.RED//this._hidenColor
                }
            });
            this._barrierPointEntity = addPoint(this._barrierPoint, 'barrierPoint', Color.GREEN);
            this._targetPointEntity = addPoint(this._targetPoint, 'targetPoint', Color.RED);
        } else {
            this._visibleLineEntity = _viewer.entities.add({
                polyline: {
                    positions: [this._viewerPoint, this._targetPoint],
                    width: 2.0,
                    material: Color.GREEN
                }
            });
            addPoint(this._targetPoint, 'targetPoint', Color.GREEN);
        }
    }
};

/**
 * 设置观察点
 *
 * @param {Cartesian3} point 观察点
 */
Sightline.prototype.setViewerPoint = function (point) {
    this._viewerPoint = point;
    this.update();
}

/**
 * 设置目标点
 *
 * @param {Cartesian3} point 目标点
 */
Sightline.prototype.setTargetPoint = function (point) {
    this._targetPoint = point;
    this.update();
}

/**
 * 设置可见颜色
 *
 * @param {Color} color 颜色
 */
Sightline.prototype.setVisibleColor = function (color) {
    if (this._visibleLineEntity) {
        this._visibleLineEntity.polyline.material = color;
    }
    if (this._viewerPointEntity) {
        this._viewerPointEntity.point.color = color;
    }
    if (this._barrierPointEntity) {
        this._barrierPointEntity.point.color = color;
    }
};

/**
 * 设置不可见颜色
 *
 * @param {Color} color 颜色
 */
Sightline.prototype.setHidenColor = function () {
    if (this._hidenLineEntity) {
        this._hidenLineEntity.polyline.material = color;
    }
    if (this._targetPointEntity) {
        this._targetPointEntity.point.color = color;
    }
};

/**
 * 获取观察点
 */
Sightline.prototype.getViewerPoint = function () {
    return this._viewerPoint;
};

/**
 * 获取障碍点
 */
Sightline.prototype.getBarrierPoint = function () {
    return this._barrierPoint;
};

/**
 * 获取目标点
 */
Sightline.prototype.getTargetPoint = function () {
    return this._targetPoint;
};

/**
 * 销毁
 */
Sightline.prototype.destroy = function () {
    this.removePoints();
    this.removeLines();
    _screenSpaceEvnentHandler && _screenSpaceEvnentHandler.destroy();

    this._viewerPoint = null;
    this._targetPoint = null;
    _screenSpaceEvnentHandler = null;
    _viewer = null;
    _scene = null;
};

export default Sightline;
