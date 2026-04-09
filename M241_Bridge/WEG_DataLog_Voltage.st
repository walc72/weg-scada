// ============================================================================
// WEG DATA LOGGING (SD Card) + VOLTAGE EMPHASIS
// Exports CSV to M241 SD card + enhanced voltage monitoring
// Libraries required: FileIO, SysFile, SysTimeRtc, CAA File
// ============================================================================


// ============================================================================
// GVL: GVL_DataLog
// ============================================================================

{attribute 'qualified_only'}
VAR_GLOBAL

    // ---- Data Logging Control ----
    bLogEnabled         : BOOL := TRUE;     // Enable/disable logging from HMI
    bLogActive          : BOOL;             // Logging is running
    bLogError           : BOOL;             // File error occurred
    sLogStatus          : STRING(60);       // Status message for HMI
    iLogInterval        : INT := 5;         // Log interval in seconds (adjustable from HMI)
    ulRecordCount       : UDINT;            // Total records written

    // ---- File Management ----
    bNewFileDaily       : BOOL := TRUE;     // Create new file each day
    sCurrentFileName    : STRING(80);       // Current log file name
    bSDCardPresent      : BOOL;             // SD card detected
    ulFileSizeKB        : UDINT;            // Current file size

    // ---- Manual Export Trigger ----
    bExportSnapshot     : BOOL;             // Trigger single snapshot from HMI
    bExportDone         : BOOL;             // Snapshot saved confirmation

    // ---- Voltage Monitoring (Enhanced) ----
    // CFW900 Voltages
    stCFW_Voltage       : ARRAY[1..4] OF ST_VoltageMonitor;

    // SSW900 Voltages
    stSSW_Voltage       : ARRAY[1..4] OF ST_VoltageMonitor;

    // Voltage Alarms
    bVoltageAlarmActive : BOOL;             // Any voltage alarm
    iVoltageAlarmCount  : INT;

    // Voltage Thresholds (adjustable from HMI)
    rCFW_DCBus_High     : REAL := 750.0;    // DC Bus overvoltage threshold (V)
    rCFW_DCBus_Low      : REAL := 350.0;    // DC Bus undervoltage threshold (V)
    rSSW_Motor_High     : REAL := 480.0;    // Motor overvoltage threshold (V)
    rSSW_Motor_Low      : REAL := 400.0;    // Motor undervoltage threshold (V)
    rSSW_Imbalance_Max  : REAL := 5.0;      // Max voltage imbalance (%) between SSW units

    // Trending Voltage
    rTrend_CFW1_DCVoltage : REAL;
    rTrend_CFW2_DCVoltage : REAL;
    rTrend_CFW3_DCVoltage : REAL;
    rTrend_CFW4_DCVoltage : REAL;
    rTrend_SSW1_Voltage   : REAL;
    rTrend_SSW2_Voltage   : REAL;
    rTrend_SSW3_Voltage   : REAL;
    rTrend_SSW4_Voltage   : REAL;

END_VAR


// ============================================================================
// DUT: ST_VoltageMonitor
// ============================================================================

TYPE ST_VoltageMonitor :
STRUCT
    rVoltageNow     : REAL;         // Current voltage reading
    rVoltageMin     : REAL;         // Minimum since reset
    rVoltageMax     : REAL;         // Maximum since reset
    rVoltageAvg     : REAL;         // Running average

    // Alarms
    bOvervoltage    : BOOL;         // Above high threshold
    bUndervoltage   : BOOL;         // Below low threshold
    bAlarm          : BOOL;         // Any voltage alarm

    // Stats
    rDeviation      : REAL;         // Deviation from average (%)
    ulSampleCount   : UDINT;        // Samples for average calc
    rAccumulator    : LREAL;        // Sum for average (internal)
END_STRUCT
END_TYPE


// ============================================================================
// PROGRAM: PRG_VoltageMonitor
// Enhanced voltage tracking with min/max/avg and alarms
// Task: MAST
// ============================================================================

PROGRAM PRG_VoltageMonitor
VAR
    i               : INT;
    rAvgSSW         : REAL;         // Average voltage across all SSW units
    iOnlineSSW      : INT;
    bFirstScan      : BOOL := TRUE;
