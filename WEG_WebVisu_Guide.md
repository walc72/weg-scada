# WebVisu Screens Guide - WEG Monitoring
## Machine Expert Visualization Setup

---

## SCREEN 1: OVERVIEW (Main Page)

### Layout (800x480 or 1024x600)

```
+================================================================+
|  WEG DRIVES MONITORING SYSTEM              [ALARMS: 0] [COMM]  |
+================================================================+
|                                                                  |
|  CFW900 VARIABLE FREQ DRIVES           SSW900 SOFT STARTERS     |
|  +----------+----------+               +----------+----------+   |
|  | CFW900#1 | CFW900#2 |               | SSW900#1 | SSW900#2 |   |
|  |  [LED]   |  [LED]   |               |  [LED]   |  [LED]   |   |
|  | 15.2 A   | 12.8 A   |               | 35.1 A   | 42.3 A   |   |
|  | 58.5 Hz  | 45.0 Hz  |               | 460 V    | 458 V    |   |
|  |[=====  ] |[====   ] |               |[======= ]|[======= ]|   |
|  | RUNNING  | RUNNING  |               | BYPASS   | BYPASS   |   |
|  +----------+----------+               +----------+----------+   |
|  | CFW900#3 | CFW900#4 |               | SSW900#3 | SSW900#4 |   |
|  |  [LED]   |  [LED]   |               |  [LED]   |  [LED]   |   |
|  | 0.0 A    | 18.5 A   |               | 0.0 A    | 48.7 A   |   |
|  | 0.0 Hz   | 60.0 Hz  |               | 0 V      | 461 V    |   |
|  |[         ]|[======= ]|               |[         ]|[======= ]|   |
|  | READY    | RUNNING  |               | READY    | STARTING |   |
|  +----------+----------+               +----------+----------+   |
|                                                                  |
|  [DETAIL CFW900]         [DETAIL SSW900]         [ALARMS]       |
+==================================================================+
```

### Element-Variable Mapping (Overview)

#### CFW900 Tiles (repeat for i = 1..4)

| Element          | Type         | Variable                                   | Format   |
|------------------|--------------|--------------------------------------------|----------|
| Current value    | Text Display | `GVL_WEG.stCFW900[i].rOutputCurrent`      | %.1f A   |
| Frequency value  | Text Display | `GVL_WEG.stCFW900[i].rOutputFreq`         | %.1f Hz  |
| Current bar      | Bar Graph    | `GVL_HMI.arCFW_CurrentPct[i]`             | 0-100%   |
| Status LED       | Ellipse      | Color toggle on `GVL_HMI.arCFW_StatusColor[i]` |    |
| Status text      | Text Display | Use color toggle text (see colors below)    |          |
| Touch (navigate) | Rectangle    | Input > OnMouseClick > Write `GVL_HMI.iSelectedCFW` := i, then switch to CFW Detail page |

#### SSW900 Tiles (repeat for i = 1..4)

| Element          | Type         | Variable                                   | Format   |
|------------------|--------------|--------------------------------------------|----------|
| Current value    | Text Display | `GVL_WEG.stSSW900[i].rMotorCurrent`       | %.1f A   |
| Voltage value    | Text Display | `GVL_WEG.stSSW900[i].rMotorVoltage`       | %.0f V   |
| Current bar      | Bar Graph    | `GVL_HMI.arSSW_CurrentPct[i]`             | 0-100%   |
| Status LED       | Ellipse      | Color toggle on `GVL_HMI.arSSW_StatusColor[i]` |    |
| Touch (navigate) | Rectangle    | Input > OnMouseClick > Write `GVL_HMI.iSelectedSSW` := i, then switch to SSW Detail page |

#### Color Toggle Values

| Value | CFW900 Status | SSW900 Status | Color    | RGB          |
|-------|---------------|---------------|----------|--------------|
| 0     | OFF           | OFF           | Gray     | 128,128,128  |
| 1     | READY         | READY         | Green    | 0,180,0      |
| 2     | RUNNING       | RUNNING       | Blue     | 0,100,220    |
| 3     | FAULT         | STARTING      | Red/Yellow | 220,0,0 / 255,200,0 |
| 4     | -             | FAULT         | Red      | 220,0,0      |

#### Alarm Banner

