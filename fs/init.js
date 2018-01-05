load('api_config.js');
load('api_gpio.js');
load('api_net.js');
load('api_sys.js');
load('api_arduino_onewire.js');
load('api_arduino_dallas_temp.js');
load('api_timer.js');
load('api_http.js');

let led = Cfg.get('pins.led');
GPIO.set_mode(led, GPIO.MODE_OUTPUT);
print('LED GPIO:', led);
let relay = Cfg.get('pins.relay');
GPIO.set_mode(relay, GPIO.MODE_OUTPUT);
print('Relay GPIO:', relay);
let url = Cfg.get('url');
let device_identifier = Cfg.get('device.id');

let tempSensor = Cfg.get('pins.tempsensor');
let ow = OneWire.create(tempSensor);
let dt = DallasTemperature.create(ow);
dt.begin();
let n = 0;
let sens = [];

let target_temp = 25;
let target_temp_tolerance = 0.5;
let relay_state = false;

let getInfo = function () {
  return JSON.stringify({
    total_ram: Sys.total_ram(),
    free_ram: Sys.free_ram()
  });
};

function query(data) {
  print(JSON.stringify(data));
  HTTP.query({
    url: url + 'api/log/',
    headers: { 'Content-type': 'application/json' },
    data: data,
    success: function (body, full_http_msg) { print(body); },
    error: function (err) { print(err); }
  });
}

function queryForDeviceSetup() {
  HTTP.query({
    url: url + 'api/setup/' + device_identifier,
    success: function (body, full_http_msg) {
      let parsed = JSON.parse(body);
      if (parsed.data.target_temp) {
        target_temp = parsed.data.target_temp;
      }
      if (parsed.data.target_temp_tolerance) {
        target_temp_tolerance = parsed.data.target_temp_tolerance;
      }
    },
    error: function (err) { print(err); }
  });
}

function getState() {
  let temp = getTemperature();
  updateRelayState(temp);

  return {
    "device_identifier": device_identifier,
    "data": {
      "relay_state": relay_state,
      "light_level": 0,
      "temperature": temp,
      "milis": Sys.uptime()
    }
  };
}

function getTemperature() {
  let temp = DallasTemperature.DEVICE_DISCONNECTED_C;
  if (n === 0) {
    n = dt.getDeviceCount();
    print('Sensors found:', n, 'pin:', tempSensor);

    for (let i = 0; i < n; i++) {
      sens[i] = '01234567';
      if (dt.getAddress(sens[i], i) === 1) {
        print('Sensor#', i, 'address:', dt.toHexStr(sens[i]));
      }
    }
  } else if (n >= 1) {
    dt.requestTemperatures();
    temp = dt.getTempC(sens[0]);
  }
  return temp;
}

function updateRelayState(temp) {
  if (temp >= target_temp + target_temp_tolerance) {
    relay_state = false;
  } else if (temp <= target_temp - target_temp_tolerance) {
    relay_state = true;
  }

  if (relay_state) {
    GPIO.write(relay, 1);
  } else {
    GPIO.write(relay, 0);
  }
}

// THIS IS JUST MEH
Timer.set(2 * 1000, true /* repeat */, function () {
  let value = GPIO.toggle(led); // Blinky
  print(value ? 'Tick' : 'Tock', 'uptime:', Sys.uptime(), getInfo());
}, null);

/* 
  THIS IS THE PRIMARY THINGY MAGIC THING 
*/
Timer.set(10 * 1000, true /* repeat */, function () {
  query(getState());
}, null);

// Get target temperature and tolerance
Timer.set(30 * 1000, true /* repeat */, function () {
  queryForDeviceSetup();
}, null);

// Monitor network connectivity.
Net.setStatusEventHandler(function (ev, arg) {
  let evs = '???';
  if (ev === Net.STATUS_DISCONNECTED) {
    evs = 'DISCONNECTED';
  } else if (ev === Net.STATUS_CONNECTING) {
    evs = 'CONNECTING';
  } else if (ev === Net.STATUS_CONNECTED) {
    evs = 'CONNECTED';
  } else if (ev === Net.STATUS_GOT_IP) {
    evs = 'GOT_IP';
  }
  print('== Net event:', ev, evs);
}, null);
