//Rule 1 - Clear calibration records upon CGM Sensor Change/Insert
//Rule 2 - Don't allow any BG calibrations or take in any new calibrations 
//         within 15 minutes of last sensor insert
//Rule 3 - Only use Single Point Calibration for 1st 12 hours since Sensor insert
//Rule 4 - Do not store calibration records within 12 hours since Sensor insert. 
//         Use for SinglePoint calibration, but then discard them
//Rule 5 - Do not use LSR until we have 3 or more calibration points. 
//         Use SinglePoint calibration only for less than 3 calibration points. 
//         SinglePoint simply uses the latest calibration record and assumes 
//         the yIntercept is 0.
//Rule 6 - TODO: Drop back to SinglePoint calibration if slope is out of bounds 
//         (>MAXSLOPE or <MINSLOPE)
//Rule 7 - TODO: Drop back to SinglePoint calibration if yIntercept is out of bounds 
//         (> minimum unfiltered value in calibration record set or 
//          < - minimum unfiltered value in calibration record set)

var exports = module.exports = {};

const MAXSLOPE = 12500;
const MINSLOPE = 450;

// calibrationPairs has three values for each array element:
//   glucose => the "true" glucose value for the pair
//   unfiltered => the sensor's unfiltered glucose value for the pair
//   readDateMills => the sensor's read date for the pair in ms since 1/1/1970 00:00
const lsrCalibration = (calibrationPairs) => {
  var sumX=0;
  var sumY=0;
  var meanX=0;
  var meanY=0;
  var stddevX=0;
  var stddevY=0;
  var sumXY=0;
  var sumXSq=0;
  var sumYSq=0;
  let sumSqDiffX = 0;
  let sumSqDiffY = 0;
  /*eslint-disable no-unused-vars*/
  let yError=0;
  let slopeError=0;
  /*eslint-enable no-unused-vars*/

  var n=calibrationPairs.length;
  var tarr = [];

  var returnVal = {
    'slope': 0,
    'yIntercept': 0,
    'calibrationType': 'LeastSquaresRegression'
  };

  for (let i=0; i < n; ++i) {
    sumX = sumX + calibrationPairs[i].glucose;
    sumY = sumY + calibrationPairs[i].unfiltered;
  }

  meanX = sumX / n;
  meanY = sumY / n;

  for (let i=0; i < n; ++i) {
    let diff = calibrationPairs[i].glucose - meanX;
    sumSqDiffX = sumSqDiffX + diff*diff;

    diff = calibrationPairs[i].unfiltered - meanY;
    sumSqDiffY = sumSqDiffY + diff*diff;
  }

  stddevX = Math.sqrt(sumSqDiffX / (n-1));
  stddevY = Math.sqrt(sumSqDiffY / (n-1));


  var firstDate=calibrationPairs[0].readDateMills;

  for (let i=0; i<n; i++) {
    tarr.push(calibrationPairs[i].readDateMills - firstDate); 
  }

  var multiplier=1;

  for (let i=0; i<n; i++ ) {
    if (i != 0) {
      multiplier=1 + tarr[i-1] / (tarr[n-1] * 2);

      // boundary check
      if ((multiplier < 1) || (multiplier > 2)) {
        multiplier=1;
      }
    }

    console.log('Calibration - record ' + i + ', ' + new Date(calibrationPairs[i].readDateMills) + ', weighted multiplier=' + multiplier);
 
    sumXY=(sumXY + calibrationPairs[i].glucose * calibrationPairs[i].unfiltered) * multiplier;
    sumXSq=(sumXSq + calibrationPairs[i].glucose * calibrationPairs[i].glucose) * multiplier;
    sumYSq=(sumYSq + calibrationPairs[i].unfiltered * calibrationPairs[i].unfiltered) * multiplier;
  }

  var denominator=Math.sqrt(((n * sumXSq - sumX*sumX) * (n * sumYSq - sumY*sumY)));
  if ((denominator == 0) || (stddevX == 0)) {
    return null;
  } else {
    let r=(n * sumXY - sumX * sumY) / denominator;

    returnVal.slope=r * stddevY / stddevX;
    returnVal.yIntercept=meanY - returnVal.slope * meanX;

    // calculate error
    let varSum=0;
    for (let j=0; j<n; j++) {
      let varVal = (calibrationPairs[j].unfiltered - returnVal.yIntercept - returnVal.slope * calibrationPairs[j].glucose);
      varSum=varSum + varVal * varVal;
    }

    let delta=n * sumXSq - sumX*sumX;
    let vari=1.0 / (n - 2.0) * varSum;
  
    yError=Math.sqrt(vari / delta * sumXSq);
    slopeError=Math.sqrt(n / delta * vari);
  }

  console.log('lsrCalibration: numPoints=' + n + ', slope=' + returnVal.slope + ', yIntercept=' + returnVal.yIntercept); 

  return returnVal;
};