| Element        | Variable                  | Behavior                    |
|----------------|---------------------------|-----------------------------|
| Alarm count    | `GVL_HMI.iAlarmCount`    | Display number              |
| Alarm indicator| `GVL_HMI.bAlarmActive`   | Blink red when TRUE         |
| Comm SL1       | `GVL_WEG.bComm_SL1_OK`  | Green=OK, Red=Error         |
| Comm SL2       | `GVL_WEG.bComm_SL2_OK`  | Green=OK, Red=Error         |

---

## SCREEN 2: CFW900 DETAIL

### Layout

```
+================================================================+
|  CFW900 DETAIL                    [<< BACK]    [< PREV] [NEXT >]|
+================================================================+
|                                                                  |
|  CFW900 #1 - RUNNING                            ONLINE [*]      |
|  +--------------------------+   +-----------------------------+  |
|  |  SPEED                   |   |                             |  |
|  |  1750 RPM                |   |   GAUGE: Output Current     |  |
|  |  [================     ] |   |   15.2 A / 25.0 A          |  |
|  +--------------------------+   |                             |  |
|  |  CURRENT                 |   |        ___                  |  |
|  |  15.2 A                  |   |      /     \               |  |
|  |  [============         ] |   |     |  60%  |              |  |
|  +--------------------------+   |      \ ___ /               |  |
|  |  FREQUENCY               |   |                             |  |
|  |  58.5 Hz                 |   +-----------------------------+  |
|  |  [================     ] |                                    |
|  +--------------------------+   FAULT STATUS:                    |
|  |  DC BUS VOLTAGE          |   No Fault                        |
|  |  540 V                   |                                    |
|  +--------------------------+   COMM ERRORS: 0                   |
|  |  TORQUE                  |                                    |
|  |  45.2 %                  |                                    |
|  |  [==========           ] |                                    |
|  +--------------------------+                                    |
|                                                                  |
+==================================================================+
```

### Element-Variable Mapping (CFW Detail)

| Element          | Type         | Variable                                        |
|------------------|--------------|-------------------------------------------------|
| Device name      | Text Display | `GVL_HMI.stCFW_Detail.sDeviceName`             |
| Status text      | Text Display | `GVL_HMI.stCFW_Detail.sStatusText`             |
| Speed value      | Text Display | `GVL_HMI.stCFW_Detail.rSpeedRPM`               |
| Current value    | Text Display | `GVL_HMI.stCFW_Detail.rCurrent`                |
| Frequency value  | Text Display | `GVL_HMI.stCFW_Detail.rFrequency`              |
| DC Bus Voltage   | Text Display | `GVL_HMI.stCFW_Detail.rDCBusVoltage`           |
| Torque value     | Text Display | `GVL_HMI.stCFW_Detail.rTorque`                 |
| Current bar      | Bar Graph    | `GVL_HMI.stCFW_Detail.rCurrentBar` (0-120)     |
| Frequency bar    | Bar Graph    | `GVL_HMI.stCFW_Detail.rFreqBar` (0-120)        |
| Torque bar       | Bar Graph    | `GVL_HMI.stCFW_Detail.rTorqueBar` (0-120)      |
| Voltage bar      | Bar Graph    | `GVL_HMI.stCFW_Detail.rVoltageBar` (0-120)     |
| Fault text       | Text Display | `GVL_HMI.stCFW_Detail.sFaultText`              |
| Online LED       | Ellipse      | `GVL_HMI.stCFW_Detail.bOnline`                 |
| Comm errors      | Text Display | `GVL_HMI.stCFW_Detail.uiCommErrors`            |
| Status color     | Background   | Color toggle on `GVL_HMI.stCFW_Detail.iStatusColor` |

### Navigation Buttons

| Button   | Action (OnMouseClick)                                                |
|----------|----------------------------------------------------------------------|
| BACK     | Switch visualization to Overview page                                |
| PREV (<) | Write `GVL_HMI.iSelectedCFW := MAX(1, GVL_HMI.iSelectedCFW - 1)`  |
| NEXT (>) | Write `GVL_HMI.iSelectedCFW := MIN(4, GVL_HMI.iSelectedCFW + 1)`  |

---

## SCREEN 3: SSW900 DETAIL

### Layout

