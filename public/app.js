angular.module('AngularOpenAPS', [
  'AngularOpenAPS.home',
  'AngularOpenAPS.cgm',
  'AngularOpenAPS.loop',
  'AngularOpenAPS.pump',
  'ngRoute',
  'ngCookies',
  // 'ngTouch',
  'mobile-angular-ui',
  'btford.socket-io',
  'chart.js'
])

.config(function($locationProvider) {
  $locationProvider.html5Mode(true);
})

// TODO: consider if this is best placed within the cgm module
.service('G5', ['socketFactory', function (socketFactory) {
  const socket = socketFactory();

  let glucose;
  let id;

  this.transmitter = {
    age: function() {
      return (glucose && glucose.activationDate) ? (Date.now() - glucose.activationDate) / 1000 : null;
    },
    status: function() {
      return glucose ? glucose.status : null;
    }

    // id: function() {
    //   return id;
    // },
    //
    // // id: '123456',
    // // version: '1.2.3.4',
    // setID: function(id) {
    //   socket.emit('id', id);
    // }
  };

  Object.defineProperty(this.transmitter, 'id', {
    get: function() {
      return id;
    },
    set: function(id) {
      socket.emit('id', id)
    }
  });

  this.sensor = {
    glucose: function() {
      console.log("in glucose");
      // TODO: perhaps remove this bit and use glucoseAge below
      if (glucose) {
        glucose.age = (Date.now() - glucose.readDate) / 1000
        console.log("in glucose");
      }
      // TODO: work out if we want to expose this whole thing
      // or create a new object with just the propertiess of interest
      return glucose;
    },
    glucoseAge: function() {
      return glucose ? (Date.now() - glucose.readDate) / 1000 : null;
    },
    age: function() {
      return (glucose && glucose.sessionStartDate) ? (Date.now() - glucose.sessionStartDate) / 1000 : null;
    },
    state: function() {
      return glucose ? glucose.state : null;
    },
    // insertionDate: Date.now() - 5*24*60*60*1000,
    // state: 0x0a,
    // calibration: {
    //   date: Date.now() - 12*60*60*1000,
    //   glucose: 100
    // },
    calibrate: function(value) {
      console.log('emitting a cal value of ' + value);
      socket.emit('calibrate', value);
    },
    start: function() {
      socket.emit('startSensor');
    },
    stop: function() {
      socket.emit('stopSensor');
    }
  };

  socket.on('version', version => {
    console.log('got version');
    this.transmitter.version = version;
  });

  socket.on('id', value => {
    console.log('got id of ' + value);
    id = value;
  });

  socket.on('glucose', value => {
    console.log('got glucose of ' + value.glucose);
    glucose = value;
  });

  socket.on('calibration', calibration => {
    console.log('got calibration');
    this.sensor.calibration = calibration;
  });

}])


.controller('MyCtrl', ['$rootScope', '$scope', '$cookies', function ($rootScope, $scope, $cookies) {
  $rootScope.$on('$routeChangeStart', function() {
    $rootScope.loading = true;
  });

  $rootScope.$on('$routeChangeSuccess', function() {
    $rootScope.loading = false;
  });

  $scope.units = $cookies.get('units') || 'mg/dl';

  // $cookies.put('myFavorite', 'oatmeal');
  console.log('units = ' + $scope.units);

  //   // for demo chart
  //   $scope.labels = ["January", "February", "March", "April", "May", "June", "July"];
  //   $scope.series = ['Series A', 'Series B'];
  //   $scope.data = [
  //     [65, 59, 80, 81, 56, 55, 40]
  //     // [28, 48, 40, 19, 86, 27, 90]
  //   ];
  //   // $scope.onClick = function (points, evt) {
  //   //   console.log(points, evt);
  //   // };
  //   // $scope.datasetOverride = [{ yAxisID: 'y-axis-1' }, { yAxisID: 'y-axis-2' }];
  //   $scope.options = {
  //     scales: {
  //       yAxes: [
  //         {
  //           id: 'y-axis-1',
  //           type: 'linear',
  //           display: true,
  //           position: 'left'
  //         },
  //         {
  //           id: 'y-axis-2',
  //           type: 'linear',
  //           display: true,
  //           position: 'right'
  //         }
  //       ]
  //     }
  //   };
  // }]);
  //
}])


.filter('time', function() {
  // TODO: handle singulars, as in
  // https://gist.github.com/lukevella/f23423170cb43e78c40b
  return function(seconds) {
    if (!seconds) return '--';
    if (seconds < 60) return seconds.toFixed(0) + ' sec';
    else {
      const minutes = seconds / 60;
      if (minutes < 60) return minutes.toFixed(0) + ' min';
      else {
        const hours = minutes / 60;
        if (hours < 24) return hours.toFixed(0) + ' hr';
        else {
          const days = hours / 24;
          return days.toFixed(0) + ' d';
        }
      }
    }
  };
})

.filter('glucose', function() {
  return function(glucose) {
    return glucose ? (glucose/18).toFixed(1) : '--';
  };
});

//
// app.filter('mg_per_dl', function() {
//   return function(glucose) {
//     return glucose ? glucose + ' mg/dl' : '--';
//   };
// });
//
// app.filter('mmol_per_L', function() {
//   return function(glucose) {
//     return glucose ? (glucose/18).toFixed(1) + ' mmol/L' : '--';
//   };
// });
//