END_VAR

// =========================================
// Initialize min/max on first scan
// =========================================
IF bFirstScan THEN
    FOR i := 1 TO 4 DO
        GVL_DataLog.stCFW_Voltage[i].rVoltageMin := 9999.0;
        GVL_DataLog.stCFW_Voltage[i].rVoltageMax := 0.0;
        GVL_DataLog.stSSW_Voltage[i].rVoltageMin := 9999.0;
        GVL_DataLog.stSSW_Voltage[i].rVoltageMax := 0.0;
    END_FOR;
    bFirstScan := FALSE;
END_IF;

// =========================================
// CFW900: DC Bus Voltage monitoring
// =========================================
GVL_DataLog.iVoltageAlarmCount := 0;

FOR i := 1 TO 4 DO
    IF GVL_WEG.stCFW900[i].bOnline THEN

        GVL_DataLog.stCFW_Voltage[i].rVoltageNow := GVL_WEG.stCFW900[i].rDCBusVoltage;

        // Min / Max
        IF GVL_DataLog.stCFW_Voltage[i].rVoltageNow < GVL_DataLog.stCFW_Voltage[i].rVoltageMin THEN
            GVL_DataLog.stCFW_Voltage[i].rVoltageMin := GVL_DataLog.stCFW_Voltage[i].rVoltageNow;
        END_IF;
        IF GVL_DataLog.stCFW_Voltage[i].rVoltageNow > GVL_DataLog.stCFW_Voltage[i].rVoltageMax THEN
            GVL_DataLog.stCFW_Voltage[i].rVoltageMax := GVL_DataLog.stCFW_Voltage[i].rVoltageNow;
        END_IF;

        // Running average
        GVL_DataLog.stCFW_Voltage[i].ulSampleCount := GVL_DataLog.stCFW_Voltage[i].ulSampleCount + 1;
        GVL_DataLog.stCFW_Voltage[i].rAccumulator := GVL_DataLog.stCFW_Voltage[i].rAccumulator +
            REAL_TO_LREAL(GVL_DataLog.stCFW_Voltage[i].rVoltageNow);

        IF GVL_DataLog.stCFW_Voltage[i].ulSampleCount > 0 THEN
            GVL_DataLog.stCFW_Voltage[i].rVoltageAvg := LREAL_TO_REAL(
                GVL_DataLog.stCFW_Voltage[i].rAccumulator /
                UDINT_TO_LREAL(GVL_DataLog.stCFW_Voltage[i].ulSampleCount)
            );
        END_IF;

        // Overvoltage / Undervoltage alarms
        GVL_DataLog.stCFW_Voltage[i].bOvervoltage :=
            GVL_DataLog.stCFW_Voltage[i].rVoltageNow > GVL_DataLog.rCFW_DCBus_High;
        GVL_DataLog.stCFW_Voltage[i].bUndervoltage :=
            GVL_DataLog.stCFW_Voltage[i].rVoltageNow < GVL_DataLog.rCFW_DCBus_Low;
        GVL_DataLog.stCFW_Voltage[i].bAlarm :=
            GVL_DataLog.stCFW_Voltage[i].bOvervoltage OR GVL_DataLog.stCFW_Voltage[i].bUndervoltage;

        IF GVL_DataLog.stCFW_Voltage[i].bAlarm THEN
            GVL_DataLog.iVoltageAlarmCount := GVL_DataLog.iVoltageAlarmCount + 1;
        END_IF;

    END_IF;
END_FOR;

// =========================================
// SSW900: Motor Voltage monitoring
// =========================================
rAvgSSW := 0.0;
iOnlineSSW := 0;