```
+================================================================+
|  SSW900 DETAIL                    [<< BACK]    [< PREV] [NEXT >]|
+================================================================+
|                                                                  |
|  SSW900 #1 - RUNNING (BYPASS)                    ONLINE [*]     |
|  +--------------------------+   +-----------------------------+  |
|  |  MOTOR CURRENT           |   |                             |  |
|  |  35.1 A                  |   |   GAUGE: Motor Current      |  |
|  |  [==============       ] |   |   35.1 A / 50.0 A          |  |
|  +--------------------------+   |                             |  |
|  |  MOTOR VOLTAGE           |   |        ___                  |  |
|  |  460 V                   |   |      /     \               |  |
|  |  [================     ] |   |     |  70%  |              |  |
|  +--------------------------+   |      \ ___ /               |  |
|  |  MOTOR POWER             |   |                             |  |
|  |  24.5 kW                 |   +-----------------------------+  |
|  |  [============         ] |                                    |
|  +--------------------------+   FAULT STATUS:                    |
|                                  No Fault                        |
|                                                                  |
|                                  COMM ERRORS: 0                  |
|                                                                  |
+==================================================================+
```

### Element-Variable Mapping (SSW Detail)

| Element          | Type         | Variable                                        |
|------------------|--------------|-------------------------------------------------|
| Device name      | Text Display | `GVL_HMI.stSSW_Detail.sDeviceName`             |
| Status text      | Text Display | `GVL_HMI.stSSW_Detail.sStatusText`             |
| Current value    | Text Display | `GVL_HMI.stSSW_Detail.rCurrent`                |
| Voltage value    | Text Display | `GVL_HMI.stSSW_Detail.rVoltage`                |
| Power value      | Text Display | `GVL_HMI.stSSW_Detail.rPower`                  |
| Current bar      | Bar Graph    | `GVL_HMI.stSSW_Detail.rCurrentBar` (0-120)     |
| Voltage bar      | Bar Graph    | `GVL_HMI.stSSW_Detail.rVoltageBar` (0-120)     |
| Power bar        | Bar Graph    | `GVL_HMI.stSSW_Detail.rPowerBar` (0-120)       |
| Fault text       | Text Display | `GVL_HMI.stSSW_Detail.sFaultText`              |
| Online LED       | Ellipse      | `GVL_HMI.stSSW_Detail.bOnline`                 |
| Comm errors      | Text Display | `GVL_HMI.stSSW_Detail.uiCommErrors`            |
| Status color     | Background   | Color toggle on `GVL_HMI.stSSW_Detail.iStatusColor` |

---

## ALARM BANNER (all screens - top or bottom bar)

### Layout

```
+================================================================+
| !! [1/3] CFW900#2: F002 Overcurrent !!                        |
+================================================================+
```

The banner is a single rectangle + text field placed on ALL screens.
It rotates through active faults every 3 seconds showing `[n/total]`.
When no faults: shows "SYSTEM OK - All drives operating normally" in green.

### Elements

| Element             | Type          | Variable / Config                               |
|---------------------|---------------|-------------------------------------------------|
| Banner background   | Rectangle     | Color toggle on `GVL_Banner.iBannerColor`       |
|                     |               | Value 0: RGB(0,140,0) Green = OK                |
|                     |               | Value 1: RGB(200,180,0) Yellow = Warning        |
|                     |               | Value 2: RGB(200,0,0) Red = Fault               |
| Banner text         | Text Display  | `GVL_Banner.sBannerText`                        |
|                     |               | Font: Bold, White, 14-16pt                      |
|                     |               | Alignment: Center                               |
| Blink effect        | Visibility    | Toggle `GVL_Banner.bBannerBlink` on the         |
|                     |               | background to alternate red/dark-red             |

### How to add blink effect
1. Place 2 rectangles stacked (same size, same position)
2. Bottom rectangle: fixed dark red RGB(100,0,0)
3. Top rectangle: bright red RGB(220,0,0), visibility = `GVL_Banner.bBannerBlink`
4. The 500ms toggle creates a blinking effect when faults are active

### Banner placement
- Place at the **top** of every screen (Overview, CFW Detail, SSW Detail, Trending)
- Height: ~40px, full width
- The text auto-updates with the current fault message

---

