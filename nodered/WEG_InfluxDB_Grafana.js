// ============================================================================
// WEG INFLUXDB + GRAFANA INTEGRATION
// Long-term historical data storage and advanced dashboards
// ============================================================================
// Required:
//   - InfluxDB 2.x (or 1.8+)
//   - Grafana (optional but recommended)
//   - node-red-contrib-influxdb palette
// ============================================================================


// ============================================================================
// INFLUXDB SETUP
// ============================================================================

/*
# --- Install InfluxDB 2.x ---

# Windows: Download from https://portal.influxdata.com/downloads/
# Linux/RPi:
wget https://dl.influxdata.com/influxdb/releases/influxdb2-2.7.1-linux-amd64.tar.gz
tar xvfz influxdb2-2.7.1-linux-amd64.tar.gz
sudo cp influxdb2-2.7.1/usr/bin/influxd /usr/local/bin/
influxd

# Access: http://localhost:8086
# Initial setup:
#   Organization: WEG_Monitoring
#   Bucket: weg_drives
#   Username: admin
#   Password: (your password)
#   Retention: 365 days (or your preference)

# Create an API token:
#   Data > API Tokens > Generate > Read/Write Token
#   Scope: weg_drives bucket
#   Save the token for Node-RED config
*/


// ============================================================================
// NODE-RED: InfluxDB Configuration
// ============================================================================

/*
In Node-RED:
1. Menu > Manage palette > Install: node-red-contrib-influxdb
2. Add an "influxdb out" node
3. Configure server:
   - Version: 2.0
   - URL: http://localhost:8086
   - Token: (paste your API token)
   - Organization: WEG_Monitoring
   - Bucket: weg_drives
*/


// ============================================================================
// FUNCTION NODE: "Format InfluxDB - CFW900"
// Converts parsed CFW900 data to InfluxDB line protocol
// Connect AFTER Parse CFW900 node
// ============================================================================

// --- InfluxDB Write: CFW900 ---
const cfwDevices = flow.get("cfwDevices") || [];
const points = [];

cfwDevices.forEach((d, i) => {
    points.push({
        measurement: "cfw900",
        tags: {
            device: `CFW900_${i + 1}`,
            device_name: d.name
        },
        fields: {
            current: d.current,
            frequency: d.frequency,
            dc_bus_voltage: d.dcBusVoltage,
            torque: d.torque,
            speed_rpm: d.speedRPM,
            status_word: d.statusWord,
            fault_code: d.faultCode,
            is_running: d.running ? 1 : 0,
            is_fault: d.fault ? 1 : 0,
            is_ready: d.ready ? 1 : 0,
            is_online: d.online ? 1 : 0,
            comm_errors: d.commErrors
        },
        timestamp: Date.now()
    });
});

msg.payload = points;
return msg;


// ============================================================================
// FUNCTION NODE: "Format InfluxDB - SSW900"
// Connect AFTER Parse SSW900 node
// ============================================================================

// --- InfluxDB Write: SSW900 ---
const sswDevices = flow.get("sswDevices") || [];
const points2 = [];

sswDevices.forEach((d, i) => {
    points2.push({
        measurement: "ssw900",
        tags: {
            device: `SSW900_${i + 1}`,
            device_name: d.name
        },
        fields: {
            current: d.current,
            voltage: d.voltage,
            power: d.power,
            status_word: d.statusWord,
            fault_code: d.faultCode,
            is_running: d.running ? 1 : 0,
            is_starting: d.starting ? 1 : 0,
            is_fault: d.fault ? 1 : 0,
            is_ready: d.ready ? 1 : 0,
            is_online: d.online ? 1 : 0,
            comm_errors: d.commErrors
        },
        timestamp: Date.now()
    });
});

msg.payload = points2;
return msg;


// ============================================================================
// FUNCTION NODE: "Format InfluxDB - Voltage Stats"
// Writes voltage analysis data (run every 30s or 1min)
// ============================================================================

