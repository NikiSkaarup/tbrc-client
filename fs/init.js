load('api_config.js');
load('api_gpio.js');
load('api_net.js');
load('api_sys.js');
load('api_timer.js');
load('api_http.js');
load('api_arduino_onewire.js');
load('api_arduino_dallas_temp.js');

let led = Cfg.get('pins.led');
let url = Cfg.get('url');
let device_identifier = Cfg.get('device.id');

let tempSensor = Cfg.get('pins.tempsensor');
let ow = OneWire.create(tempSensor);
let dt = DallasTemperature.create(ow);
dt.begin();
let n = 0;
let sens = [];

print('LED GPIO:', led);

let getInfo = function () {
  return JSON.stringify({
    total_ram: Sys.total_ram(),
    free_ram: Sys.free_ram()
  });
};

function query(data) {
  print(JSON.stringify(data));
  HTTP.query({
    url: url,
    headers: { 'Content-type': 'application/json' },
    data: data,
    success: function (body, full_http_msg) { print(body); },
    error: function (err) { print(err); }
  });
}

function getData() {
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

  return {
    "device_identifier": device_identifier,
    "data": {
      "relay_state": false,
      "light_level": 0,
      "temperature": temp,
      "milis": Sys.uptime()
    }
  };
}

GPIO.set_mode(led, GPIO.MODE_OUTPUT);
Timer.set(2 * 1000, true /* repeat */, function () {
  let value = GPIO.toggle(led);
  print(value ? 'Tick' : 'Tock', 'uptime:', Sys.uptime(), getInfo());
}, null);

Timer.set(10 * 1000, true /* repeat */, function () {
  query(getData());
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