## SCREEN 4: TRENDING

### Layout

```
+================================================================+
|  !! SYSTEM OK - All drives operating normally !!    [BANNER]    |
+================================================================+
|  [<< BACK]    [CFW CURRENT] [CFW FREQ] [SSW CURRENT]           |
|                                                                  |
|  +------------------------------------------------------------+ |
|  | A                                                           | |
|  | 25 ----.---------.---------+---------.---------.------      | |
|  |    .--' \   .--./  \      / \        /\       / \    `--.   | |
|  | 20 /     `-'   /    \    /   \  .--./  \    ./   \      \   | |
|  |   /            \     `..'     `-'   `   `--'      `--    \  | |
|  | 15               \                                        \ | |
|  |                    `--                                      | |
|  | 10                                                          | |
|  |    --- CFW#1  --- CFW#2  --- CFW#3  --- CFW#4               | |
|  +------------------------------------------------------------+ |
|  | 10:00    10:05    10:10    10:15    10:20    10:25   Time   | |
|  +------------------------------------------------------------+ |
|                                                                  |
+==================================================================+
```

### WebVisu Trend Element Setup

1. **Add Trend element**: Toolbox > Trend
2. Resize to fill the screen area below the banner

### Trend 1: CFW900 Currents (4 traces)

| Trace | Variable                          | Color          | Label    |
|-------|-----------------------------------|----------------|----------|
| 1     | `GVL_Banner.rTrend_CFW1_Current`  | RGB(0,100,220) | CFW900#1 |
| 2     | `GVL_Banner.rTrend_CFW2_Current`  | RGB(220,0,0)   | CFW900#2 |
| 3     | `GVL_Banner.rTrend_CFW3_Current`  | RGB(0,180,0)   | CFW900#3 |
| 4     | `GVL_Banner.rTrend_CFW4_Current`  | RGB(200,130,0) | CFW900#4 |

- Y-Axis: 0 to `rCFW_NominalCurrent * 1.2` (e.g., 0-30 A)
- X-Axis: Time, 10 minutes window
- Sample rate: 1 second
- Buffer: 600 samples (10 min)

### Trend 2: CFW900 Frequencies (4 traces)

| Trace | Variable                        | Color          | Label    |
|-------|---------------------------------|----------------|----------|
| 1     | `GVL_Banner.rTrend_CFW1_Freq`   | RGB(0,100,220) | CFW900#1 |
| 2     | `GVL_Banner.rTrend_CFW2_Freq`   | RGB(220,0,0)   | CFW900#2 |
| 3     | `GVL_Banner.rTrend_CFW3_Freq`   | RGB(0,180,0)   | CFW900#3 |
| 4     | `GVL_Banner.rTrend_CFW4_Freq`   | RGB(200,130,0) | CFW900#4 |

- Y-Axis: 0 to 70 Hz
- X-Axis: Time, 10 minutes window

### Trend 3: SSW900 Currents (4 traces)

| Trace | Variable                          | Color          | Label    |
|-------|-----------------------------------|----------------|----------|
| 1     | `GVL_Banner.rTrend_SSW1_Current`  | RGB(0,100,220) | SSW900#1 |
| 2     | `GVL_Banner.rTrend_SSW2_Current`  | RGB(220,0,0)   | SSW900#2 |
| 3     | `GVL_Banner.rTrend_SSW3_Current`  | RGB(0,180,0)   | SSW900#3 |
| 4     | `GVL_Banner.rTrend_SSW4_Current`  | RGB(200,130,0) | SSW900#4 |

- Y-Axis: 0 to `rSSW_NominalCurrent * 1.2` (e.g., 0-60 A)
- X-Axis: Time, 10 minutes window

### Trend 4: CFW900 DC Bus Voltage (4 traces)

| Trace | Variable                              | Color          | Label    |
|-------|---------------------------------------|----------------|----------|
| 1     | `GVL_DataLog.rTrend_CFW1_DCVoltage`  | RGB(0,100,220) | CFW900#1 |
| 2     | `GVL_DataLog.rTrend_CFW2_DCVoltage`  | RGB(220,0,0)   | CFW900#2 |
| 3     | `GVL_DataLog.rTrend_CFW3_DCVoltage`  | RGB(0,180,0)   | CFW900#3 |
| 4     | `GVL_DataLog.rTrend_CFW4_DCVoltage`  | RGB(200,130,0) | CFW900#4 |

