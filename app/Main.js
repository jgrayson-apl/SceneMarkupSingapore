/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.​
*/

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/number",
  "dojo/date/locale",
  "dojo/on",
  "dojo/query",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "esri/identity/IdentityManager",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/layers/Layer",
  "esri/layers/GraphicsLayer",
  "esri/layers/FeatureLayer",
  "esri/geometry/Extent",
  "esri/Graphic",
  "esri/widgets/Feature",
  "esri/widgets/FeatureForm",
  "esri/widgets/Home",
  "esri/widgets/Search",
  "esri/widgets/LayerList",
  "esri/widgets/Legend",
  "esri/widgets/ScaleBar",
  "esri/widgets/Compass",
  "esri/widgets/BasemapGallery",
  "esri/widgets/Expand"
], function (calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
             number, locale, on, query, dom, domClass, domConstruct,
             IdentityManager, Evented, watchUtils, promiseUtils, Portal, Layer, GraphicsLayer, FeatureLayer, Extent,
             Graphic, Feature, FeatureForm, Home, Search, LayerList, Legend, ScaleBar, Compass, BasemapGallery, Expand) {

  return declare([Evented], {

    /**
     *
     */
    constructor: function () {
      this.CSS = {
        loading: "configurable-application--loading",
        NOTIFICATION_TYPE: {
          MESSAGE: "alert alert-blue animate-in-up is-active inline-block",
          SUCCESS: "alert alert-green animate-in-up is-active inline-block",
          WARNING: "alert alert-yellow animate-in-up is-active inline-block",
          ERROR: "alert alert-red animate-in-up is-active inline-block"
        },
      };
      this.base = null;

      // CALCITE WEB //
      calcite.init();
      calcite.bus.emit("modal:open", { id: "app-details-dialog" });
    },

    /**
     *
     * @param base
     */
    init: function (base) {
      if(!base) {
        console.error("ApplicationBase is not defined");
        return;
      }
      domHelper.setPageLocale(base.locale);
      domHelper.setPageDirection(base.direction);

      this.base = base;
      const config = base.config;
      const results = base.results;
      const find = config.find;
      const marker = config.marker;

      const allMapAndSceneItems = results.webMapItems.concat(results.webSceneItems);
      const validMapItems = allMapAndSceneItems.map(function (response) {
        return response.value;
      });

      const firstItem = validMapItems[0];
      if(!firstItem) {
        console.error("Could not load an item to display");
        return;
      }
      config.title = (config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(config.title);

      const viewProperties = itemUtils.getConfigViewProperties(config);
      viewProperties.container = "view-container";

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({ item: firstItem, appProxies: appProxies }).then((map) => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then((view) => {
          itemUtils.findQuery(find, view).then(() => {
            itemUtils.goToMarker(marker, view).then(() => {
              domClass.remove(document.body, this.CSS.loading);
              this.viewReady(config, firstItem, view);
            });
          });
        });
      });
    },

    /**
     *
     * @param config
     * @param item
     * @param view
     */
    viewReady: function (config, item, view) {

      // TITLE //
      dom.byId("app-title-node").innerHTML = config.title;

      // MAP DETAILS //
      this.displayMapDetails(item);

      // LOADING //
      const updating_node = domConstruct.create("div", { className: "view-loading-node loader" });
      domConstruct.create("div", { className: "loader-bars" }, updating_node);
      domConstruct.create("div", { className: "loader-text font-size--3 text-white", innerHTML: "Updating..." }, updating_node);
      view.ui.add(updating_node, "bottom-right");
      watchUtils.init(view, "updating", (updating) => {
        domClass.toggle(updating_node, "is-active", updating);
      });

      // PANEL TOGGLE //
      if(query(".pane-toggle-target").length > 0) {
        const panelToggleBtn = domConstruct.create("div", { className: "panel-toggle icon-ui-left-triangle-arrow icon-ui-flush font-size-1", title: "Toggle Left Panel" }, view.root);
        on(panelToggleBtn, "click", () => {
          domClass.toggle(panelToggleBtn, "icon-ui-left-triangle-arrow icon-ui-right-triangle-arrow");
          query(".pane-toggle-target").toggleClass("hide");
          query(".pane-toggle-source").toggleClass("column-18 column-24");
        });
      }

      // USER SIGN IN //
      this.initializeUserSignIn(view).always(() => {

        // POPUP DOCKING OPTIONS //
        view.popup.dockEnabled = true;
        view.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: "top-center"
        };

        // SEARCH //
        const search = new Search({ view: view, searchTerm: this.base.config.search || "" });
        view.ui.add(search, { position: "top-left", index: 0 });

        // HOME //
        const home = new Home({ view: view });
        view.ui.add(home, { position: "top-left", index: 1 });

        // BASEMAPS //
        const basemapGalleryExpand = new Expand({
          view: view,
          content: new BasemapGallery({ view: view }),
          expandIconClass: "esri-icon-basemap",
          expandTooltip: "Basemap"
        });
        view.ui.add(basemapGalleryExpand, { position: "top-left", index: 4 });

        // PLACES //
        this.initializePlaces(view);

        //
        // LAYER LIST //
        //
        // CREATE OPACITY NODE //
        const createOpacityNode = (item, parent_node) => {
          const opacity_node = domConstruct.create("div", { className: "opacity-node esri-widget", title: "Layer Opacity" }, parent_node);
          // domConstruct.create("span", { className: "font-size--3", innerHTML: "Opacity:" }, opacity_node);
          const opacity_input = domConstruct.create("input", { className: "opacity-input", type: "range", min: 0, max: 1.0, value: item.layer.opacity, step: 0.01 }, opacity_node);
          on(opacity_input, "input", () => {
            item.layer.opacity = opacity_input.valueAsNumber;
          });
          item.layer.watch("opacity", (opacity) => {
            opacity_input.valueAsNumber = opacity;
          });
          opacity_input.valueAsNumber = item.layer.opacity;
          return opacity_node;
        };
        // CREATE TOOLS NODE //
        const createToolsNode = (item, parent_node) => {
          // TOOLS NODE //
          const tools_node = domConstruct.create("div", { className: "opacity-node esri-widget" }, parent_node);

          // REORDER //
          const reorder_node = domConstruct.create("div", { className: "inline-block" }, tools_node);
          const reorder_up_node = domConstruct.create("button", { className: "btn-link icon-ui-up", title: "Move layer up..." }, reorder_node);
          const reorder_down_node = domConstruct.create("button", { className: "btn-link icon-ui-down", title: "Move layer down..." }, reorder_node);
          on(reorder_up_node, "click", () => {
            view.map.reorder(item.layer, view.map.layers.indexOf(item.layer) + 1);
          });
          on(reorder_down_node, "click", () => {
            view.map.reorder(item.layer, view.map.layers.indexOf(item.layer) - 1);
          });

          // REMOVE LAYER //
          const remove_layer_node = domConstruct.create("button", { className: "btn-link icon-ui-close right", title: "Remove layer from map..." }, tools_node);
          on.once(remove_layer_node, "click", () => {
            view.map.remove(item.layer);
            this.emit("layer-removed", item.layer);
          });

          // ZOOM TO //
          const zoom_to_node = domConstruct.create("button", { className: "btn-link icon-ui-zoom-in-magnifying-glass right", title: "Zoom to Layer" }, tools_node);
          on(zoom_to_node, "click", () => {
            view.goTo(item.layer.fullExtent);
          });

          // LAYER DETAILS //
          const itemDetailsPageUrl = `${this.base.portal.url}/home/item.html?id=${item.layer.portalItem.id}`;
          domConstruct.create("a", { className: "btn-link icon-ui-description icon-ui-blue right", title: "View details...", target: "_blank", href: itemDetailsPageUrl }, tools_node);

          return tools_node;
        };
        // LAYER LIST //
        const layerList = new LayerList({
          container: "layer-list-container",
          view: view,
          listItemCreatedFunction: (evt) => {
            let item = evt.item;
            if(item.layer && item.layer.portalItem) {

              // CREATE ITEM PANEL //
              const panel_node = domConstruct.create("div", { className: "esri-widget" });

              // LAYER TOOLS //
              createToolsNode(item, panel_node);

              // OPACITY //
              createOpacityNode(item, panel_node);

              // if(item.layer.type === "imagery") {
              //   this.configureImageryLayer(view, item.layer, panel_node);
              // }

              // LEGEND //
              if(item.layer.legendEnabled) {
                const legend = new Legend({ container: panel_node, view: view, layerInfos: [{ layer: item.layer }] })
              }

              // SET ITEM PANEL //
              item.panel = {
                title: "Settings",
                className: "esri-icon-settings",
                content: panel_node
              };
            }
          }
        });


        // SCENE MARKUP //
        this.initializeSceneMarkup(view);

      });

    },

    /**
     * DISPLAY MAP DETAILS
     *
     * @param portalItem
     */
    displayMapDetails: function (portalItem) {

      const itemLastModifiedDate = (new Date(portalItem.modified)).toLocaleString();

      dom.byId("current-map-card-thumb").src = portalItem.thumbnailUrl;
      dom.byId("current-map-card-thumb").alt = portalItem.title;
      dom.byId("current-map-card-caption").innerHTML = `A map by ${portalItem.owner}`;
      dom.byId("current-map-card-caption").title = "Last modified on " + itemLastModifiedDate;
      dom.byId("current-map-card-title").innerHTML = portalItem.title;
      dom.byId("current-map-card-title").href = `https://www.arcgis.com/home/item.html?id=${portalItem.id}`;
      dom.byId("current-map-card-description").innerHTML = portalItem.description;

    },

    /**
     *
     * @returns {*}
     */
    initializeUserSignIn: function (view) {

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn);
      };
      IdentityManager.on("credential-create", checkSignInStatus);
      IdentityManager.on("credential-destroy", checkSignInStatus);

      // SIGN IN NODE //
      const signInNode = dom.byId("sign-in-node");
      const userNode = dom.byId("user-node");

      // UPDATE UI //
      const updateSignInUI = () => {
        if(this.base.portal.user) {
          dom.byId("user-firstname-node").innerHTML = this.base.portal.user.fullName.split(" ")[0];
          dom.byId("user-fullname-node").innerHTML = this.base.portal.user.fullName;
          dom.byId("username-node").innerHTML = this.base.portal.user.username;
          dom.byId("user-thumb-node").src = this.base.portal.user.thumbnailUrl;
          domClass.add(signInNode, "hide");
          domClass.remove(userNode, "hide");
        } else {
          domClass.remove(signInNode, "hide");
          domClass.add(userNode, "hide");
        }
        return promiseUtils.resolve();
      };

      // SIGN IN //
      const userSignIn = () => {
        this.base.portal = new Portal({ url: this.base.config.portalUrl, authMode: "immediate" });
        return this.base.portal.load().then(() => {
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);
      };

      // SIGN OUT //
      const userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.base.portal = new Portal({});
        this.base.portal.load().then(() => {
          this.base.portal.user = null;
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);

      };

      // USER SIGN IN //
      on(signInNode, "click", userSignIn);

      // SIGN OUT NODE //
      const signOutNode = dom.byId("sign-out-node");
      if(signOutNode) {
        on(signOutNode, "click", userSignOut);
      }

      return checkSignInStatus();
    },

    /**
     *
     * @param view
     */
    initializePlaces: function (view) {

      // WEB SCENE //
      if(view.map.presentation && view.map.presentation.slides && (view.map.presentation.slides.length > 0)) {
        // PLACES PANEL //
        /*const placesPanel = domConstruct.create("div", { className: "places-panel panel panel-no-padding esri-widget" });
        const placesExpand = new Expand({
          view: view,
          content: placesPanel,
          expandIconClass: "esri-icon-applications",
          expandTooltip: "Places"
        }, domConstruct.create("div"));
        view.ui.add(placesExpand, "bottom-left");*/


        const placesPanel = dom.byId("slides-container");

        // SLIDES //
        const slides = view.map.presentation.slides;
        slides.forEach((slide) => {

          const slideNode = domConstruct.create("div", { className: "places-node esri-interactive" }, placesPanel);
          domConstruct.create("img", { className: "", src: slide.thumbnail.url }, slideNode);
          domConstruct.create("span", { className: "places-label", innerHTML: slide.title.text }, slideNode);

          on(slideNode, "click", () => {
            slide.applyTo(view, {
              animate: true,
              speedFactor: 0.33,
              easing: "in-out-cubic"   // linear, in-cubic, out-cubic, in-out-cubic, in-expo, out-expo, in-out-expo
            }).then(() => {
              placesExpand.collapse();
            });
          });
        });

        view.on("layerview-create", (evt) => {
          if(evt.layer.visible) {
            slides.forEach((slide) => {
              slide.visibleLayers.add({ id: evt.layer.id });
            });
          }
        });
      } else {
        // WEB MAP //
        if(view.map.bookmarks && view.map.bookmarks.length > 0) {

          // PLACES DROPDOWN //
          const placesDropdown = domConstruct.create("div", { className: "dropdown js-dropdown esri-widget" });
          view.ui.add(placesDropdown, { position: "top-left", index: 1 });
          const placesBtn = domConstruct.create("button", {
            className: "btn btn-transparent dropdown-btn js-dropdown-toggle",
            "tabindex": "0", "aria-haspopup": "true", "aria-expanded": "false",
            innerHTML: "Places"
          }, placesDropdown);
          domConstruct.create("span", { className: "icon-ui-down" }, placesBtn);
          // MENU //
          const placesMenu = domConstruct.create("nav", { className: "dropdown-menu modifier-class" }, placesDropdown);

          // BOOKMARKS //
          view.map.bookmarks.forEach((bookmark) => {
            // MENU ITEM //
            const bookmarkNode = domConstruct.create("div", {
              className: "dropdown-link",
              role: "menu-item",
              innerHTML: bookmark.name
            }, placesMenu);
            on(bookmarkNode, "click", () => {
              view.goTo({ target: Extent.fromJSON(bookmark.extent) });
            });
          });

          // INITIALIZE CALCITE DROPDOWN //
          calcite.dropdown();
        }
      }

    },

    /**
     *
     * @param layer
     * @param error
     */
    addLayerNotification: function (layer, error) {
      const notificationsNode = dom.byId("notifications-node");

      const alertNode = domConstruct.create("div", {
        className: error ? this.CSS.NOTIFICATION_TYPE.ERROR : this.CSS.NOTIFICATION_TYPE.SUCCESS
      }, notificationsNode);

      const alertCloseNode = domConstruct.create("div", { className: "inline-block esri-interactive icon-ui-close margin-left-1 right" }, alertNode);
      on.once(alertCloseNode, "click", () => {
        domConstruct.destroy(alertNode);
      });

      domConstruct.create("div", { innerHTML: error ? error.message : `Layer '${layer.title}' added to map...` }, alertNode);

      if(error) {
        if(layer.portalItem) {
          const itemDetailsPageUrl = `${this.base.portal.url}/home/item.html?id=${layer.portalItem.id}`;
          domConstruct.create("a", { innerHTML: "view item details", target: "_blank", href: itemDetailsPageUrl }, alertNode);
        }
      } else {
        setTimeout(() => {
          domClass.toggle(alertNode, "animate-in-up animate-out-up");
          setTimeout(() => {
            domConstruct.destroy(alertNode);
          }, 500)
        }, 4000);
      }
    },

    /**
     *
     * @param view
     * @param layer_title
     * @returns {*}
     */
    whenLayerReady: function (view, layer_title) {

      const layer = view.map.layers.find(layer => {
        return (layer.title === layer_title);
      });
      if(layer) {
        return layer.load().then(() => {
          if(layer.visible) {
            return view.whenLayerView(layer).then((layerView) => {
              if(layerView.updating) {
                return watchUtils.whenNotOnce(layerView, "updating").then(() => {
                  return { layer: layer, layerView: layerView };
                });
              } else {
                return watchUtils.whenOnce(layerView, "updating").then(() => {
                  return watchUtils.whenNotOnce(layerView, "updating").then(() => {
                    return { layer: layer, layerView: layerView };
                  });
                });
              }
            });
          } else {
            return promiseUtils.resolve({ layer: layer, layerView: null });
          }
        });
      } else {
        return promiseUtils.reject(new Error(`Can't find layer '${layer_title}'`));
      }

    },


    /**
     *
     * @param view
     */
    initializeSceneMarkup: function (view) {

      // TOOLS PANEL //
      view.ui.add("tools-panel", "top-right");
      domClass.remove("tools-panel", "hide");

      // GROUND OPACITY //
      const ground_opacity_input = dom.byId("ground-opacity-input");
      on(ground_opacity_input, "change", () => {
        view.map.ground.opacity = ground_opacity_input.checked ? 0.5 : 1;
      });
      view.map.watch("ground.opacity", opacity => {
        ground_opacity_input.checked = (opacity < 1.0);
      });


      this.whenLayerReady(view, "Feedback - Feedback").then(layer_infos => {
        const markup_layer = layer_infos.layer;
        const markup_layerView = layer_infos.layerView;

        this.initializeUserLocation(view, markup_layer);

        this.isUnderground = (location) => {
          return (location.z < view.groundView.elevationSampler.queryElevation(location).z);
        };

        // FEEDBACK LIST //
        this.initializeFeedbackList(view, markup_layer);

        // FEATURE FORM //
        const feature_form = new FeatureForm({
          container: "feature-form",
          layer: markup_layer,
          fieldConfig: [
            {
              name: "label",
              options: {
                editorType: "text-box",
                hint: "descriptive label in the view"
              }
            },
            {
              name: "comments",
              options: {
                editorType: "text-area",
                hint: "full markup comments"
              }
            },
            {
              name: "createdon",
              options: {
                visible: false,
                editable: false
              }
            },
            {
              name: "username",
              options: {
                editorType: "text-box",
                editable: false,
                hint: "the name of the currently signed-in user, if any"
              }
            }
          ]
        });
        feature_form.on("value-change", () => {
          validate_feedback();
        });

        // VALIDATE FEEDBACK //
        //  - NOTE: SPECIFIC TO THIS FEATURELAYER SCHEMA //
        const validate_feedback = () => {
          const has_no_geometry = (feature_form.feature.geometry == null);
          const new_atts = feature_form.getValues();
          const has_invalid_atts = (new_atts.label == null) || (new_atts.comments == null);
          domClass.toggle("submit-feedback-btn", "btn-disabled", has_no_geometry || has_invalid_atts);
        };

        // GET FEATURE PROTOTYPE //
        const getPrototype = () => {
          const prototype = Graphic.fromJSON(markup_layer.templates[0].prototype);
          prototype.attributes.username = (this.base.portal.user) ? this.base.portal.user.username : "anonymous";
          prototype.attributes.createdon = (new Date()).valueOf();
          return prototype;
        };

        // ADD FEEDBACK LOCATION //
        const click_handle = on.pausable(view, "click", evt => {
          this.updateLocationGraphic(evt.mapPoint);
          dom.byId("location-node").innerHTML = `${evt.mapPoint.longitude.toFixed(5)}, ${evt.mapPoint.latitude.toFixed(5)}, ${evt.mapPoint.z.toFixed(2)}`;
          feature_form.feature.geometry = evt.mapPoint;
          validate_feedback();
        });
        click_handle.pause();

        // ADD FEEDBACK //
        const addFeedbackBtn = dom.byId("add-feedback-btn");
        on(addFeedbackBtn, "click", () => {
          domClass.toggle(addFeedbackBtn, "btn-clear btn-disabled");
          if(domClass.contains(addFeedbackBtn, "btn-clear")) {

            // ALLOW USE TO ENTER ATTRIBUTES BEFORE SETTING FEEDBACK LOCATION //
            dom.byId("location-node").innerHTML = "click on the map to set the location";
            feature_form.feature = getPrototype();
            domClass.remove("feature-form-container", "hide");

            // SET FEEDBACK LOCATION //
            view.container.style.cursor = "crosshair";
            click_handle.resume();

          } else {
            click_handle.pause();
          }
        });
        domClass.remove(addFeedbackBtn, "btn-disabled");

        // SUBMIT FEEDBACK //
        const submitFeedbackBtn = dom.byId("submit-feedback-btn");
        on(submitFeedbackBtn, "click", () => {
          domClass.remove(addFeedbackBtn, "btn-clear btn-disabled");

          view.container.style.cursor = "default";
          click_handle.pause();
          this.updateLocationGraphic();

          const new_feature = new Graphic({
            geometry: feature_form.feature.geometry,
            attributes: feature_form.getValues()
          });

          // ADD NEW FEATURE TO FEATURE LAYER //
          markup_layer.applyEdits({ addFeatures: [new_feature] }).then(applyEditsResponse => {
            domClass.add("feature-form-container", "hide");

            // ADD FEATURE RESULTS //
            const addFeatureResult = applyEditsResponse.addFeatureResults[0];
            if(!addFeatureResult.error) {

              // NEW FEATURE QUERY //
              const new_feature_query = markup_layer.createQuery();
              new_feature_query.returnZ = markup_layer.hasZ;
              new_feature_query.objectIds = [addFeatureResult.objectId];
              //console.info(new_feature_query);

              // GET NEW FEATURE //
              markup_layer.queryFeatures(new_feature_query).then(featureSet => {
                if(featureSet.features.length > 0) {
                  // ADD FEEDBACK NODE //
                  this.addFeedbackNode(view, featureSet.features[0]);
                } else {
                  console.error(new Error("Could NOT find new feature."))
                }
              });
            } else {
              console.error("Apply Edits Error: ", addFeatureResult.error);
            }
          });
        });

        // CANCEL FEEDBACK //
        const cancelFeedbackBtn = dom.byId("cancel-feedback-btn");
        on(cancelFeedbackBtn, "click", () => {
          view.container.style.cursor = "default";
          click_handle && click_handle.pause();
          domClass.add("feature-form-container", "hide");
          dom.byId("location-node").innerHTML = "click on the map to set the location";
          feature_form.feature = null;
          domClass.remove(addFeedbackBtn, "btn-clear btn-disabled");
        });

      });

    },

    /**
     *
     * @param view
     * @param markup_layer
     */
    initializeUserLocation: function (view, markup_layer) {

      let location_graphic = new Graphic({ symbol: markup_layer.renderer.clone().symbol });
      const location_layer = new GraphicsLayer({ graphics: [location_graphic] });
      view.map.add(location_layer);

      this.updateLocationGraphic = (location) => {
        location_layer.remove(location_graphic);
        location_graphic = location_graphic.clone();
        location_graphic.geometry = location;
        location_layer.add(location_graphic);
      };

    },

    /**
     *
     * @param view
     * @param markup_layer
     */
    initializeFeedbackList: function (view, markup_layer) {

      const all_features_query = markup_layer.createQuery();
      all_features_query.returnZ = markup_layer.hasZ;

      markup_layer.queryFeatures(all_features_query).then(featureSet => {
        domClass.toggle("feedback-list", "no-data", (featureSet.features.length === 0));
        domConstruct.empty("feedback-list");
        featureSet.features.forEach((feature) => {
          this.addFeedbackNode(view, feature)
        });
      });

    },

    /**
     *
     * @param view
     * @param feature
     */
    addFeedbackNode: function (view, feature) {

      const feedback_node = domConstruct.create("div", { className: "feedback-node side-nav-link" }, "feedback-list");

      const zoom_in_node = domConstruct.create("span", {
        className: "zoom-node icon-ui-zoom-in-magnifying-glass right",
        title: "Zoom to location..."
      }, feedback_node);
      domConstruct.create("div", {
        className: "avenir-demi font-size-0",
        innerHTML: feature.attributes.label
      }, feedback_node);
      domConstruct.create("div", {
        className: "panel panel-white panel-no-border font-size--1",
        innerHTML: feature.attributes.comments
      }, feedback_node);
      domConstruct.create("div", {
        className: "font-size--3 avenir-italic text-dark-gray text-right",
        innerHTML: `Created by ${feature.attributes.username || "anonymous"} on ${locale.format(new Date(feature.attributes.createdon))}`
      }, feedback_node);

      on(zoom_in_node, "click", () => {
        const is_underground = this.isUnderground(feature.geometry);
        const tilt = is_underground ? 95.0 : 80.0;
        view.goTo({ target: feature, tilt: tilt });
      });

      dom.byId("feedback-list-count").innerHTML = number.format(query(".feedback-node", "feedback-list").length);

    }

  });
});