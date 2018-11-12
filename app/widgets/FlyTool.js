/**
 *
 * FlyTool
 *  - Easily fly in a SceneView
 *
 * Author:    John Grayson - Applications Prototype Lab - Esri
 * Created:   01/11/2018 - 0.0.1 -
 * Modified:  02/15/2018 - 0.0.2 -
 *            03/08/2018 - 0.0.3 - button creation internal
 *
 */
define([
  "require",
  "dojo/on",
  "dojo/keys",
  "dojo/dom-style",
  "dojo/dom-class",
  "dojo/dom-construct",
  "esri/core/Accessor",
  "esri/core/Evented",
  "esri/views/SceneView"
], function (require, on, keys, domStyle, domClass, domConstruct, Accessor, Evented, SceneView) {

  const MOVE_SPEED = {
    STOPPED: { PIXELS: 0.0, FACTOR: 0.000 },
    SLOW: { PIXELS: 0.5, FACTOR: 0.005 },
    MEDIUM: { PIXELS: 3.0, FACTOR: 0.010 },
    FAST: { PIXELS: 6.0, FACTOR: 0.035 }
  };

  const FlyTool = Accessor.createSubclass([Evented], {
    declaredClass: "FlyTool",

    properties: {
      view: {
        type: SceneView,
        value: null,
        set: function (value) {
          this._set("view", value);
          this.initializeClickHandle();
        }
      },
      resources: {
        type: Object,
        readonly: true,
        value: {
          image_16: require.toUrl("./images/3DFlyTool16.png"),
          image_32: require.toUrl("./images/3DFlyTool32.png"),
          cursor_paused: require.toUrl("./images/3DFlyTool32_gray.cur"),
          cursor_flying: require.toUrl("./images/3DFlyTool32.cur")
        }
      },
      cursor_paused: {
        type: String,
        readonly: true,
        dependsOn: ["resources.cursor_paused"],
        get: function () {
          return `url('${this.resources.cursor_paused}'), cell`
        }
      },
      cursor_flying: {
        type: String,
        readonly: true,
        dependsOn: ["resources.cursor_flying"],
        get: function () {
          return `url('${this.resources.cursor_flying}'), crosshair`
        }
      },
      button: {
        type: HTMLDivElement,
        readonly: true,
        dependsOn: ["resources"],
        get: function () {
          const btn = this._createButton();
          this._set("button", btn);
          return btn;
        }
      },
      enabled: {
        type: Boolean,
        value: false,
        set: function (value) {
          this._set("enabled", value);
          if(value) {
            this.enable()
          } else {
            this.disable();
          }
        }
      },
      flying: {
        type: Boolean,
        value: false
      },
      updateDelay: {
        type: Number,
        value: 17
      },
      moveSpeed: {
        type: Object,
        value: MOVE_SPEED.SLOW
      },
      holdElevation: {
        type: Boolean,
        value: false
      },
      mapCenterPoint: {
        type: Object,
        value: null
      },
      mouseMovePoint: {
        type: Object,
        value: null
      }
    },

    /**
     *
     * @private
     */
    _createButton: function () {

      const flyToolBtn = domConstruct.create("div", { className: "fly-btn esri-component esri-widget--button esri-widget", title: "Fly" });
      domConstruct.create("img", { src: this.resources.image_16 }, flyToolBtn);

      on(flyToolBtn, "click", () => {
        this.enabled = (!this.enabled);
        domStyle.set(flyToolBtn, "backgroundColor", this.enabled ? "#0079c1" : "#fff");
        //domClass.toggle(flyToolBtn, "selected", this.enabled);
      });

      return flyToolBtn;
    },

    /**
     *
     */
    initializeClickHandle: function () {
      // VIEW CLICK EVENT //
      this.clickHandle = on.pausable(this.view, "click", (evt) => {
        evt.stopPropagation();
        if(this.flying) {
          switch (this.moveSpeed) {
            case MOVE_SPEED.SLOW:
              this.moveSpeed = MOVE_SPEED.MEDIUM;
              break;
            case MOVE_SPEED.MEDIUM:
              this.moveSpeed = MOVE_SPEED.FAST;
              break;
            case MOVE_SPEED.FAST:
              this._stop();
              break;
          }
        } else {
          this._start(evt.screenPoint);
        }
      });
      this.clickHandle.pause();
    },

    /**
     * SET MAP CURSOR
     *
     * @param cursor
     * @private
     */
    setMapCursor: function (cursor) {
      this.view.container.style.cursor = (cursor || "default");
    },

    /**
     * ENABLE TOOL
     *
     * @private
     */
    enable: function () {
      // SET MAP CURSOR //
      this.setMapCursor(this.cursor_paused);
      // VIEW CLICK EVENT //
      this.clickHandle.resume();
    },

    /**
     * DISABLE TOOL
     *
     * @private
     */
    disable: function () {
      // STOP FLYING //
      this._stop();
      // SET MAP CURSOR //
      this.setMapCursor();
      // PAUSE VIEW CLICK EVENT //
      this.clickHandle.pause();
    },

    /**
     * START FLYING
     *
     * @param screenPoint
     * @private
     */
    _start: function (screenPoint) {
      // SET FLYING //
      this.flying = true;

      // SET MOVE SPEED //
      this.moveSpeed = MOVE_SPEED.SLOW;

      // SET MAP CURSOR //
      this.setMapCursor(this.cursor_flying);

      // MAP CENTER //
      this.mapCenterPoint = {
        x: this.view.position[0] + (this.view.width * 0.5),
        y: this.view.position[1] + (this.view.height * 0.5)
      };

      // MOUSE MOVE //
      this.mouseMovePoint = screenPoint;
      this.mouseMovePoint.y -= 1;  // FORCE UPDATES TO START RIGHT AWAY //

      if(this.mouseMoveHandle) {
        this.mouseMoveHandle.resume();
      } else {
        this.mouseMoveHandle = on.pausable(this.view.container, "mousemove", (evt) => {
          evt.stopPropagation();
          this.mouseMovePoint = {
            x: evt.clientX,
            y: evt.clientY
          };
        });
      }

      // START FLY ANIMATION //
      this.animationHandle = () => {
        if(this.flying) {
          // FLY //
          this._fly();
          window.requestAnimationFrame(this.animationHandle);
        } else {
          // STOP FLYING //
          this._stop();
        }
      };
      window.requestAnimationFrame(this.animationHandle);

      // KEYBOARD EVENTS //
      if(this.keyUpDownDownHandle) {
        this.keyUpDownDownHandle.resume();
      } else {
        this.keyUpDownDownHandle = on.pausable(this.view.container, "keydown, keyup", this._handleKeyboardEvent.bind(this));
      }
    },

    /**
     * HANDLE KEYBOARD EVENTS
     *
     * @param evt
     * @private
     */
    _handleKeyboardEvent: function (evt) {
      // SHIFT = HOLD ELEVATION //
      this.holdElevation = evt.shiftKey;
      // ESCAPE = STOP //
      if(evt.keyCode === keys.ESCAPE) {
        this._stop();
      }
    },

    /**
     * FLY ANIMATION
     *
     * @private
     */
    _fly: function () {
      if(this.flying && this.mouseMovePoint) {

        // CALC MOVE DELTAS //
        const viewWidthHeight = ((this.view.width + this.view.height) * 0.5);
        const speedFactorX = Math.abs((this.mapCenterPoint.x - this.mouseMovePoint.x) / viewWidthHeight);
        const speedFactorY = Math.abs((this.mapCenterPoint.y - this.mouseMovePoint.y) / viewWidthHeight);
        const deltaX = ((this.mapCenterPoint.x > this.mouseMovePoint.x) ? this.moveSpeed.PIXELS : -this.moveSpeed.PIXELS) * speedFactorX;
        const deltaY = ((this.mapCenterPoint.y > this.mouseMovePoint.y) ? this.moveSpeed.PIXELS : -this.moveSpeed.PIXELS) * speedFactorY;

        // VIEW CAMERA //
        const camera = this.view.camera.clone();
        camera.heading -= deltaX;
        camera.tilt += deltaY;

        /**
         *  THE IDEA HERE IS THAT WE'RE MOVING THE CAMERA 'FORWARD' BUT WE NEED TO DO IT IN A SMOOTH
         *  MANNER SO IT FEELS LIKE WE'RE MOVING AT THE SAME RATE WHEN CLOSE TO THE GROUND OR AT
         *  VERY HIGH ALTITUDES...
         *
         *  TODO: ...I THINK THIS IS JUST WRONG....
         */
        const distanceOffset = (camera.position.z * this.moveSpeed.FACTOR);
        // XY OFFSETS //
        const offsetX = Math.sin(camera.heading * Math.PI / 180.0) * distanceOffset;
        const offsetY = Math.cos(camera.heading * Math.PI / 180.0) * distanceOffset;

        // ALTITUDE OFFSET //
        let offsetZ = 0.0;
        if(!this.holdElevation) {
          const tiltHorizon = 90.0;
          const horizonOffset = (camera.tilt < tiltHorizon) ? -(tiltHorizon - camera.tilt) : (camera.tilt - tiltHorizon);
          offsetZ = (horizonOffset / tiltHorizon) * distanceOffset;
        }

        // POSITION OFFSETS //
        const newPosition = camera.position.offset(offsetX, offsetY, offsetZ);
        /**
         * TODO: HOW DO WE DETECT AND PREVENT THAT WE'RE ABOUT TO 'CRASH' OR HIT THE GROUND?
         *       ...THE JS API ALLOWS ME TO DO THIS AND THEN JUST HANGS...
         */
        const minAltitude = 25.0;
        const surfaceElevation = this.view.basemapTerrain.getElevation(newPosition);
        if(newPosition.z < (surfaceElevation + minAltitude)) {
          newPosition.z = (surfaceElevation + minAltitude);
        }
        camera.position = newPosition;

        // UPDATE CAMERA //
        this.view.camera = camera;
      }
    },

    /**
     * STOP FLYING
     *
     * @private
     */
    _stop: function () {
      // SET FLYING //
      this.flying = false;

      // RESET MOVE SPEED //
      this.moveSpeed = MOVE_SPEED.SLOW;

      // CANCEL FLY ANIMATION //
      window.cancelAnimationFrame(this.animationHandle);

      // PAUSE FLYING EVENTS //
      if(this.mouseMoveHandle) {
        this.mouseMoveHandle.pause();
      }
      if(this.keyUpDownDownHandle) {
        this.keyUpDownDownHandle.pause();
      }

      // SET MAP CURSOR //
      this.setMapCursor(this.cursor_paused);

      // CLEAR SCREEN LOCATIONS //
      this.mapCenterPoint = null;
      this.mouseMovePoint = null;
    }

  });

  FlyTool.MOVE_SPEED = MOVE_SPEED;

  FlyTool.version = "0.0.3";

  return FlyTool;
});