- Y-Axis: 300 to 800 V (DC Bus range)
- Add horizontal reference lines at `rCFW_DCBus_Low` (350V) and `rCFW_DCBus_High` (750V)

### Trend 5: SSW900 Motor Voltage (4 traces)

| Trace | Variable                            | Color          | Label    |
|-------|-------------------------------------|----------------|----------|
| 1     | `GVL_DataLog.rTrend_SSW1_Voltage`   | RGB(0,100,220) | SSW900#1 |
| 2     | `GVL_DataLog.rTrend_SSW2_Voltage`   | RGB(220,0,0)   | SSW900#2 |
| 3     | `GVL_DataLog.rTrend_SSW3_Voltage`   | RGB(0,180,0)   | SSW900#3 |
| 4     | `GVL_DataLog.rTrend_SSW4_Voltage`   | RGB(200,130,0) | SSW900#4 |

- Y-Axis: 350 to 520 V (Motor voltage range)
- Add horizontal reference lines at `rSSW_Motor_Low` (400V) and `rSSW_Motor_High` (480V)

### Navigation buttons for trend views
Use 5 toggle buttons to show/hide each trend:
- **[CFW CURRENT]** > Toggle visibility of Trend 1
- **[CFW FREQ]** > Toggle visibility of Trend 2
- **[SSW CURRENT]** > Toggle visibility of Trend 3
- **[CFW VOLTAGE]** > Toggle visibility of Trend 4
- **[SSW VOLTAGE]** > Toggle visibility of Trend 5

### WebVisu Trend Properties
1. Select Trend element > Properties
2. **History**: Buffer length = 600
3. **X-Axis**: Auto scroll, range = 600s
4. **Traces**: Add 4 traces per trend, assign variables
5. **Grid**: Show horizontal grid lines
6. **Legend**: Show at bottom with trace names

---

## SETUP STEPS IN MACHINE EXPERT

### 1. Create Visualizations
1. Right-click **Application > Add Object > Visualization**
2. Create 6 visualizations:
   - `VISU_Overview` (set as Start visualization)
   - `VISU_CFW900_Detail`
   - `VISU_SSW900_Detail`
   - `VISU_Trending`
   - `VISU_Voltage` (voltage detail with min/max/avg)
   - `VISU_DataLog` (logging control and status)

### 2. Configure WebVisu
1. Right-click **Application > Add Object > Visualization Manager**
2. Under **WebVisualization**:
   - Start Visualization: `VISU_Overview`
   - Resolution: 1024 x 600 (or your screen size)
   - Enable scaling

### 3. Build Each Screen
For each visualization, use the Toolbox to add:
- **Rectangle**: Background panels, tiles
- **Text Display**: Bind to variables (Properties > Text Variable)
- **Bar Display**: Bind to percentage variables (0-100 or 0-120 range)
- **Ellipse**: For status LEDs, use Color Toggle with the StatusColor variables
- **Button/Rectangle with Input**: For navigation, use OnMouseClick

### 4. Color Toggle Setup (for LEDs and status)
1. Select the ellipse/rectangle
2. Properties > Color Variables > Toggle Color
3. Variable: `GVL_HMI.arCFW_StatusColor[1]`
4. Add color entries:
   - Value 0: RGB(128,128,128) - Gray
   - Value 1: RGB(0,180,0) - Green
   - Value 2: RGB(0,100,220) - Blue
   - Value 3: RGB(220,0,0) - Red

### 5. Page Navigation
For navigation buttons use **Input Configuration**:
- OnMouseClick > Write Variable > `GVL_HMI.iSelectedCFW` = value
- OnMouseClick > Switch Visualization > target page name

### 6. Access WebVisu
After download to PLC, open browser:
```
http://<PLC_IP_ADDRESS>:8080/webvisu.htm
```
Default M241 IP: 192.168.0.1 (configure in Ethernet settings)

---

## TASK ASSIGNMENT