const singlePointCalibration = (calibrationPairs) => {
  var returnVal = {
    'slope': 0,
    'yIntercept': 0,
    'calibrationType': 'SinglePoint'
  };

  let x=calibrationPairs[calibrationPairs.length-1].glucose;
  let y=calibrationPairs[calibrationPairs.length-1].unfiltered;
  returnVal.yIntercept=0;
  returnVal.slope=y / x;
  console.log('singlePointCalibration: x=' + x + ', y=' + y + ', slope=' + returnVal.slope + ', yIntercept=0'); 

  return returnVal;
};

exports.calculateG5Calibration = (lastCal, lastG5CalTime, sensorInsert, glucoseHist, currSGV) => {
  // set it to a high number so we upload a new cal
  // if we don't have a previous calibration

  // Do not calculate a new calibration value
  // if we don't have a valid calibrated glucose reading
  if (currSGV.glucose > 300 || currSGV.glucose < 80) {
    console.log('Current glucose out of range to calibrate: ' + currSGV.glucose);
    return null;
  }

  var calErr = 100;
  var calValue;
  var i;

  if (lastCal) {
    calValue = calcGlucose(currSGV, lastCal);
    calErr = Math.abs(calValue - currSGV.glucose);

    console.log('Current calibration error: ' + Math.round(calErr*10)/10 + ' calibrated value: ' + Math.round(calValue*10)/10 + ' slope: ' + Math.round(lastCal.slope*10)/10 + ' intercept: ' + Math.round(lastCal.intercept*10)/10);
  }

  // Check if we need a calibration
  if (!lastCal || (calErr > 5) || (lastCal.type === 'SinglePoint')) {
    var calPairs = [];

    calPairs.push(currSGV);

    // Suitable values need to be:
    //   less than 300 mg/dl
    //   greater than 80 mg/dl
    //   calibrated via G5, not Lookout
    //   12 minutes after the last G5 calibration time (it takes up to 2 readings to reflect calibration updates)
    //   After the latest sensorInsert (ignore sensorInsert if we didn't get one)
    for (i=(glucoseHist.length-1); ((i >= 0) && (calPairs.length < 10)); --i) {
      // Only use up to 10 of the most recent suitable readings
      let sgv = glucoseHist[i];

      if ((sgv.readDateMills > (lastG5CalTime + 12*60*1000)) && (sgv.glucose < 300) && (sgv.glucose > 80) && sgv.g5calibrated && (!sensorInsert || (sgv.readDateMills > sensorInsert.valueOf()))) {
        calPairs.unshift(sgv);
      }
    }

    // If we have at least 3 good pairs and we are off by more than 5
    // OR we have at least 8 and our current cal type is SinglePoint
    // THEN use LSR
    if (((calErr > 5) && calPairs.length > 3) || (calPairs.length > 8)) {
      let calResult = lsrCalibration(calPairs);

      if ((calResult.slope > MAXSLOPE) || (calResult.slope < MINSLOPE)) {
        // wait until the next opportunity
        console.log('Slope out of range to calibrate: ' + calResult.slope);
        return null;
      }

      console.log('Calibrated with LSR');

      return {
        date: Date.now(),
        scale: 1,
        intercept: calResult.yIntercept,
        slope: calResult.slope,
        type: calResult.calibrationType
      };
    // Otherwise, only update if we have a calErr > 5
    } else if ((calErr > 5) && (calPairs.length > 0)) {
      let calResult = singlePointCalibration(calPairs);

      console.log('Calibrated with Single Point');

      return {
        date: Date.now(),
        scale: 1,
        intercept: calResult.yIntercept,
        slope: calResult.slope,
        type: calResult.calibrationType
      };
    } else if (calErr > 5) {
      console.log('Calibration needed, but no suitable glucose pairs found.');
      return null;
    }
  }

  console.log('No calibration update needed.');
  return null;
};

