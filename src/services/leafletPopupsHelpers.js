angular.module("leaflet-directive")
    .service('leafletPopupsHelpers',
    function ($rootScope, leafletHelpers, $log, $compile,
              leafletGeoJsonHelpers) {

        var isDefined = leafletHelpers.isDefined,
            defaultTo = leafletHelpers.defaultTo,
            safeApply = leafletHelpers.safeApply,
            Helpers = leafletHelpers,
            isString = leafletHelpers.isString,
            isNumber = leafletHelpers.isNumber,
            isObject = leafletHelpers.isObject,
            groups = {},
            _geoHlp = leafletGeoJsonHelpers,
            _errorHeader = leafletHelpers.errorHeader,
            _thingName = 'popup',
        //all avail popup option properties http://leafletjs.com/reference.html#popup
            _optKeys = ['maxWidth', 'minWidth', 'maxHeight', 'minHeight',
                'autoPan', 'keepInView', 'closeButton', 'offset',
                'autoPanPaddingTopLeft', 'autoPanPaddingBottomRight',
                'autoPanPadding', 'zoomAnimation', 'closeOnClick', 'className'];


        var _string = function (lObj) {
            //this exists since JSON.stringify barfs on cyclic
            var retStr = '';
            ['_latlng', '_leaflet_id', '_map'].forEach(function (prop) {
                retStr += prop + ': ' + defaultTo(lObj[prop], 'undefined') + ' \n';
            });
            return '[leafletMarker] : \n' + retStr;
        };
        var _log = function (lObj, useConsole) {
            var logger = useConsole ? console : $log;
            logger.debug(_string(lObj));
        };


        var _resetGroup = function (groupName) {
            if (isDefined(groups[groupName])) {
                groups.splice(groupName, 1);
            }
        };

        var _resetGroups = function () {
            groups = {};
        };

        var _remove = function (lObj, map, layers) {
            lObj.closePopup();
            // There is no easy way to know if a marker is added to a layer, so we search for it
            // if there are overlays
            if (isDefined(layers) && isDefined(layers.overlays)) {
                for (var key in layers.overlays) {
                    if (layers.overlays[key] instanceof L.LayerGroup || layers.overlays[key] instanceof L.FeatureGroup) {
                        if (layers.overlays[key].hasLayer(lObj)) {
                            layers.overlays[key].removeLayer(lObj);
                            return;
                        }
                    }
                }
            }

            if (isDefined(groups)) {
                for (var groupKey in groups) {
                    if (groups[groupKey].hasLayer(lObj)) {
                        groups[groupKey].removeLayer(lObj);
                    }
                }
            }

            if (map.hasLayer(lObj)) {
                map.removeLayer(lObj);
            }
        };

        var _manageOpenPopup = function (lObj, model) {
            lObj.openPopup();

            //the marker may have angular templates to compile
            var popup = lObj.getPopup(),
            //the marker may provide a scope returning function used to compile the message
            //default to $rootScope otherwise
                markerScope = angular.isFunction(model.getMessageScope) ? model.getMessageScope() : $rootScope,
                compileMessage = isDefined(model.compileMessage) ? model.compileMessage : true;

            if (isDefined(popup)) {
                var updatePopup = function (popup) {
                    popup._updateLayout();
                    popup._updatePosition();
                };

                if (compileMessage) {
                    $compile(popup._contentNode)(markerScope);
                    //in case of an ng-include, we need to update the content after template load
                    if (isDefined(popup._contentNode) && popup._contentNode.innerHTML.indexOf("ngInclude") > -1) {
                        var unregister = markerScope.$on('$includeContentLoaded', function () {
                            updatePopup(popup);
                            unregister();
                        });
                    }
                    else {
                        updatePopup(popup);
                    }
                }
            }
        };

        var _manageOpenLabel = function (lObj, model) {
            var markerScope = angular.isFunction(model.getMessageScope) ? model.getMessageScope() : $rootScope,
                labelScope = angular.isFunction(model.getLabelScope) ? model.getLabelScope() : markerScope,
                compileMessage = isDefined(model.compileMessage) ? model.compileMessage : true;

            if (Helpers.LabelPlugin.isLoaded() && isDefined(model.label)) {
                if (isDefined(model.label.options) && model.label.options.noHide === true) {
                    lObj.showLabel();
                }
                if (compileMessage) {
                    $compile(lObj.label._container)(labelScope);
                }
            }
        };

        return {
            resetGroup: _resetGroup,

            resetGroups: _resetGroups,

            remove: _remove,

            manageOpenPopup: _manageOpenPopup,

            manageOpenLabel: _manageOpenLabel,

            create: function (model, content) {
                if (!isDefined(model) || !_geoHlp.validateCoords(model)) {
                    $log.error(_errorHeader + 'The ' + _thingName + ' definition is not valid.');
                    return;
                }
                var coords = _geoHlp.getCoords(model);

                if (!isDefined(coords)) {
                    $log.error(_errorHeader + 'Unable to get coordinates from markerData.');
                    return;
                }

                var lOpts = {};
                //TODO implement someway like ui-gmap to allow the model to be more flexible on options
                //can be a string or binding directive to tell where options are.
                var modelOptions = model;//default legacy always points to self object no nesting or unique data struct
                _optKeys.forEach(function(propName){
                    if(isDefined(modelOptions[propName]))
                        lOpts[propName] = modelOptions[propName]
                });

                // not sure if I like this (nmccready)
                // seems this is allowed for plugins.. maybe
                for (var otherOpt in model) {
                    if (model.hasOwnProperty(otherOpt) && !lOpts.hasOwnProperty(otherOpt)) {
                        lOpts[otherOpt] = model[otherOpt];
                    }
                }

                var lObj = (new L.popup(lOpts))
                    .setLatLng(coords);

                return lObj;
            },

            addToGroup: function (lObj, groupName, groupOptions, map) {
                if (!isString(groupName)) {
                    $log.error(_errorHeader + 'The marker group you have specified is invalid.');
                    return;
                }

                if (!MarkerClusterPlugin.isLoaded()) {
                    $log.error(_errorHeader + "The MarkerCluster plugin is not loaded.");
                    return;
                }
                if (!isDefined(groups[groupName])) {
                    groups[groupName] = new L.MarkerClusterGroup(groupOptions);
                    map.addLayer(groups[groupName]);
                }
                groups[groupName].addLayer(lObj);
            },

            listenEvents: function (lObj, model, leafletScope, watching) {
                lObj.on("popupopen", function (/* event */) {
                    if (watching) {
                        safeApply(leafletScope, function () {
                            model.focus = true;
                        });
                    } else {
                        _manageOpenPopup(lObj, model);
                    }
                });
                lObj.on("popupclose", function (/* event */) {
                    if (watching) {
                        safeApply(leafletScope, function () {
                            model.focus = false;
                        });
                    }
                });
            },

            addWatcher: function (lObj, name, leafletScope, layers, map) {
                var watchPath = Helpers.getObjectArrayPath("popups." + name);
                var clearWatch = leafletScope.$watch(watchPath, function (newModel, oldModel) {
                    if (!isDefined(newModel)) {
                        _remove(lObj, map, layers);
                        clearWatch();
                        return;
                    }

                    if (!isDefined(oldModel)) {
                        return;
                    }

                    // Update the lat-lng property (always present in marker properties)
                    if (!_geoHlp.validateCoords(newModel)) {
                        $log.warn('There are problems with lat-lng data, please verify your marker model');
                        _remove(lObj, map, layers);
                        return;
                    }

                    // watch is being initialized if old and new object is the same
                    var isInitializing = newModel === oldModel;

                    // Update marker rotation
                    if (isDefined(newModel.iconAngle) && oldModel.iconAngle !== newModel.iconAngle) {
                        lObj.setIconAngle(newModel.iconAngle);
                    }

                    // It is possible that the layer has been removed or the layer marker does not exist
                    // Update the layer group if present or move it to the map if not
                    if (!isString(newModel.layer)) {
                        // There is no layer information, we move the marker to the map if it was in a layer group
                        if (isString(oldModel.layer)) {
                            // Remove from the layer group that is supposed to be
                            if (isDefined(layers.overlays[oldModel.layer]) &&
                                layers.overlays[oldModel.layer].hasLayer(lObj)) {

                                layers.overlays[oldModel.layer].removeLayer(lObj);
                                lObj.closePopup();
                            }
                            // Test if it is not on the map and add it
                            if (!map.hasLayer(lObj)) {
                                map.addLayer(lObj);
                            }
                        }
                    }

                    if ((isNumber(newModel.opacity) || isNumber(parseFloat(newModel.opacity))) &&
                        newModel.opacity !== oldModel.opacity) {
                        // There was a different opacity so we update it
                        lObj.setOpacity(newModel.opacity);
                    }

                    if (isString(newModel.layer) && oldModel.layer !== newModel.layer) {
                        // If it was on a layer group we have to remove it
                        if (isString(oldModel.layer) && isDefined(layers.overlays[oldModel.layer]) &&
                            layers.overlays[oldModel.layer].hasLayer(lObj)) {
                            layers.overlays[oldModel.layer].removeLayer(lObj);
                        }
                        lObj.closePopup();

                        // Remove it from the map in case the new layer is hidden or there is an error in the new layer
                        if (map.hasLayer(lObj)) {
                            map.removeLayer(lObj);
                        }

                        // The markerData.layer is defined so we add the marker to the layer if it is different from the old data
                        if (!isDefined(layers.overlays[newModel.layer])) {
                            $log.error(_errorHeader + 'You must use a name of an existing layer');
                            return;
                        }
                        // Is a group layer?
                        var layerGroup = layers.overlays[newModel.layer];
                        if (!(layerGroup instanceof L.LayerGroup || layerGroup instanceof L.FeatureGroup)) {
                            $log.error(_errorHeader + 'A marker can only be added ' +
                            'to a layer of type "group" or "featureGroup"');
                            return;
                        }
                        // The marker goes to a correct layer group, so first of all we add it
                        layerGroup.addLayer(lObj);
                        // The marker is automatically added to the map depending on the visibility
                        // of the layer, so we only have to open the popup if the marker is in the map
                        if (map.hasLayer(lObj) && newModel.focus === true) {
                            _manageOpenPopup(lObj, newModel);
                        }
                    }

                    // Update the draggable property
                    if (newModel.draggable !== true && oldModel.draggable === true && (isDefined(lObj.dragging))) {
                        lObj.dragging.disable();
                    }

                    if (newModel.draggable === true && oldModel.draggable !== true) {
                        // The markerData.draggable property must be true so
                        // we update if there wasn't a previous value or it wasn't true
                        if (lObj.dragging) {
                            lObj.dragging.enable();
                        } else {
                            if (L.Handler.MarkerDrag) {
                                lObj.dragging = new L.Handler.MarkerDrag(lObj);
                                lObj.options.draggable = true;
                                lObj.dragging.enable();
                            }
                        }
                    }

                    // Update the icon property
                    if (!isObject(newModel.icon)) {
                        // If there is no icon property or it's not an object
                        if (isObject(oldModel.icon)) {
                            // If there was an icon before restore to the default
                            lObj.setIcon(createLeafletIcon());
                            lObj.closePopup();
                            lObj.unbindPopup();
                            if (isString(newModel.message)) {
                                lObj.bindPopup(newModel.message, newModel.popupOptions);
                            }
                        }
                    }

                    if (isObject(newModel.icon) && isObject(oldModel.icon) && !angular.equals(newModel.icon, oldModel.icon)) {
                        var dragG = false;
                        if (lObj.dragging) {
                            dragG = lObj.dragging.enabled();
                        }
                        lObj.setIcon(createLeafletIcon(newModel.icon));
                        if (dragG) {
                            lObj.dragging.enable();
                        }
                        lObj.closePopup();
                        lObj.unbindPopup();
                        if (isString(newModel.message)) {
                            lObj.bindPopup(newModel.message, newModel.popupOptions);
                        }
                    }

                    // Update the Popup message property
                    if (!isString(newModel.message) && isString(oldModel.message)) {
                        lObj.closePopup();
                        lObj.unbindPopup();
                    }

                    // Update the label content or bind a new label if the old one has been removed.
                    if (Helpers.LabelPlugin.isLoaded()) {
                        if (isDefined(newModel.label) && isDefined(newModel.label.message)) {
                            if ('label' in oldModel && 'message' in oldModel.label && !angular.equals(newModel.label.message, oldModel.label.message)) {
                                lObj.updateLabelContent(newModel.label.message);
                            } else if (!angular.isFunction(lObj.getLabel)) {
                                lObj.bindLabel(newModel.label.message, newModel.label.options);
                                _manageOpenLabel(lObj, newModel);
                            } else {
                                _manageOpenLabel(lObj, newModel);
                            }
                        } else if (!('label' in newModel && !('message' in newModel.label))) {
                            if (angular.isFunction(lObj.unbindLabel)) {
                                lObj.unbindLabel();
                            }
                        }
                    }

                    // There is some text in the popup, so we must show the text or update existing
                    if (isString(newModel.message) && !isString(oldModel.message)) {
                        // There was no message before so we create it
                        lObj.bindPopup(newModel.message, newModel.popupOptions);
                    }

                    if (isString(newModel.message) && isString(oldModel.message) && newModel.message !== oldModel.message) {
                        // There was a different previous message so we update it
                        lObj.setPopupContent(newModel.message);
                    }

                    // Update the focus property
                    var updatedFocus = false;
                    if (newModel.focus !== true && oldModel.focus === true) {
                        // If there was a focus property and was true we turn it off
                        lObj.closePopup();
                        updatedFocus = true;
                    }

                    // The markerData.focus property must be true so we update if there wasn't a previous value or it wasn't true
                    if (newModel.focus === true && ( !isDefined(oldModel.focus) || oldModel.focus === false) ||
                        (isInitializing && newModel.focus === true)) {
                        // Reopen the popup when focus is still true
                        _manageOpenPopup(lObj, newModel);
                        updatedFocus = true;
                    }

                    // zIndexOffset adjustment
                    if (oldModel.zIndexOffset !== newModel.zIndexOffset) {
                        lObj.setZIndexOffset(newModel.zIndexOffset);
                    }

                    var markerLatLng = lObj.getLatLng();
                    var isCluster = (isString(newModel.layer) &&
                    Helpers.MarkerClusterPlugin.is(layers.overlays[newModel.layer]));
                    // If the marker is in a cluster it has to be removed and added to the layer when the location is changed
                    if (isCluster) {
                        // The focus has changed even by a user click or programatically
                        if (updatedFocus) {
                            // We only have to update the location if it was changed programatically, because it was
                            // changed by a user drag the marker data has already been updated by the internal event
                            // listened by the directive
                            if ((newModel.lat !== oldModel.lat) || (newModel.lng !== oldModel.lng)) {
                                layers.overlays[newModel.layer].removeLayer(lObj);
                                lObj.setLatLng([newModel.lat, newModel.lng]);
                                layers.overlays[newModel.layer].addLayer(lObj);
                            }
                        } else {
                            // The marker has possibly moved. It can be moved by a user drag (marker location and data are equal but old
                            // data is diferent) or programatically (marker location and data are diferent)
                            if ((markerLatLng.lat !== newModel.lat) || (markerLatLng.lng !== newModel.lng)) {
                                // The marker was moved by a user drag
                                layers.overlays[newModel.layer].removeLayer(lObj);
                                lObj.setLatLng([newModel.lat, newModel.lng]);
                                layers.overlays[newModel.layer].addLayer(lObj);
                            } else if ((newModel.lat !== oldModel.lat) || (newModel.lng !== oldModel.lng)) {
                                // The marker was moved programatically
                                layers.overlays[newModel.layer].removeLayer(lObj);
                                lObj.setLatLng([newModel.lat, newModel.lng]);
                                layers.overlays[newModel.layer].addLayer(lObj);
                            } else if (isObject(newModel.icon) && isObject(oldModel.icon) && !angular.equals(newModel.icon, oldModel.icon)) {
                                layers.overlays[newModel.layer].removeLayer(lObj);
                                layers.overlays[newModel.layer].addLayer(lObj);
                            }
                        }
                    } else if (markerLatLng.lat !== newModel.lat || markerLatLng.lng !== newModel.lng) {
                        lObj.setLatLng([newModel.lat, newModel.lng]);
                    }
                }, true);
            },
            string: _string,
            log: _log
        };
    });