| Program              | Task  | Notes                         |
|----------------------|-------|-------------------------------|
| PRG_WEG_Modbus_SL1  | MAST  | Polls CFW900 on SL1          |
| PRG_WEG_Modbus_SL2  | MAST  | Polls SSW900 on SL2          |
| PRG_HMI_Update       | MAST  | Updates HMI variables         |
| PRG_AlarmBanner      | MAST  | Builds alarm banner text      |
| PRG_Trending         | MAST  | Copies data for trend graphs  |
| PRG_VoltageMonitor   | MAST  | Voltage min/max/avg + alarms  |
| PRG_DataLogger       | MAST  | CSV export to SD card         |

Order in MAST: Modbus SL1 > Modbus SL2 > HMI Update > AlarmBanner > Trending > VoltageMonitor > DataLogger

### Visualizations (6 total)

| Visualization       | Description                           | Start Page |
|----------------------|---------------------------------------|------------|
| VISU_Overview        | 8 devices at a glance + banner        | YES        |
| VISU_CFW900_Detail   | CFW900 detail view + banner           | No         |
| VISU_SSW900_Detail   | SSW900 detail view + banner           | No         |
| VISU_Trending        | Current/Freq/Voltage trend graphs     | No         |
| VISU_Voltage         | Voltage detail with min/max/avg table | No         |
| VISU_DataLog         | Data logging control and status       | No         |

---

## SCREEN 5: VOLTAGE MONITOR

### Layout

```
+================================================================+
|  !! BANNER !!                                                    |
+================================================================+
|  VOLTAGE MONITOR            [<< BACK]    [RESET MIN/MAX]        |
+================================================================+
|                                                                  |
|  CFW900 - DC BUS VOLTAGE                                        |
|  +--------+---------+---------+---------+---------+--------+    |
|  | Device | Now (V) | Min (V) | Max (V) | Avg (V) | Status |    |
|  +--------+---------+---------+---------+---------+--------+    |
|  | CFW#1  | 540.2   | 520.1   | 558.3   | 538.7   |  [OK]  |    |
|  | CFW#2  | 542.8   | 518.9   | 560.1   | 540.2   |  [OK]  |    |
|  | CFW#3  | 535.4   | 515.2   | 555.8   | 536.1   |  [OK]  |    |
|  | CFW#4  | 541.0   | 519.7   | 557.5   | 539.4   |  [OK]  |    |
|  +--------+---------+---------+---------+---------+--------+    |
|  Thresholds: Low = 350 V  |  High = 750 V                      |
|                                                                  |
|  SSW900 - MOTOR VOLTAGE                                         |
|  +--------+---------+---------+---------+---------+--------+    |
|  | Device | Now (V) | Min (V) | Max (V) | Avg (V) | Imbal% |    |
|  +--------+---------+---------+---------+---------+--------+    |
|  | SSW#1  | 460.2   | 455.1   | 463.5   | 459.8   | 0.3%   |    |
|  | SSW#2  | 458.7   | 452.3   | 465.1   | 458.2   | 0.6%   |    |
|  | SSW#3  | 461.5   | 456.8   | 464.2   | 460.1   | 0.1%   |    |
|  | SSW#4  | 459.1   | 453.9   | 463.8   | 458.9   | 0.5%   |    |
|  +--------+---------+---------+---------+---------+--------+    |
|  Thresholds: Low = 400 V  |  High = 480 V  |  Imbal Max = 5%  |
|                                                                  |
+==================================================================+
```

### Element-Variable Mapping (Voltage Screen)

#### CFW900 Voltage Table (repeat for i = 1..4)

| Column    | Variable                                        | Format  |
|-----------|-------------------------------------------------|---------|
| Now       | `GVL_DataLog.stCFW_Voltage[i].rVoltageNow`     | %.1f V  |
| Min       | `GVL_DataLog.stCFW_Voltage[i].rVoltageMin`     | %.1f V  |
| Max       | `GVL_DataLog.stCFW_Voltage[i].rVoltageMax`     | %.1f V  |
| Avg       | `GVL_DataLog.stCFW_Voltage[i].rVoltageAvg`     | %.1f V  |
| Status LED| Color toggle on `GVL_DataLog.stCFW_Voltage[i].bAlarm` (FALSE=Green, TRUE=Red) |

#### SSW900 Voltage Table (repeat for i = 1..4)