FOR i := 1 TO 4 DO
    IF GVL_WEG.stSSW900[i].bOnline THEN

        GVL_DataLog.stSSW_Voltage[i].rVoltageNow := GVL_WEG.stSSW900[i].rMotorVoltage;

        // Min / Max
        IF GVL_DataLog.stSSW_Voltage[i].rVoltageNow < GVL_DataLog.stSSW_Voltage[i].rVoltageMin THEN
            GVL_DataLog.stSSW_Voltage[i].rVoltageMin := GVL_DataLog.stSSW_Voltage[i].rVoltageNow;
        END_IF;
        IF GVL_DataLog.stSSW_Voltage[i].rVoltageNow > GVL_DataLog.stSSW_Voltage[i].rVoltageMax THEN
            GVL_DataLog.stSSW_Voltage[i].rVoltageMax := GVL_DataLog.stSSW_Voltage[i].rVoltageNow;
        END_IF;

        // Running average
        GVL_DataLog.stSSW_Voltage[i].ulSampleCount := GVL_DataLog.stSSW_Voltage[i].ulSampleCount + 1;
        GVL_DataLog.stSSW_Voltage[i].rAccumulator := GVL_DataLog.stSSW_Voltage[i].rAccumulator +
            REAL_TO_LREAL(GVL_DataLog.stSSW_Voltage[i].rVoltageNow);

        IF GVL_DataLog.stSSW_Voltage[i].ulSampleCount > 0 THEN
            GVL_DataLog.stSSW_Voltage[i].rVoltageAvg := LREAL_TO_REAL(
                GVL_DataLog.stSSW_Voltage[i].rAccumulator /
                UDINT_TO_LREAL(GVL_DataLog.stSSW_Voltage[i].ulSampleCount)
            );
        END_IF;

        // Overvoltage / Undervoltage alarms
        GVL_DataLog.stSSW_Voltage[i].bOvervoltage :=
            GVL_DataLog.stSSW_Voltage[i].rVoltageNow > GVL_DataLog.rSSW_Motor_High;
        GVL_DataLog.stSSW_Voltage[i].bUndervoltage :=
            GVL_DataLog.stSSW_Voltage[i].rVoltageNow < GVL_DataLog.rSSW_Motor_Low;
        GVL_DataLog.stSSW_Voltage[i].bAlarm :=
            GVL_DataLog.stSSW_Voltage[i].bOvervoltage OR GVL_DataLog.stSSW_Voltage[i].bUndervoltage;

        IF GVL_DataLog.stSSW_Voltage[i].bAlarm THEN
            GVL_DataLog.iVoltageAlarmCount := GVL_DataLog.iVoltageAlarmCount + 1;
        END_IF;

        // Accumulate for imbalance calculation
        rAvgSSW := rAvgSSW + GVL_DataLog.stSSW_Voltage[i].rVoltageNow;
        iOnlineSSW := iOnlineSSW + 1;

    END_IF;
END_FOR;

// =========================================
// SSW900: Voltage imbalance detection
// =========================================
IF iOnlineSSW >= 2 THEN
    rAvgSSW := rAvgSSW / INT_TO_REAL(iOnlineSSW);

    FOR i := 1 TO 4 DO
        IF GVL_WEG.stSSW900[i].bOnline AND rAvgSSW > 0.0 THEN
            GVL_DataLog.stSSW_Voltage[i].rDeviation :=
                ABS(GVL_DataLog.stSSW_Voltage[i].rVoltageNow - rAvgSSW) / rAvgSSW * 100.0;

            // Flag if deviation exceeds threshold
            IF GVL_DataLog.stSSW_Voltage[i].rDeviation > GVL_DataLog.rSSW_Imbalance_Max THEN
                GVL_DataLog.stSSW_Voltage[i].bAlarm := TRUE;
                GVL_DataLog.iVoltageAlarmCount := GVL_DataLog.iVoltageAlarmCount + 1;
            END_IF;
        END_IF;
    END_FOR;
END_IF;

GVL_DataLog.bVoltageAlarmActive := (GVL_DataLog.iVoltageAlarmCount > 0);