// --- InfluxDB Write: Voltage Analysis ---
const vStats = flow.get("voltageStats") || { cfw: [], ssw: [] };
const cfwDev = flow.get("cfwDevices") || [];
const sswDev = flow.get("sswDevices") || [];
const vPoints = [];

cfwDev.forEach((d, i) => {
    const s = vStats.cfw[i] || {};
    vPoints.push({
        measurement: "voltage_analysis",
        tags: {
            device: `CFW900_${i + 1}`,
            type: "dc_bus"
        },
        fields: {
            voltage_now: d.dcBusVoltage,
            voltage_min: s.min || 0,
            voltage_max: s.max || 0,
            voltage_avg: s.count > 0 ? s.sum / s.count : 0,
            overvoltage: d.dcBusVoltage > 750 ? 1 : 0,
            undervoltage: (d.dcBusVoltage < 350 && d.dcBusVoltage > 0) ? 1 : 0
        },
        timestamp: Date.now()
    });
});

sswDev.forEach((d, i) => {
    const s = vStats.ssw[i] || {};
    vPoints.push({
        measurement: "voltage_analysis",
        tags: {
            device: `SSW900_${i + 1}`,
            type: "motor"
        },
        fields: {
            voltage_now: d.voltage,
            voltage_min: s.min || 0,
            voltage_max: s.max || 0,
            voltage_avg: s.count > 0 ? s.sum / s.count : 0,
            overvoltage: d.voltage > 480 ? 1 : 0,
            undervoltage: (d.voltage < 400 && d.voltage > 0) ? 1 : 0
        },
        timestamp: Date.now()
    });
});

msg.payload = vPoints;
return msg;


// ============================================================================
// FUNCTION NODE: "Format InfluxDB - Alarms"
// Writes alarm events for historical fault tracking
// Connect AFTER Alarm Detector (only fires on new alarms)
// ============================================================================

// --- InfluxDB Write: Alarm Events ---
const notifications = msg.notifications || [];
const alarmPoints = [];

