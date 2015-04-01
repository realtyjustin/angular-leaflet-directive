angular.module("leaflet-directive").directive('popups',
    function ($log, $rootScope, $q, leafletData, leafletHelpers,
              leafletMapDefaults, leafletPopupsHelpers,
              leafletEvents, leafletIterators) {
    //less terse vars to helpers
    var isDefined = leafletHelpers.isDefined,
        errorHeader = leafletHelpers.errorHeader,
        defaultTo= leafletHelpers.defaultTo,
        Helpers = leafletHelpers,
        isString = leafletHelpers.isString,
        addMarkerWatcher = leafletPopupsHelpers.addMarkerWatcher,
        listenMarkerEvents = leafletPopupsHelpers.listenMarkerEvents,
        addMarkerToGroup = leafletPopupsHelpers.addMarkerToGroup,
        bindMarkerEvents = leafletEvents.bindMarkerEvents,
        createMarker = leafletPopupsHelpers.createMarker,
        deleteMarker = leafletPopupsHelpers.deleteMarker,
        $it = leafletIterators;

    var _maybeAddToLayer = function(layerName, layers, popupModel, marker, shouldWatch, map){

        if (!isString(layerName)) {
            $log.error(errorHeader + ' A layername must be a string');
            return false;
        }

        if (!isDefined(layers)) {
            $log.error(errorHeader + ' You must add layers to the directive if the markers are going to use this functionality.');
            return false;
        }

        if (!isDefined(layers.overlays) || !isDefined(layers.overlays[layerName])) {
            $log.error(errorHeader +' A marker can only be added to a layer of type "group"');
            return false;
        }
        var layerGroup = layers.overlays[layerName];
        if (!(layerGroup instanceof L.LayerGroup || layerGroup instanceof L.FeatureGroup)) {
            $log.error(errorHeader + ' Adding a marker to an overlay needs a overlay of the type "group" or "featureGroup"');
            return false;
        }

        // The marker goes to a correct layer group, so first of all we add it
        layerGroup.addLayer(marker);

        // The marker is automatically added to the map depending on the visibility
        // of the layer, so we only have to open the popup if the marker is in the map
        if (!shouldWatch && map.hasLayer(marker) && popupModel.focus === true) {
            leafletPopupsHelpers.manageOpenPopup(marker, popupModel);
        }
        return true;
    };

    var _add = function(popupsToRender, map, layers, leafletPopups, leafletScope,
      shouldWatch, maybeLayerName){
        shouldWatch = defaultTo(shouldWatch, false);

        for (var newName in popupsToRender) {
            if (newName.search("-") !== -1) {
                $log.error('The popup can\'t use a "-" on his key name: "' + newName + '".');
                continue;
            }

            if (!isDefined(leafletPopups[newName])) {
                var popupModel = popupsToRender[newName];
                var popup = createMarker(popupModel);
                if (!isDefined(popup)) {
                    $log.error(errorHeader + ' Received invalid data on the marker ' + newName + '.');
                    continue;
                }
                leafletPopups[newName] = popup;

                // Bind message
                if (isDefined(popupModel.message)) {
                    popup.bindPopup(popupModel.message, popupModel.popupOptions);
                }

                // Add the marker to a cluster group if needed
                if (isDefined(popupModel.group)) {
                    var groupOptions = isDefined(popupModel.groupOption) ? popupModel.groupOption : null;
                    addMarkerToGroup(popup, popupModel.group, groupOptions, map);
                }

                // Show label if defined
                if (Helpers.LabelPlugin.isLoaded() && isDefined(popupModel.label) && isDefined(popupModel.label.message)) {
                    popup.bindLabel(popupModel.label.message, popupModel.label.options);
                }

                // Check if the marker should be added to a layer
                if (isDefined(popupModel) && (isDefined(popupModel.layer) || isDefined(maybeLayerName))){

                    var pass = _maybeAddToLayer(
                        popupModel.layer || maybeLayerName, //original way takes pref
                        layers,
                        popupModel, popup, shouldWatch, map
                    );
                    if(!pass)
                        continue; //something went wrong move on in the loop
                } else if (!isDefined(popupModel.group)) {
                    // We do not have a layer attr, so the marker goes to the map layer
                    map.addLayer(popup);
                    if (!shouldWatch && popupModel.focus === true) {
                        leafletPopupsHelpers.manageOpenPopup(popup, popupModel);
                    }
                }
                var pathToMarker = Helpers.getObjectDotPath(maybeLayerName? [maybeLayerName, newName]: [newName]);
                if (shouldWatch) {
                    addMarkerWatcher(popup, pathToMarker, leafletScope, layers, map);
                }

                listenMarkerEvents(popup, popupModel, leafletScope, shouldWatch);
                bindMarkerEvents(popup, pathToMarker, popupModel, leafletScope);
            }
        }
    };
    var _destroy = function(popupModels, lPopups, map, layers){
        var hasLogged = false;
        for (var name in lPopups) {
            if(!hasLogged) {
                $log.debug(errorHeader + "[popups] destroy: ");
                hasLogged = true;
            }
            if (!isDefined(popupModels) || !isDefined(popupModels[name])) {
                deleteMarker(lPopups[name], map, layers);
                delete lPopups[name];
            }
        }
    };

    return {
        restrict: "A",
        scope: false,
        replace: false,
        require: ['leaflet', '?layers'],

        link: function(scope, element, attrs, controller) {
            var mapController = controller[0],
                leafletScope  = mapController.getLeafletScope();

            mapController.getMap().then(function(map) {
                var leafletPopups = {}, getLayers;

                // If the layers attribute is used, we must wait until the layers are created
                if (isDefined(controller[1])) {
                    getLayers = controller[1].getLayers;
                } else {
                    getLayers = function() {
                        var deferred = $q.defer();
                        deferred.resolve();
                        return deferred.promise;
                    };
                }

                getLayers().then(function(layers) {
                    leafletData.setPopups(leafletPopups, attrs.id);
                    leafletScope.$watch('popups', function(newPopups) {
                        _destroy(newPopups, leafletPopups, map, layers);
                        // Should we watch for every specific marker on the map?
                        var shouldWatch =
                          (!isDefined(attrs.watchMarkers) ||
                            Helpers.isTruthy(attrs.watchMarkers));

                        var isNested = (isDefined(attrs.markersNested) &&
                          Helpers.isTruthy(attrs.markersNested));

                        if(isNested) {
                            $it.each(newPopups, function(popupsToAdd, layerName) {
                                _add(popupsToAdd, map, layers, leafletPopups,
                                  leafletScope, shouldWatch, layerName);
                            });
                            return;
                        }
                        _add(newPopups, map, layers, leafletPopups, leafletScope, shouldWatch);
                    }, true);
                });
            });
        }
    };
});
