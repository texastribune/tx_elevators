/*global window, navigator, console, google */

// django csrf setup
// https://docs.djangoproject.com/en/dev/ref/contrib/csrf/#ajax
(function($){
  "use strict";
  // using jQuery
  function getCookie(name) {
    var cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      var cookies = document.cookie.split(';');
      for (var i = 0; i < cookies.length; i++) {
        var cookie = $.trim(cookies[i]);
        // Does this cookie string begin with the name we want?
        if (cookie.substring(0, name.length + 1) == (name + '=')) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }

  function csrfSafeMethod(method) {
    // these HTTP methods do not require CSRF protection
    return (/^(GET|HEAD|OPTIONS|TRACE)$/.test(method));
  }

  function sameOrigin(url) {
    // test that a given url is a same-origin URL
    // url could be relative or scheme relative or absolute
    var host = document.location.host; // host + port
    var protocol = document.location.protocol;
    var sr_origin = '//' + host;
    var origin = protocol + sr_origin;
    // Allow absolute or scheme relative URLs to same origin
    return (url == origin || url.slice(0, origin.length + 1) == origin + '/') ||
        (url == sr_origin || url.slice(0, sr_origin.length + 1) == sr_origin + '/') ||
        // or any other URL that isn't scheme relative or absolute i.e relative.
        !(/^(\/\/|http:|https:).*/.test(url));
  }

  var csrftoken = getCookie('csrftoken');
  $.ajaxSetup({
      beforeSend: function(xhr, settings) {
          if (!csrfSafeMethod(settings.type) && sameOrigin(settings.url)) {
              // Send the token to same-origin, relative URLs only.
              // Send the token only if the method warrants CSRF protection
              // Using the CSRFToken value acquired earlier
              xhr.setRequestHeader("X-CSRFToken", csrftoken);
          }
      }
  });
})(window.jQuery);


// maps
(function(exports, $){
  "use strict";
  var $container = $('#nav-map-container'),
      map,
      homePin,
      buildingMarkers = [],
      debug = $('body').data('debug');

  var initMap = function(center){
    var mapOptions = {
          zoom: 14,
          mapTypeControl: false,
          scrollwheel: false,
          streetViewControl: false,
          center: center,
          mapTypeId: google.maps.MapTypeId.ROADMAP
        };
    map = new google.maps.Map($container[0], mapOptions);
    $('<button type="button" class="btn"><i class="icon-screenshot"></i> Redo Search in Map</button>')
      .click(function(){
        var center = map.getCenter(),
            position = {coords:{
              latitude: center.lat(),
              longitude: center.lng()
            }};
        window.getClosestBuildings(position);
      })
      .insertAfter($container);
  };

  var load = function(centerLatLng, buildings){
    var center = new google.maps.LatLng(
          centerLatLng.latitude,
          centerLatLng.longitude);
    var pinColor = "FFFF00";
    var pinImage = new google.maps.MarkerImage(
          "https://chart.apis.google.com/chart?chst=d_map_pin_icon&chld=home|" + pinColor,
          new google.maps.Size(21, 34),
          new google.maps.Point(0,0),
          new google.maps.Point(10, 34));
    var pinShadow = new google.maps.MarkerImage("https://chart.apis.google.com/chart?chst=d_map_pin_shadow",
        new google.maps.Size(40, 37),
        new google.maps.Point(0, 0),
        new google.maps.Point(12, 35));

    if (!map) {
      initMap(center);
    }

    if (!homePin){
      homePin = new google.maps.Marker({
        position: center,
        draggable: true,
        map: map,
        icon: pinImage,
        shadow: pinShadow
      });
      google.maps.event.addDomListener(homePin, 'dragend', function(evt){
        // this: marker
        var newLocation = evt.latLng;
            position = {coords:{
              latitude: newLocation.lat(),
              longitude: newLocation.lng()
            }};
        console.log("drag ended", position.coords);
        window.getClosestBuildings(position);
      });
    } else {
      homePin.setPosition(center);
    }

    if (buildings){
      var building,
          position,
          buildingMarker,
          bounds = new google.maps.LatLngBounds();
      bounds.extend(center);
      pinColor = "FE7569";
      buildingMarkers.forEach(function(x){ x.setMap(null); });
      buildingMarkers = [];
      $.each(buildings, function(i, building){
        position = new google.maps.LatLng(building.latitude, building.longitude);

        pinImage = new google.maps.MarkerImage(
          "https://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=" +
            String.fromCharCode(65 + i) + "|" + pinColor,
          new google.maps.Size(21, 34),
          new google.maps.Point(0,0),
          new google.maps.Point(10, 34));

        buildingMarker = new google.maps.Marker({
          position: position,
          map: map,
          icon: pinImage,
          shadow: pinShadow,
          title: building.name_1 + ' '  + building.address_1
        });
        if (debug){
          // enable map pin correction
          buildingMarker.setDraggable(true);
          google.maps.event.addDomListener(buildingMarker, 'dragend', function(evt){
            var newLocation = evt.latLng;
                position = {coords:{
                  latitude: newLocation.lat(),
                  longitude: newLocation.lng()
                }};
            $.post(building.url, position, function(data){
              console.log(data);
            });
          });
        }
        buildingMarkers.push(buildingMarker);
        bounds.extend(position);
      });
      map.fitBounds(bounds);
    }
  };


  // exports
  exports.loadMap = load;

})(window, window.jQuery);


// app
(function(exports, $){
  "use strict";

  var _data;

  var storeData = function(data){
    // modify data in place to convert lat/lng into numbers
    $.each(data, function (idx, x) {
      x.latitude = parseFloat(x.latitude);
      x.longitude = parseFloat(x.longitude);
    });
    _data = data;
  };


  // distance approximators
  /** Converts numeric degrees to radians */
  if (!Number.prototype.toRad){
    Number.prototype.toRad = function(){
      return this * Math.PI / 180;
    };
  }

  // http://www.movable-type.co.uk/scripts/latlong.html
  var distance = {
    R: 6371,  // kilometers
    haversine: function(lat1, lng1, lat2, lng2){
      var dLat = (lat2-lat1).toRad();
      var dLon = (lng2-lng1).toRad();
      lat1 = lat1.toRad();
      lat2 = lat2.toRad();

      var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
      var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return distance.R * c;
    },
    spherical: function(lat1, lng1, lat2, lng2){
      lat1 = lat1.toRad();
      lat2 = lat2.toRad();
      lng1 = lng1.toRad();
      lng2 = lng2.toRad();
      return Math.acos(Math.sin(lat1)*Math.sin(lat2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.cos(lng2 - lng1)) * distance.R;
    },
    pythagorean: function(lat1, lng1, lat2, lng2){
      lat1 = lat1.toRad();
      lng1 = lng1.toRad();
      lat2 = lat2.toRad();
      lng2 = lng2.toRad();
      var x = (lng2 - lng1) * Math.cos((lat1 + lat2) / 2),
          y = lat2 - lat1;
      return Math.sqrt(x * x + y * y) * distance.R;
    },
    taxicab: function(lat1, lng1, lat2, lng2){
      lat1 = lat1.toRad();
      lng1 = lng1.toRad();
      lat2 = lat2.toRad();
      lng2 = lng2.toRad();
      return (Math.abs(lat1 - lat2) + Math.abs(lng1 - lng2)) * distance.R;
    }
  };


  // Get the closest `Building`s to `lat` and `lng`.
  //
  // Modifies the global `_data` by storing the distance and also sorts it.
  var closestBuildings = function(lat, lng){
    var metric = distance.spherical, x;
    for (var i = 0; i < _data.length; i++){
      x = _data[i];
      x.distance = metric(lat, lng, x.latitude, x.longitude);
    }
    // go ahead and sort in place.
    _data.sort(function(a, b){ return a.distance - b.distance; });
    return _data.slice(0, 10);
  };


  // hook up UI
  var hasMultipleCities = function(buildings){
    var n = buildings.length, building, first;
    if (!n) {
      return;
    }
    first = buildings[0].city;
    n--;
    while (n){
      if (buildings[n].city != first) {
        return true;
      }
      n--;
    }
    return false;
  };

  var gotPosition = function(position){
    var lat = position.coords.latitude,
        lng = position.coords.longitude;
    var $container = $('#location-container').show(),
        $listContainer = $('#nearest').empty(),
        $well = $listContainer.parent().show(),
        $mapContainer = $('#nav-map-container'),
        buildings = closestBuildings(lat, lng),
        showCity = hasMultipleCities(buildings);
    $.each(buildings, function(idx, building){
      $listContainer.append('<li>' +
        '<a href="' + building.url + '">' + building.name_1 + '</a> ' +
        '<span class="pull-right">' + building.address_1 +
        (showCity ? ', ' + building.city : '') +
        ' <em>(' + building.distance.toFixed(2) +
        ' km)</em></span></li>');
    });

    if (!$mapContainer.height()) {
      // show the first time
      $mapContainer.height(220);  // just hard code this. bleh.
    }
    window.loadMap(position.coords, buildings);
  };

  var url = $('script:last').prev('a').attr('href');
  $.getJSON(url, storeData)
  .success(function(){
    // enable locate button
    $('#locate').show('fast').on('click', function(){
      navigator.geolocation.getCurrentPosition(gotPosition);
    });

    // get position of currently building if on building detail page or user's
    // location.
    var data = $('#building-data').data('building');
    if (data && data.latitude){
      gotPosition({
          coords: data
      });
    // } else {
      // navigator.geolocation.getCurrentPosition(gotPosition);
    }
  });


  // exports
  // exports.d = distance;
  exports.getClosestBuildings = gotPosition;

})(window, window.jQuery);


// chart loader
//
// Looks for: `<div class="chart"></div>` and fills them with the corresponsing
// chart. Also makes sure the chart resizes. Always runs.
//
// Required attrs:
// * data-src : the url we can fetch the chart
//
(function(exports, $){
  "use strict";
  var charts = [];
  $('div.chart').each(function(){
    var $this = $(this),
        ar = 1.618,
        width = $this.width(),
        height = Math.floor(width / ar),
        src = $this.attr('data-src');
    var options = {
      ar: ar
    };
    $this.html(
      '<iframe class="chart" src="' + src +
      '" frameborder="0" scrolling=no width="100%" height="' + height +
      '"</iframe>'
    ).data('chartOptions', options);
    charts.push($this);
  });
  $(window).on('resize', function(){
    $.each(charts, function(i, $this){
      // TODO add delay
      var options = $this.data('chartOptions'),
          width = $this.width(),
          height = Math.floor(width / options.ar);
      $this.children('iframe').height(height);
    });
  });
})(window, window.jQuery);