notifications.forEach(n => {
    n.alarms.forEach(a => {
        alarmPoints.push({
            measurement: "alarm_events",
            tags: {
                device: a.device.replace(/[# ]/g, "_"),
                alarm_type: a.type,
                event: n.type   // "alarm" or "clear"
            },
            fields: {
                fault_text: a.text,
                voltage: a.voltage || 0,
                current: a.current || 0,
                event_type: n.type === "alarm" ? 1 : 0
            },
            timestamp: Date.now()
        });
    });
});

if (alarmPoints.length > 0) {
    msg.payload = alarmPoints;
    return msg;
}
return null;


// ============================================================================
// GRAFANA DASHBOARD SETUP
// ============================================================================

/*
# --- Install Grafana ---

# Windows: Download from https://grafana.com/grafana/download
# Linux/RPi:
sudo apt-get install -y adduser libfontconfig1
wget https://dl.grafana.com/oss/release/grafana_10.2.3_amd64.deb
sudo dpkg -i grafana_10.2.3_amd64.deb
sudo systemctl enable grafana-server
sudo systemctl start grafana-server

# Access: http://localhost:3000
# Default login: admin / admin


# --- Add InfluxDB Data Source in Grafana ---

1. Go to: Configuration > Data Sources > Add
2. Select: InfluxDB
3. Configure:
   - Query Language: Flux
   - URL: http://localhost:8086
   - Organization: WEG_Monitoring
   - Token: (your API token)
   - Default Bucket: weg_drives
4. Save & Test
*/


// ============================================================================
// GRAFANA FLUX QUERIES
// Copy these into Grafana panel query editors
// ============================================================================


// --- Panel 1: CFW900 Current (4 lines) ---
const query_cfw_current = `
from(bucket: "weg_drives")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "cfw900")
  |> filter(fn: (r) => r._field == "current")
  |> aggregateWindow(every: 5s, fn: mean, createEmpty: false)
`;

// --- Panel 2: CFW900 DC Bus Voltage (EMPHASIS - yellow/gold) ---
const query_cfw_voltage = `
from(bucket: "weg_drives")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "cfw900")
  |> filter(fn: (r) => r._field == "dc_bus_voltage")
  |> aggregateWindow(every: 5s, fn: mean, createEmpty: false)
`;
// Grafana panel config:
// - Type: Time Series
// - Color: #FFD700 (Gold)
// - Thresholds: 350 (red), 750 (red)
// - Y-axis: 300-800V
// - Title: "⚡ CFW900 DC Bus Voltage"

// --- Panel 3: CFW900 Frequency ---
const query_cfw_freq = `
from(bucket: "weg_drives")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "cfw900")
  |> filter(fn: (r) => r._field == "frequency")
  |> aggregateWindow(every: 5s, fn: mean, createEmpty: false)
`;

// --- Panel 4: SSW900 Current ---
const query_ssw_current = `
from(bucket: "weg_drives")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "ssw900")
  |> filter(fn: (r) => r._field == "current")
  |> aggregateWindow(every: 5s, fn: mean, createEmpty: false)
`;

// --- Panel 5: SSW900 Motor Voltage (EMPHASIS) ---
const query_ssw_voltage = `
from(bucket: "weg_drives")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "ssw900")
  |> filter(fn: (r) => r._field == "voltage")
  |> aggregateWindow(every: 5s, fn: mean, createEmpty: false)
`;
// Same emphasis: Gold color, thresholds at 400V and 480V

// --- Panel 6: Voltage Min/Max/Avg Table ---
const query_voltage_stats = `
from(bucket: "weg_drives")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "voltage_analysis")
  |> filter(fn: (r) => r._field == "voltage_now" or r._field == "voltage_min" or r._field == "voltage_max" or r._field == "voltage_avg")
  |> last()
  |> pivot(rowKey: ["device"], columnKey: ["_field"], valueColumn: "_value")
`;
// Panel type: Table

// --- Panel 7: Alarm History Timeline ---
const query_alarms = `
from(bucket: "weg_drives")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "alarm_events")
  |> filter(fn: (r) => r._field == "event_type")
  |> group(columns: ["device"])
`;
// Panel type: State Timeline
// Color: 1 = Red (alarm), 0 = Green (clear)

// --- Panel 8: Voltage Deviation / Imbalance (SSW900) ---
const query_imbalance = `
import "math"

ssw_data = from(bucket: "weg_drives")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "ssw900")
  |> filter(fn: (r) => r._field == "voltage")
  |> aggregateWindow(every: 30s, fn: mean, createEmpty: false)

avg_voltage = ssw_data
  |> group()
  |> aggregateWindow(every: 30s, fn: mean, createEmpty: false)

// Compare each device to average in Grafana transforms
`;

// --- Panel 9: Uptime / Running Hours per Device ---
const query_running_hours = `
from(bucket: "weg_drives")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "cfw900" or r._measurement == "ssw900")
  |> filter(fn: (r) => r._field == "is_running")
  |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
  |> map(fn: (r) => ({r with _value: r._value * 1.0}))
  |> cumulativeSum()
  |> map(fn: (r) => ({r with _value: r._value / 60.0}))
`;
// Panel type: Stat
// Unit: hours


// ============================================================================
// GRAFANA ALERTING (built-in)
// ============================================================================

/*
Grafana Alert Rules (configure in Grafana UI):

1. CFW900 Overvoltage Alert:
   - Query: dc_bus_voltage > 750 for 10s
   - Contact: Telegram, Email
   - Message: "CFW900 DC Bus Overvoltage detected"

2. CFW900 Undervoltage Alert:
   - Query: dc_bus_voltage < 350 for 10s
   - Contact: Telegram, Email

3. SSW900 Voltage Imbalance Alert:
   - Query: max(voltage) - min(voltage) > 25 for 30s
   - Contact: Telegram, Email

4. Communication Loss Alert:
   - Query: is_online == 0 for 30s
   - Contact: Telegram, Email

5. Any Drive Fault:
   - Query: is_fault == 1
   - Contact: Telegram, Email
   - Repeat: every 15 min while active
*/
