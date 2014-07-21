'use strict';

var exec = require('child_process').exec;

var GET_CPU_STAT = 'adb shell \"cat /proc/stat | grep \\\"cpu \\\"\"';
var GET_PROCESS_CPU_STAT = 'adb shell cat /proc/$PID/stat';

// CPUInfo is based on the algorithm from: http://bit.ly/1puQekn . It retrieves
// CPU info rom /proc/stat and /proc/$PID/stat.
function CPUInfo() {
  this.apps = [];
  this.appInfos = {};
}

CPUInfo.prototype.run = function(done) {
  var cpuTotalTime = 0;
  var appInfos = {};
  var execCount = 0;

  var self = this;
  function calculateResult() {
    // calculate only when we have at least one record
    if (self.cpuTotalTime) {
      var cpuDiff = cpuTotalTime - self.cpuTotalTime;
      for (var key in appInfos) {
        // calculate percentage only when we have previous data
        if (self.appInfos && self.appInfos[key] && self.appInfos[key].time) {
          var procCPUTime = appInfos[key].time - self.appInfos[key].time;
          appInfos[key].percentage = procCPUTime * 100 / cpuDiff;
        }
      }
    }

    self.cpuTotalTime = cpuTotalTime;
    self.appInfos = appInfos;
    done();
  }

  exec(GET_CPU_STAT, function(err, stdout, strerr) {
    if (err) {
      done('disconnected');
      return;
    }
    if (stdout.toString() === '') {
      done('no info found');
      return;
    }

    var line = stdout.split(/\s/);
    for (var i = 2; i < 12; i++) {
      cpuTotalTime += parseInt(line[i], 10);
    }

    if (execCount === 0 && cpuTotalTime) {
      calculateResult();
    }
  });

  for (var key in this.apps) {
    execCount++;
    // cat /proc/$PID/stat asynchronously.
    this.fetchAppCPUInfo(this.apps[key].pid, function(pid, err, val) {
      // val is the cpu time. It may be 0 which may mean PID not found or error.
      // But that's fine because we view 0 as an error value and will discard
      // it.
      appInfos[pid] = { 'time' : val };
      execCount--;
      if (execCount === 0 && cpuTotalTime) {
        calculateResult();
      }
    });
  }
};

CPUInfo.prototype.fetchAppCPUInfo = function(pid, callback) {
  exec(GET_PROCESS_CPU_STAT.replace('$PID', pid), function(err, stdout,
                                                           strerr) {

    if (err) {
      callback(pid, 'disconnected', 0);
      return;
    }
    if (stdout.toString() === 'No such file or directory') {
      callback(pid, 'no info found', 0);
      return;
    }
    try {
      var line = stdout.split(/\s/);
      callback(pid, null, parseInt(line[13], 10) + parseInt(line[13], 10));  
    } catch (ex) {
      callback(pid, ex.message, 0);
    }
  });
};

module.exports = CPUInfo;