// =========================================
// Update trending voltage variables
// =========================================
GVL_DataLog.rTrend_CFW1_DCVoltage := GVL_DataLog.stCFW_Voltage[1].rVoltageNow;
GVL_DataLog.rTrend_CFW2_DCVoltage := GVL_DataLog.stCFW_Voltage[2].rVoltageNow;
GVL_DataLog.rTrend_CFW3_DCVoltage := GVL_DataLog.stCFW_Voltage[3].rVoltageNow;
GVL_DataLog.rTrend_CFW4_DCVoltage := GVL_DataLog.stCFW_Voltage[4].rVoltageNow;
GVL_DataLog.rTrend_SSW1_Voltage   := GVL_DataLog.stSSW_Voltage[1].rVoltageNow;
GVL_DataLog.rTrend_SSW2_Voltage   := GVL_DataLog.stSSW_Voltage[2].rVoltageNow;
GVL_DataLog.rTrend_SSW3_Voltage   := GVL_DataLog.stSSW_Voltage[3].rVoltageNow;
GVL_DataLog.rTrend_SSW4_Voltage   := GVL_DataLog.stSSW_Voltage[4].rVoltageNow;


// ============================================================================
// PROGRAM: PRG_DataLogger
// Writes CSV records to M241 SD card
// Task: MAST
// Libraries: CAA File (SysFile), SysTimeRtc
// ============================================================================

PROGRAM PRG_DataLogger
VAR
    // State machine
    iStep           : INT := 0;

    // Timer for log interval
    tLogInterval    : TON;
    tLogPT          : TIME;

    // File handling
    hFile           : CAA.FILE.FILE_HANDLE := CAA.FILE.INVALID_HANDLE;
    fbFileOpen      : CAA.FILE.Open;
    fbFileWrite     : CAA.FILE.Write;
    fbFileClose     : CAA.FILE.Close;

    // Date/Time
    dtCurrent       : DT;
    stTime          : TIMESTRUCT;
    sDate           : STRING(12);
    sTime           : STRING(10);
    sFileName       : STRING(80);

    // CSV building
    sCSVHeader      : STRING(255);
    sCSVLine        : STRING(255);
    sCSVLine2       : STRING(255);      // Continuation (long line)
    sTemp           : STRING(20);

    // State tracking
    iLastDay        : INT := -1;
    bHeaderWritten  : BOOL;
    bWriteError     : BOOL;
    i               : INT;
END_VAR

// =========================================
// Build log interval from HMI setting
// =========================================
tLogPT := INT_TO_TIME(GVL_DataLog.iLogInterval * 1000);

