# WEG Monitoring Dashboard - Node-RED Setup Guide

## Architecture

```
 WEG CFW900 x4 ──┐                    ┌──────────────┐
   (Modbus RTU)   ├── SL1 ── M241 PLC ── Modbus TCP ──│   Node-RED    │── Browser
 WEG SSW900 x4 ──┘   SL2    (502)     │  (PC / RPi)  │   Dashboard
                                        └──────────────┘
```

- PLC reads WEG drives via Modbus RTU (existing code)
- PLC maps data to %MW registers for Modbus TCP access
- Node-RED reads %MW registers via Modbus TCP every 1-2 seconds
- Dashboard served at http://localhost:1880/ui

---

## STEP 1: Install Node-RED

### Option A: Windows PC
```bash
npm install -g node-red
node-red
```

### Option B: Raspberry Pi
```bash
bash <(curl -sL https://raw.githubusercontent.com/node-red/linux-installers/master/deb/update-nodejs-and-nodered)
sudo systemctl enable nodered
sudo systemctl start nodered
```

Open: http://localhost:1880

---

## STEP 2: Install Required Palettes

In Node-RED, go to: **Menu > Manage palette > Install**

Install these:
```
node-red-contrib-modbus          (Modbus TCP/RTU communication)
node-red-dashboard               (Dashboard UI)
node-red-node-smooth             (Signal smoothing for trends)
```

---

## STEP 3: Configure PLC (Machine Expert)

### Add Modbus TCP Mapping Program

Add `PRG_ModbusTCP_Map` to your Machine Expert project (code in WEG_NodeRED_Complete.js).
This maps GVL_WEG variables to %MW0-%MW79.

Add it to MAST task AFTER the Modbus RTU programs:

```
MAST Task Order:
1. PRG_WEG_Modbus_SL1    (reads CFW900 via RTU)
2. PRG_WEG_Modbus_SL2    (reads SSW900 via RTU)
3. PRG_ModbusTCP_Map      (copies to %MW for TCP access)
```

### Register Map

| Register    | Device   | Content                                    |
|-------------|----------|--------------------------------------------|
| %MW0-9      | CFW900#1 | Status,RPM,Current,Freq,VDC,Torque,Fault   |
| %MW10-19    | CFW900#2 | Same layout                                |
| %MW20-29    | CFW900#3 | Same layout                                |
| %MW30-39    | CFW900#4 | Same layout                                |
| %MW40-49    | SSW900#1 | Status,Current,Voltage,Power,Fault         |
| %MW50-59    | SSW900#2 | Same layout                                |
| %MW60-69    | SSW900#3 | Same layout                                |
| %MW70-79    | SSW900#4 | Same layout                                |

### Per-CFW900 Register Detail (10 words each)

| Offset | Data              | Scale     |
|--------|-------------------|-----------|
| +0     | Status Word       | Raw WORD  |
| +1     | Speed RPM         | x1        |
| +2     | Output Current    | /10 → A   |
| +3     | Output Frequency  | /10 → Hz  |
| +4     | DC Bus Voltage    | /10 → V   |
| +5     | Motor Torque      | /10 → %   |
| +6     | Fault Code        | Raw WORD  |
| +7     | Online (0/1)      | BOOL      |
| +8     | Comm Error Count  | Raw       |
| +9     | Reserved          | -         |

### Per-SSW900 Register Detail (10 words each)

| Offset | Data              | Scale     |
|--------|-------------------|-----------|
| +0     | Status Word       | Raw WORD  |
| +1     | Motor Current     | /10 → A   |
| +2     | Motor Voltage     | /10 → V   |
| +3     | Motor Power       | /10 → kW  |
| +4     | Fault Code        | Raw WORD  |
| +5     | Online (0/1)      | BOOL      |
| +6     | Comm Error Count  | Raw       |
| +7-9   | Reserved          | -         |

---

## STEP 4: Build the Node-RED Flow

### 4.1 Modbus Read Nodes

Create two `modbus-read` nodes:

**Read CFW900:**
- Name: Read CFW900 Registers
- FC: FC3 (Read Holding Registers)
- Address: 0
- Quantity: 40
- Poll Rate: 1 second
- Server: M241 PLC (192.168.1.1:502)

**Read SSW900:**
- Name: Read SSW900 Registers
- FC: FC3 (Read Holding Registers)
- Address: 40
- Quantity: 40
- Poll Rate: 1 second
- Server: M241 PLC (192.168.1.1:502)

### 4.2 Parser Function Nodes

Create two `function` nodes connected after each modbus-read:

**Parse CFW900:** (copy parseCFW900 function from WEG_NodeRED_Complete.js)
```javascript
const devices = [];
const regs = msg.payload;
// ... (full parser code from JS file)
flow.set("cfwDevices", devices);
msg.cfwDevices = devices;
return msg;
```

**Parse SSW900:** (copy parseSSW900 function)
```javascript
const devices = [];
const regs = msg.payload;
// ... (full parser code from JS file)
flow.set("sswDevices", devices);
msg.sswDevices = devices;
return msg;
```

### 4.3 Dashboard Overview

Add a `ui_template` node:
- Group: Overview > Alarm Banner
- Size: 24x16
- Template: copy `overviewTemplate` from WEG_NodeRED_Complete.js
- Connect both parsers to a `join` node (manual mode, 2 messages)
  then to a `function` node that combines:

```javascript
const cfwDevices = flow.get("cfwDevices") || [];
const sswDevices = flow.get("sswDevices") || [];

// Build banner
const faults = [];
cfwDevices.forEach(d => { if (d.fault) faults.push(d.name + ": " + d.faultText); });
sswDevices.forEach(d => { if (d.fault) faults.push(d.name + ": " + d.faultText); });

const banner = faults.length === 0
    ? { text: "SYSTEM OK - All drives operating normally", color: "#00B400", hasFaults: false }
    : { text: "[" + faults.length + " FAULTS] " + faults.join(" | "), color: "#DC0000", hasFaults: true, faultCount: faults.length };

msg.cfwDevices = cfwDevices;
msg.sswDevices = sswDevices;
msg.banner = banner;
return msg;
```

### 4.4 Trending Charts

Use `ui_chart` nodes:

**Chart 1: CFW900 Currents**
- Group: Trending > CFW900
- Type: Line chart
- X-axis: last 10 minutes
- 4 series connected from 4 `change` nodes:
  ```
  msg.payload = flow.get("cfwDevices")[0].current;  // Series 1
  msg.topic = "CFW900#1";
  ```

**Chart 2: CFW900 Frequencies** (same approach)