const calcGlucose = (sgv, calibration) => {
  let glucose = Math.round((sgv.unfiltered-calibration.intercept)/calibration.slope);

  // If BG is below 40, set it to 39 so it's displayed correctly in NS
  glucose = glucose < 40 ? 39 : glucose;

  return glucose;
};

exports.calcGlucose = calcGlucose;

exports.expiredCalibration = (bgChecks, sensorInsert) => {
  let calPairs = [];
  let calReturn = null;
  let calPairsStart = 0;

  for (let i=0; i < bgChecks.length; ++i) {
    if ((bgChecks[i].type !== 'Unity') && (bgChecks[i].unfiltered)) {
      calPairs.push({
        unfiltered: bgChecks[i].unfiltered,
        glucose: bgChecks[i].glucose,
        readDateMills: bgChecks[i].dateMills
      });
    }
  }

  // remove calPairs that are less than 12 hours from the sensor insert
  if (calPairs.length > 0) {
    for (let i=0; i < calPairs.length; ++i) {
      if (!sensorInsert || ((calPairs[i].readDateMills - sensorInsert.valueOf()) < 15*60*60000)) {
        calPairsStart = i+1;
      }
    }

    // If they are all less than 12 hours from the sensor insert, save the latest one
    if (calPairsStart >= calPairs.length) {
      calPairsStart = calPairs.length - 1;
    }

    calPairs = calPairs.slice(calPairsStart);
  }

  // If we have at least 3 good pairs, use LSR
  if (calPairs.length > 3) {
    let calResult = lsrCalibration(calPairs);

    if ((calResult.slope > MAXSLOPE) || (calResult.slope < MINSLOPE)) {
      // wait until the next opportunity
      console.log('Slope out of range to calibrate: ' + calResult.slope);
      return null;
    }

    calReturn = {
      date: Date.now(),
      scale: 1,
      intercept: calResult.yIntercept,
      slope: calResult.slope,
      type: calResult.calibrationType
    };

    console.log('Expired calibration with LSR:\n', calReturn);
  } else if (calPairs.length > 0) {
    let calResult = singlePointCalibration(calPairs);

    calReturn = {
      date: Date.now(),
      scale: 1,
      intercept: calResult.yIntercept,
      slope: calResult.slope,
      type: calResult.calibrationType
    };

    console.log('Expired calibration with Single Point:\n', calReturn);
  } else {
    console.log('No suitable glucose pairs found for expired calibration.');
  }

  return calReturn;
};

exports.interpolateUnfiltered = (SGVBefore, SGVAfter, valueTime) => {
  let totalTime = SGVAfter.readDateMills - SGVBefore.readDateMills;
  let totalDelta = SGVAfter.unfiltered - SGVBefore.unfiltered;
  let fractionTime = (valueTime.valueOf() - SGVBefore.readDateMills) / totalTime;

  console.log('SGVBefore Time: ' + SGVBefore.readDateMills + ' SGVBefore Unfiltered: ' + SGVBefore.unfiltered);
  console.log(' SGVAfter Time: ' + SGVAfter.readDateMills + '  SGVAfter Unfiltered: ' + SGVAfter.unfiltered);

  if (totalTime > 10*60000) {
    console.log('Total time exceeds 10 minutes: ' + totalTime + 'ms');
    console.log('Not interpolating unfiltered values.');

    return null;
  }

  let returnVal = totalDelta * fractionTime + SGVBefore.unfiltered;

  console.log('  BGCheck Time: ' + valueTime.valueOf() + '       Unfilter Value: ' + (Math.round(returnVal*1000)/1000));
  console.log('     totalTime: ' + totalTime + ' totalDelta: ' + (Math.round(totalDelta*1000) / 1000) + ' fractionTime: ' + (Math.round(fractionTime*100)/100));

  return returnVal;
};