CASE iStep OF

    0: // ---- CHECK IF LOGGING ENABLED ----
        IF NOT GVL_DataLog.bLogEnabled THEN
            GVL_DataLog.bLogActive := FALSE;
            GVL_DataLog.sLogStatus := 'Logging disabled';
            RETURN;
        END_IF;

        GVL_DataLog.bLogActive := TRUE;
        iStep := 5;

    5: // ---- GET CURRENT DATE/TIME ----
        dtCurrent := GET_DATETIME();
        stTime := DT_TO_TIMESTRUCT(dtCurrent);

        // Build date string YYYY-MM-DD
        sDate := CONCAT(
            CONCAT(INT_TO_STRING(stTime.wYear), '-'),
            CONCAT(FC_PadZero(stTime.wMonth), CONCAT('-', FC_PadZero(stTime.wDay)))
        );

        // Build time string HH:MM:SS
        sTime := CONCAT(
            CONCAT(FC_PadZero(stTime.wHour), ':'),
            CONCAT(FC_PadZero(stTime.wMinute), CONCAT(':', FC_PadZero(stTime.wSecond)))
        );

        // Build filename: /sd0/WEG_LOG_2026-03-30.csv
        sFileName := CONCAT('/sd0/WEG_LOG_', CONCAT(sDate, '.csv'));
        GVL_DataLog.sCurrentFileName := sFileName;

        // Check if new day = new file
        IF INT_TO_INT(stTime.wDay) <> iLastDay THEN
            iLastDay := INT_TO_INT(stTime.wDay);
            bHeaderWritten := FALSE;
        END_IF;

        iStep := 10;

    10: // ---- WAIT FOR LOG INTERVAL ----
        tLogInterval(IN := TRUE, PT := tLogPT);

        // Also check for manual snapshot trigger
        IF tLogInterval.Q OR GVL_DataLog.bExportSnapshot THEN
            tLogInterval(IN := FALSE);
            GVL_DataLog.bExportSnapshot := FALSE;
            iStep := 20;
        END_IF;

    20: // ---- OPEN FILE (APPEND MODE) ----
        fbFileOpen(
            sFileName   := sFileName,
            eFileMode   := CAA.FILE.MODE.MRDWR,    // Read/Write (append)
            xExclusive  := FALSE
        );

        IF fbFileOpen.xDone THEN
            hFile := fbFileOpen.hFile;
            GVL_DataLog.bLogError := FALSE;

            IF NOT bHeaderWritten THEN
                iStep := 25;    // Write header first
            ELSE
                iStep := 30;    // Skip to data
            END_IF;

        ELSIF fbFileOpen.xError THEN
            // File might not exist, try create
            GVL_DataLog.bLogError := TRUE;
            GVL_DataLog.sLogStatus := 'SD Card error - check card';
            iStep := 10;
        END_IF;

    25: // ---- WRITE CSV HEADER ----
        sCSVHeader := 'DateTime,';
        sCSVHeader := CONCAT(sCSVHeader, 'CFW1_A,CFW1_Hz,CFW1_VDC,CFW1_Torq,CFW1_RPM,CFW1_Sts,');
        sCSVHeader := CONCAT(sCSVHeader, 'CFW2_A,CFW2_Hz,CFW2_VDC,CFW2_Torq,CFW2_RPM,CFW2_Sts,');
        sCSVHeader := CONCAT(sCSVHeader, 'CFW3_A,CFW3_Hz,CFW3_VDC,CFW3_Torq,CFW3_RPM,CFW3_Sts,');

        fbFileWrite(
            hFile   := hFile,
            pBuffer := ADR(sCSVHeader),
            szSize  := INT_TO_UDINT(LEN(sCSVHeader))
        );

        // Second part of header (line too long for single STRING)
        sCSVLine := 'CFW4_A,CFW4_Hz,CFW4_VDC,CFW4_Torq,CFW4_RPM,CFW4_Sts,';
        sCSVLine := CONCAT(sCSVLine, 'SSW1_A,SSW1_V,SSW1_kW,SSW1_Sts,');
        sCSVLine := CONCAT(sCSVLine, 'SSW2_A,SSW2_V,SSW2_kW,SSW2_Sts,');
        sCSVLine := CONCAT(sCSVLine, 'SSW3_A,SSW3_V,SSW3_kW,SSW3_Sts,');
        sCSVLine := CONCAT(sCSVLine, 'SSW4_A,SSW4_V,SSW4_kW,SSW4_Sts$N');

        fbFileWrite(
            hFile   := hFile,
            pBuffer := ADR(sCSVLine),
            szSize  := INT_TO_UDINT(LEN(sCSVLine))
        );

        bHeaderWritten := TRUE;
        iStep := 30;

    30: // ---- BUILD CSV DATA LINE ----
        // DateTime + CFW900 #1-#2
        sCSVLine := CONCAT(sDate, CONCAT(' ', CONCAT(sTime, ',')));

        FOR i := 1 TO 2 DO
            sCSVLine := CONCAT(sCSVLine,
                CONCAT(REAL_TO_STRING(GVL_WEG.stCFW900[i].rOutputCurrent), CONCAT(',',
                CONCAT(REAL_TO_STRING(GVL_WEG.stCFW900[i].rOutputFreq), CONCAT(',',
                CONCAT(REAL_TO_STRING(GVL_WEG.stCFW900[i].rDCBusVoltage), CONCAT(',',
                CONCAT(REAL_TO_STRING(GVL_WEG.stCFW900[i].rMotorTorque), CONCAT(',',
                CONCAT(REAL_TO_STRING(GVL_WEG.stCFW900[i].rSpeedRPM), CONCAT(',',
                CONCAT(WORD_TO_STRING(GVL_WEG.stCFW900[i].wStatusWord), ',')
                ))))))))))
            );
        END_FOR;

        // CFW900 #3-#4
        sCSVLine2 := '';
        FOR i := 3 TO 4 DO
            sCSVLine2 := CONCAT(sCSVLine2,
                CONCAT(REAL_TO_STRING(GVL_WEG.stCFW900[i].rOutputCurrent), CONCAT(',',
                CONCAT(REAL_TO_STRING(GVL_WEG.stCFW900[i].rOutputFreq), CONCAT(',',
                CONCAT(REAL_TO_STRING(GVL_WEG.stCFW900[i].rDCBusVoltage), CONCAT(',',
                CONCAT(REAL_TO_STRING(GVL_WEG.stCFW900[i].rMotorTorque), CONCAT(',',
                CONCAT(REAL_TO_STRING(GVL_WEG.stCFW900[i].rSpeedRPM), CONCAT(',',
                CONCAT(WORD_TO_STRING(GVL_WEG.stCFW900[i].wStatusWord), ',')
                ))))))))))
            );
        END_FOR;

        // SSW900 #1-#4
        FOR i := 1 TO 4 DO
            sCSVLine2 := CONCAT(sCSVLine2,
                CONCAT(REAL_TO_STRING(GVL_WEG.stSSW900[i].rMotorCurrent), CONCAT(',',
                CONCAT(REAL_TO_STRING(GVL_WEG.stSSW900[i].rMotorVoltage), CONCAT(',',
                CONCAT(REAL_TO_STRING(GVL_WEG.stSSW900[i].rMotorPower), CONCAT(',',
                CONCAT(WORD_TO_STRING(GVL_WEG.stSSW900[i].wStatusWord), ',')
                ))))))
            );
        END_FOR;
        sCSVLine2 := CONCAT(sCSVLine2, '$N');   // Newline

        iStep := 40;

    40: // ---- WRITE DATA TO FILE ----
        fbFileWrite(
            hFile   := hFile,
            pBuffer := ADR(sCSVLine),
            szSize  := INT_TO_UDINT(LEN(sCSVLine))
        );
        fbFileWrite(
            hFile   := hFile,
            pBuffer := ADR(sCSVLine2),
            szSize  := INT_TO_UDINT(LEN(sCSVLine2))
        );

        GVL_DataLog.ulRecordCount := GVL_DataLog.ulRecordCount + 1;
        GVL_DataLog.bExportDone := TRUE;
        GVL_DataLog.sLogStatus := CONCAT('Logging OK - Records: ', UDINT_TO_STRING(GVL_DataLog.ulRecordCount));

        iStep := 50;

    50: // ---- CLOSE FILE ----
        fbFileClose(hFile := hFile);

        IF fbFileClose.xDone THEN
            hFile := CAA.FILE.INVALID_HANDLE;
            iStep := 10;   // Back to wait
        END_IF;

