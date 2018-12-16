/* global angular */
angular.module('AngularOpenAPS.cgm.sensor', [
  'ngRoute',
])

  .config(($routeProvider) => {
    $routeProvider.when('/cgm/sensor', {
      templateUrl: 'cgm/sensor/sensor.html',
      controller: 'SensorController',
    });
    $routeProvider.when('/cgm/sensor/calibrate', {
      templateUrl: 'cgm/sensor/calibrate.html',
      controller: 'SensorController',
    });
    $routeProvider.when('/cgm/sensor/calibration', {
      templateUrl: 'cgm/sensor/calibration.html',
      controller: 'SensorController',
    });
    $routeProvider.when('/cgm/sensor/pending', {
      templateUrl: 'cgm/sensor/pending.html',
      controller: 'SensorController',
    });
    $routeProvider.when('/cgm/sensor/stop', {
      templateUrl: 'cgm/sensor/stop.html',
      controller: 'SensorController',
    });
  })

  .controller('SensorController', ['$scope', 'SharedState', '$interval', '$location', 'CGM', ($scope, SharedState, $interval, $location, CGM) => {
    $scope.sensor = CGM.sensor;

    const units = SharedState.get('glucoseUnits');

    switch (units) {
      case 'mmol/L':
        $scope.calMin = 2.2;
        $scope.calMax = 22;
        break;
      case 'mg/dL':
      default:
        $scope.calMin = 40;
        $scope.calMax = 400;
    }

    const tick = () => {
      const { sessionStartDate } = CGM.sensor;
      $scope.age = sessionStartDate ? (Date.now() - sessionStartDate.valueOf()) / 1000 : null;
    };
    tick();
    $interval(tick, 1000);

    $scope.calibrate = (value) => {
      if (value) {
        CGM.sensor.calibrate(value);
        $location.path('/cgm/sensor/pending');
      }
    };

    $scope.stopSensor = () => {
      CGM.sensor.stop();
      $location.path('/cgm/sensor/pending');
    };
  }])

  .filter('state', () => state => (state ? `State: 0x${state.toString(16)}` : '--'));