| Column    | Variable                                        | Format  |
|-----------|-------------------------------------------------|---------|
| Now       | `GVL_DataLog.stSSW_Voltage[i].rVoltageNow`     | %.1f V  |
| Min       | `GVL_DataLog.stSSW_Voltage[i].rVoltageMin`     | %.1f V  |
| Max       | `GVL_DataLog.stSSW_Voltage[i].rVoltageMax`     | %.1f V  |
| Avg       | `GVL_DataLog.stSSW_Voltage[i].rVoltageAvg`     | %.1f V  |
| Imbalance | `GVL_DataLog.stSSW_Voltage[i].rDeviation`      | %.1f %  |

#### Threshold Inputs (editable from HMI)

| Field          | Variable                          | Type       |
|----------------|-----------------------------------|------------|
| CFW DC High    | `GVL_DataLog.rCFW_DCBus_High`    | Numeric Input |
| CFW DC Low     | `GVL_DataLog.rCFW_DCBus_Low`     | Numeric Input |
| SSW Motor High | `GVL_DataLog.rSSW_Motor_High`    | Numeric Input |
| SSW Motor Low  | `GVL_DataLog.rSSW_Motor_Low`     | Numeric Input |
| Imbalance Max  | `GVL_DataLog.rSSW_Imbalance_Max` | Numeric Input |

#### Reset Button
- OnMouseClick > Call `FC_ResetVoltageStats` (or write TRUE to a trigger variable)

---

## SCREEN 6: DATA LOGGING CONTROL

### Layout

```
+================================================================+
|  !! BANNER !!                                                    |
+================================================================+
|  DATA LOGGING                               [<< BACK]           |
+================================================================+
|                                                                  |
|  Status: Logging OK - Records: 1,247                            |
|  File: /sd0/WEG_LOG_2026-03-30.csv                             |
|                                                                  |
|  +---------------------+  +---------------------+               |
|  | [x] Enable Logging  |  | Log Interval: [5] s |               |
|  +---------------------+  +---------------------+               |
|                                                                  |
|  +---------------------+  +---------------------+               |
|  | [TAKE SNAPSHOT NOW] |  | Records: 1,247      |               |
|  +---------------------+  +---------------------+               |
|                                                                  |
|  CSV COLUMNS:                                                    |
|  DateTime, CFW1-4 (A, Hz, VDC, Torq, RPM, Status),             |
|  SSW1-4 (A, V, kW, Status)                                     |
|                                                                  |
|  NOTE: Remove SD card and open CSV in Excel                     |
|  to analyze historical data. New file created daily.            |
|                                                                  |
+==================================================================+
```

### Element-Variable Mapping (DataLog Screen)

| Element           | Type           | Variable                           |
|-------------------|----------------|------------------------------------|
| Status text       | Text Display   | `GVL_DataLog.sLogStatus`          |
| File name         | Text Display   | `GVL_DataLog.sCurrentFileName`    |
| Enable checkbox   | Toggle         | `GVL_DataLog.bLogEnabled`         |
| Interval input    | Numeric Input  | `GVL_DataLog.iLogInterval` (1-60) |
| Snapshot button   | Button         | Write TRUE to `GVL_DataLog.bExportSnapshot` |
| Record count      | Text Display   | `GVL_DataLog.ulRecordCount`       |
| SD card LED       | Ellipse        | `GVL_DataLog.bSDCardPresent`      |
| Error LED         | Ellipse        | `GVL_DataLog.bLogError` (Red)     |

---

## SD CARD SETUP

1. Insert microSD card in M241 slot (FAT32 formatted)
2. Path in PLC: `/sd0/`
3. Files created: `WEG_LOG_YYYY-MM-DD.csv` (one per day)
4. To export: remove SD card, insert in PC, open CSV in Excel
5. CSV contains all 8 devices with timestamp every N seconds

### CSV Output Example
```
DateTime,CFW1_A,CFW1_Hz,CFW1_VDC,CFW1_Torq,CFW1_RPM,CFW1_Sts,...,SSW4_A,SSW4_V,SSW4_kW,SSW4_Sts
2026-03-30 10:00:05,15.2,58.5,540.2,45.2,1750,3,...,48.7,461.0,34.2,3
2026-03-30 10:00:10,15.4,58.6,541.0,45.5,1752,3,...,48.5,460.8,34.1,3
```