END_CASE;


// ============================================================================
// FUNCTION: FC_PadZero
// Pads single digit to 2 chars: 5 -> '05'
// ============================================================================

FUNCTION FC_PadZero : STRING(3)
VAR_INPUT
    wValue : WORD;
END_VAR

IF wValue < 10 THEN
    FC_PadZero := CONCAT('0', WORD_TO_STRING(wValue));
ELSE
    FC_PadZero := WORD_TO_STRING(wValue);
END_IF;


// ============================================================================
// FUNCTION: FC_ResetVoltageStats
// Call from HMI button to reset min/max/avg
// ============================================================================

FUNCTION FC_ResetVoltageStats : BOOL
VAR
    i : INT;
END_VAR

FOR i := 1 TO 4 DO
    GVL_DataLog.stCFW_Voltage[i].rVoltageMin := 9999.0;
    GVL_DataLog.stCFW_Voltage[i].rVoltageMax := 0.0;
    GVL_DataLog.stCFW_Voltage[i].rVoltageAvg := 0.0;
    GVL_DataLog.stCFW_Voltage[i].rAccumulator := 0.0;
    GVL_DataLog.stCFW_Voltage[i].ulSampleCount := 0;

    GVL_DataLog.stSSW_Voltage[i].rVoltageMin := 9999.0;
    GVL_DataLog.stSSW_Voltage[i].rVoltageMax := 0.0;
    GVL_DataLog.stSSW_Voltage[i].rVoltageAvg := 0.0;
    GVL_DataLog.stSSW_Voltage[i].rAccumulator := 0.0;
    GVL_DataLog.stSSW_Voltage[i].ulSampleCount := 0;
END_FOR;

FC_ResetVoltageStats := TRUE;