**Chart 3: CFW900 DC Bus Voltage** (EMPHASIS)
- Group: Trending > CFW900
- Type: Line chart
- Color: Gold/Yellow (#FFD700)
- Y-axis: 300-800V
- Label: "DC Bus Voltage (V)"

**Chart 4: SSW900 Currents**

**Chart 5: SSW900 Motor Voltage** (EMPHASIS)
- Group: Trending > SSW900
- Type: Line chart
- Color: Gold/Yellow (#FFD700)
- Y-axis: 350-520V

### 4.5 Voltage Detail Page

Add a `ui_template` node:
- Group: Voltage > CFW900 DC Bus Voltage
- Size: 24x12
- Template: copy `voltageTemplate` from WEG_NodeRED_Complete.js
- Connect from voltage monitor function

### 4.6 Data Export (CSV)

**Automatic logging:**
1. `inject` node (interval: every 5 seconds)
2. `function` node: buildCSVLine() from JS file
3. `file` node:
   - Filename: `C:/WEG_Logs/WEG_LOG_{{date}}.csv` (or use function to build path)
   - Action: Append to file
   - Add newline: No (already in CSV line)

**Manual download from dashboard:**
1. Add `ui_button` node: "Download CSV"
2. Connect to `function` node that reads current day file
3. Connect to `file in` node
4. Connect to `http response` node that serves the file

**Alternative: Direct CSV download via HTTP endpoint:**
```
[inject 5s] -> [build CSV line] -> [file append: /data/weg_log.csv]

[http in: GET /api/download] -> [file in: /data/weg_log.csv] -> [http response]
```

Add a `ui_template` button in the DataLog tab:
```html
<a href="/api/download" download="WEG_data.csv">
    <md-button class="md-raised md-primary">Download CSV</md-button>
</a>
```

---

## STEP 5: Telegram Notifications

### 5.1 Create Telegram Bot
1. Open Telegram, search `@BotFather`
2. Send `/newbot`
3. Name: `WEG Monitor Bot`
4. Save the **API Token** (e.g., `123456:ABC-DEF...`)
5. Create a Group chat, add your bot
6. Get Chat ID: send a message to the group, then open:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
   Find `"chat":{"id":-123456789}`

### 5.2 Node-RED Config
1. Install: `node-red-contrib-telegrambot`
2. Add `telegram sender` node
3. Configure bot:
   - Bot Name: WEG Monitor Bot
   - Token: (paste your token)
4. Set flow context: `flow.set("telegramChatId", -123456789)`

### 5.3 Wiring
```
[Parse CFW/SSW] ──> [Alarm Detector] ──> [Rate Limiter] ──┬──> [Format Telegram] ──> [Telegram Sender]
                                                            └──> [Format Email] ──> [Email Send]
```

### 5.4 Notifications you'll receive

**New Fault:**
```
🚨 WEG ALARM
📅 2026-03-30 14:22:15

🔴 CFW900 #2
   Type: FAULT
   Detail: F002: Overcurrent
   Current: 28.5 A
   Voltage: 542.0 V
   Frequency: 58.5 Hz

⚠️ Total active faults: 1
```

**Fault Cleared:**
```
✅ WEG ALARM CLEARED
📅 2026-03-30 14:25:30

🟢 CFW900 #2 - F002: Overcurrent → CLEARED
```

**Daily Report (06:00 AM):**
```
📊 WEG Daily Report — 2026-03-30

CFW900 Drives:
🔵 CFW900 #1: RUNNING | 15.2A | 58.5Hz | DC: 540V (min:520 max:558)
🔵 CFW900 #2: RUNNING | 12.8A | 45.0Hz | DC: 542V (min:518 max:560)
🟢 CFW900 #3: READY | 0.0A | 0.0Hz | DC: 535V (min:515 max:556)
🔵 CFW900 #4: RUNNING | 18.5A | 60.0Hz | DC: 541V (min:519 max:558)

SSW900 Soft Starters:
🔵 SSW900 #1: RUNNING | 35.1A | 460V | 24.5kW (min:455 max:464)
🔵 SSW900 #2: RUNNING | 42.3A | 459V | 30.1kW (min:452 max:465)
🟢 SSW900 #3: READY | 0.0A | 0V | 0.0kW
🟡 SSW900 #4: STARTING | 48.7A | 461V | 34.2kW (min:454 max:464)

⚠️ Active faults: 0
📁 CSV log saved to disk
```

### 5.5 Rate Limiting
- Max 1 notification per device per 5 minutes (prevents spam)
- Cleared alarms always sent immediately
- Daily summary at 06:00 AM regardless

---

## STEP 6: Email Notifications

### 6.1 Node-RED Config
1. Pre-installed: `node-red-node-email`
2. Add `e-mail` node
3. Configure:
   - To: your-email@company.com (comma-separated for multiple)
   - Server: smtp.gmail.com (or your SMTP)
   - Port: 465 (SSL) or 587 (TLS)
   - User: your-email@gmail.com
   - Pass: App Password (not your real password)

### 6.2 Gmail App Password
1. Go to https://myaccount.google.com/security
2. 2-Step Verification > App passwords
3. Generate for "Mail" > "Other (Node-RED)"
4. Use this 16-char password in Node-RED

### 6.3 Email Format
HTML emails with:
- Red header for alarms, green for cleared
- Table with device, fault type, voltage (highlighted gold), current
- Total active faults count
- Auto-generated by the Format Email function node

---

## STEP 7: InfluxDB (Historical Database)

### 7.1 Install InfluxDB 2.x

**Windows:**
Download from https://portal.influxdata.com/downloads/

**Linux / Raspberry Pi:**
```bash
wget https://dl.influxdata.com/influxdb/releases/influxdb2-2.7.1-linux-amd64.tar.gz
tar xvfz influxdb2-2.7.1-linux-amd64.tar.gz
sudo cp influxdb2-2.7.1/usr/bin/influxd /usr/local/bin/
influxd
```

### 7.2 Initial Setup
Open http://localhost:8086
- Organization: `WEG_Monitoring`
- Bucket: `weg_drives`
- Retention: `365 days`
- Generate API Token (Read/Write for weg_drives bucket)

### 7.3 Node-RED Integration
```bash
# Install palette
node-red-contrib-influxdb
```

Add `influxdb out` node:
- Version: 2.0
- URL: http://localhost:8086
- Token: (your API token)
- Organization: WEG_Monitoring
- Bucket: weg_drives

### 7.4 Wiring
```
[Parse CFW900] ──> [Format InfluxDB CFW] ──> [influxdb out]
[Parse SSW900] ──> [Format InfluxDB SSW] ──> [influxdb out]
[Voltage Monitor] ──> [Format InfluxDB Voltage] ──> [influxdb out] (every 30s)
[Alarm Detector] ──> [Format InfluxDB Alarms] ──> [influxdb out] (on events only)
```

### 7.5 Data stored
| Measurement       | Data                                              | Retention |
|-------------------|---------------------------------------------------|-----------|
| cfw900            | current, freq, dc_voltage, torque, rpm, status    | 365 days  |
| ssw900            | current, voltage, power, status                   | 365 days  |
| voltage_analysis  | now, min, max, avg, over/under alarms             | 365 days  |
| alarm_events      | fault text, device, type, voltage at time of fault| 365 days  |

---

## STEP 8: Grafana Dashboards

### 8.1 Install Grafana

**Windows:** Download from https://grafana.com/grafana/download

**Linux:**
```bash
sudo apt-get install -y adduser libfontconfig1
wget https://dl.grafana.com/oss/release/grafana_10.2.3_amd64.deb
sudo dpkg -i grafana_10.2.3_amd64.deb
sudo systemctl enable grafana-server
sudo systemctl start grafana-server
```

Access: http://localhost:3000 (admin/admin)

### 8.2 Add InfluxDB Data Source
1. Configuration > Data Sources > Add
2. Select InfluxDB
3. Query Language: **Flux**
4. URL: http://localhost:8086
5. Organization: WEG_Monitoring
6. Token: (API token)
7. Default Bucket: weg_drives

### 8.3 Recommended Panels

| Panel                    | Type          | Query Field        | Color/Style       |
|--------------------------|---------------|--------------------|-------------------|
| CFW900 Current           | Time Series   | cfw900.current     | Blue shades       |
| CFW900 Frequency         | Time Series   | cfw900.frequency   | Green shades      |
| ⚡ CFW900 DC Bus Voltage | Time Series   | cfw900.dc_bus_voltage | **Gold #FFD700** |
| SSW900 Current           | Time Series   | ssw900.current     | Blue shades       |
| ⚡ SSW900 Motor Voltage  | Time Series   | ssw900.voltage     | **Gold #FFD700** |
| Voltage Stats Table      | Table         | voltage_analysis   | Conditional color |
| Alarm Timeline           | State Timeline| alarm_events       | Red/Green         |
| Running Hours            | Stat          | is_running (cumul) | Green             |
| Active Faults            | Stat          | alarm count        | Red if > 0        |

### 8.4 Grafana Alerts
Configure in Grafana UI (Alerting > Alert Rules):
- CFW DC Bus > 750V for 10s → Telegram + Email
- CFW DC Bus < 350V for 10s → Telegram + Email
- SSW Motor Voltage > 480V → Telegram + Email
- SSW Motor Voltage < 400V → Telegram + Email
- SSW Voltage Imbalance > 5% → Email
- Any device is_fault = 1 → Telegram + Email
- Any device is_online = 0 for 30s → Telegram

---

## COMPLETE FLOW WIRING

```
                                                    ┌──> [Format Telegram] ──> [Telegram Bot]
                                                    │
[Modbus Read CFW] ──> [Parse CFW900] ──┐            ├──> [Format Email] ──> [SMTP Send]
       (1s)                             │            │
                                        ├──> [Join]──┤──> [Combine+Banner] ──> [ui_template: Overview]
                                        │            │
[Modbus Read SSW] ──> [Parse SSW900] ──┘            ├──> [Voltage Monitor] ──> [ui_template: Voltage]
       (1s)            │    │                        │
                       │    │                        ├──> [Split Channels] ──> [ui_chart x5: Trends]
                       │    │                        │
                       │    │                        ├──> [Build CSV] ──> [file: append daily CSV]
                       │    │                        │
                       │    └──> [InfluxDB SSW] ──> [influxdb out]
                       │
                       └──> [InfluxDB CFW] ──> [influxdb out]

[Alarm Detector] ──> [Rate Limiter] ──┬──> [Format Telegram] ──> [Telegram]
                                       ├──> [Format Email] ──> [Email]
                                       └──> [InfluxDB Alarms] ──> [influxdb out]

[Inject 06:00 AM] ──> [Daily Summary] ──> [Telegram Bot]

[Inject 30s] ──> [Voltage Stats] ──> [InfluxDB Voltage] ──> [influxdb out]

                                    Grafana: http://localhost:3000
                                    (reads from InfluxDB for advanced dashboards)
```

---

## ACCESS POINTS

| Service          | URL                              | Purpose                  |
|------------------|----------------------------------|--------------------------|
| Node-RED Editor  | http://IP:1880                   | Flow editor              |
| Node-RED Dashboard| http://IP:1880/ui               | Live monitoring          |
| InfluxDB         | http://IP:8086                   | Database admin           |
| Grafana          | http://IP:3000                   | Advanced dashboards      |
| PLC WebVisu      | http://PLC_IP:8080/webvisu.htm   | Backup (if needed)       |

---

## INSTALL SUMMARY (all palettes)

```bash
# In Node-RED > Menu > Manage palette > Install:
node-red-contrib-modbus           # Modbus TCP to M241
node-red-dashboard                # Dashboard UI
node-red-contrib-telegrambot      # Telegram notifications
node-red-node-email               # Email notifications (pre-installed)
node-red-contrib-influxdb         # InfluxDB connector
node-red-node-smooth              # Signal smoothing (optional)
```
