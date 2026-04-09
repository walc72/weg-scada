// ============================================================================
// WEG HMI SUPPORT CODE - WebVisu (Machine Expert)
// Variables and logic to support the HMI visualization screens
// ============================================================================


// ============================================================================
// GVL: GVL_HMI
// Variables used by WebVisu screens
// ============================================================================

{attribute 'qualified_only'}
VAR_GLOBAL

    // ---- Navigation ----
    iActivePage         : INT := 0;         // 0=Overview, 1=CFW Detail, 2=SSW Detail
    iSelectedCFW        : INT := 1;         // Selected CFW900 (1..4) for detail view
    iSelectedSSW        : INT := 1;         // Selected SSW900 (1..4) for detail view

    // ---- Overview: CFW900 summary bars (scaled 0-100%) ----
    arCFW_CurrentPct    : ARRAY[1..4] OF REAL;  // Current as % of nominal
    arCFW_FreqPct       : ARRAY[1..4] OF REAL;  // Frequency as % of nominal
    arCFW_StatusColor   : ARRAY[1..4] OF INT;   // 0=Off, 1=Ready, 2=Running, 3=Fault

    // ---- Overview: SSW900 summary bars ----
    arSSW_CurrentPct    : ARRAY[1..4] OF REAL;
    arSSW_StatusColor   : ARRAY[1..4] OF INT;   // 0=Off, 1=Ready, 2=Running/Bypass, 3=Starting, 4=Fault

    // ---- Detail: CFW900 selected device ----
    stCFW_Detail        : ST_CFW900_HMI_Detail;

    // ---- Detail: SSW900 selected device ----
    stSSW_Detail        : ST_SSW900_HMI_Detail;

    // ---- Alarms ----
    bAlarmActive        : BOOL;             // Any alarm active
    iAlarmCount         : INT;              // Number of active alarms
    asAlarmText         : ARRAY[1..8] OF STRING(80);  // Alarm texts for each device

    // ---- CFW900 Nominal Values (adjust to your motors) ----
    rCFW_NominalCurrent : REAL := 25.0;     // Nominal current (A) - ADJUST
    rCFW_NominalFreq    : REAL := 60.0;     // Nominal frequency (Hz) - ADJUST

    // ---- SSW900 Nominal Values ----
    rSSW_NominalCurrent : REAL := 50.0;     // Nominal current (A) - ADJUST

END_VAR


// ============================================================================
// DUT: ST_CFW900_HMI_Detail
// ============================================================================

TYPE ST_CFW900_HMI_Detail :
STRUCT
    sDeviceName     : STRING(30);
    rSpeedRPM       : REAL;
    rCurrent        : REAL;
    rFrequency      : REAL;
    rDCBusVoltage   : REAL;
    rTorque         : REAL;
    sFaultText      : STRING(40);
    sStatusText     : STRING(20);
    iStatusColor    : INT;          // For color animation
    bOnline         : BOOL;
    uiCommErrors    : UINT;

    // Bar graph values (0-100%)
    rCurrentBar     : REAL;
    rFreqBar        : REAL;
    rTorqueBar      : REAL;
    rVoltageBar     : REAL;
END_STRUCT
END_TYPE


// ============================================================================
// DUT: ST_SSW900_HMI_Detail
// ============================================================================

TYPE ST_SSW900_HMI_Detail :
STRUCT
    sDeviceName     : STRING(30);
    rCurrent        : REAL;
    rVoltage        : REAL;
    rPower          : REAL;
    sFaultText      : STRING(40);
    sStatusText     : STRING(20);
    iStatusColor    : INT;
    bOnline         : BOOL;
    uiCommErrors    : UINT;

    // Bar graph values (0-100%)
    rCurrentBar     : REAL;
    rVoltageBar     : REAL;
    rPowerBar       : REAL;
END_STRUCT
END_TYPE


// ============================================================================
// PROGRAM: PRG_HMI_Update
// Updates all HMI variables from raw Modbus data
// Task: MAST
// ============================================================================

PROGRAM PRG_HMI_Update
VAR
    i : INT;
END_VAR

// =========================================
// OVERVIEW: Update CFW900 bars and colors
// =========================================
FOR i := 1 TO 4 DO

    // Current as percentage of nominal
    IF GVL_HMI.rCFW_NominalCurrent > 0.0 THEN
        GVL_HMI.arCFW_CurrentPct[i] := (GVL_WEG.stCFW900[i].rOutputCurrent / GVL_HMI.rCFW_NominalCurrent) * 100.0;
    END_IF;

    // Frequency as percentage of nominal
    IF GVL_HMI.rCFW_NominalFreq > 0.0 THEN
        GVL_HMI.arCFW_FreqPct[i] := (GVL_WEG.stCFW900[i].rOutputFreq / GVL_HMI.rCFW_NominalFreq) * 100.0;
    END_IF;

    // Status color: 0=Gray(Off), 1=Green(Ready), 2=Blue(Running), 3=Red(Fault)
    IF GVL_WEG.stCFW900[i].bFault THEN
        GVL_HMI.arCFW_StatusColor[i] := 3;
    ELSIF GVL_WEG.stCFW900[i].bRunning THEN
        GVL_HMI.arCFW_StatusColor[i] := 2;
    ELSIF GVL_WEG.stCFW900[i].bReady THEN
        GVL_HMI.arCFW_StatusColor[i] := 1;
    ELSE
        GVL_HMI.arCFW_StatusColor[i] := 0;
    END_IF;

END_FOR;

// =========================================
// OVERVIEW: Update SSW900 bars and colors
// =========================================
FOR i := 1 TO 4 DO

    IF GVL_HMI.rSSW_NominalCurrent > 0.0 THEN
        GVL_HMI.arSSW_CurrentPct[i] := (GVL_WEG.stSSW900[i].rMotorCurrent / GVL_HMI.rSSW_NominalCurrent) * 100.0;
    END_IF;

    // 0=Gray, 1=Green(Ready), 2=Blue(Running), 3=Yellow(Starting), 4=Red(Fault)
    IF GVL_WEG.stSSW900[i].bFault THEN
        GVL_HMI.arSSW_StatusColor[i] := 4;
    ELSIF GVL_WEG.stSSW900[i].bRunning THEN
        GVL_HMI.arSSW_StatusColor[i] := 2;
    ELSIF GVL_WEG.stSSW900[i].bStarting THEN
        GVL_HMI.arSSW_StatusColor[i] := 3;
    ELSIF GVL_WEG.stSSW900[i].bReady THEN
        GVL_HMI.arSSW_StatusColor[i] := 1;
    ELSE
        GVL_HMI.arSSW_StatusColor[i] := 0;
    END_IF;

END_FOR;

// =========================================
// DETAIL: Update CFW900 detail view
// =========================================
IF GVL_HMI.iSelectedCFW >= 1 AND GVL_HMI.iSelectedCFW <= 4 THEN

    i := GVL_HMI.iSelectedCFW;

    GVL_HMI.stCFW_Detail.sDeviceName   := CONCAT('CFW900 #', INT_TO_STRING(i));
    GVL_HMI.stCFW_Detail.rSpeedRPM     := GVL_WEG.stCFW900[i].rSpeedRPM;
    GVL_HMI.stCFW_Detail.rCurrent      := GVL_WEG.stCFW900[i].rOutputCurrent;
    GVL_HMI.stCFW_Detail.rFrequency    := GVL_WEG.stCFW900[i].rOutputFreq;
    GVL_HMI.stCFW_Detail.rDCBusVoltage := GVL_WEG.stCFW900[i].rDCBusVoltage;
    GVL_HMI.stCFW_Detail.rTorque       := GVL_WEG.stCFW900[i].rMotorTorque;
    GVL_HMI.stCFW_Detail.bOnline       := GVL_WEG.stCFW900[i].bOnline;
    GVL_HMI.stCFW_Detail.uiCommErrors  := GVL_WEG.stCFW900[i].uiCommErrCount;
    GVL_HMI.stCFW_Detail.iStatusColor  := GVL_HMI.arCFW_StatusColor[i];

    // Bar graphs (capped at 120%)
    GVL_HMI.stCFW_Detail.rCurrentBar  := LIMIT(0.0, GVL_HMI.arCFW_CurrentPct[i], 120.0);
    GVL_HMI.stCFW_Detail.rFreqBar     := LIMIT(0.0, GVL_HMI.arCFW_FreqPct[i], 120.0);
    GVL_HMI.stCFW_Detail.rTorqueBar   := LIMIT(0.0, GVL_WEG.stCFW900[i].rMotorTorque, 120.0);
    GVL_HMI.stCFW_Detail.rVoltageBar  := LIMIT(0.0, GVL_WEG.stCFW900[i].rDCBusVoltage / 7.0, 120.0);

    // Status text
    IF GVL_WEG.stCFW900[i].bFault THEN
        GVL_HMI.stCFW_Detail.sStatusText := 'FAULT';
    ELSIF GVL_WEG.stCFW900[i].bRunning THEN
        GVL_HMI.stCFW_Detail.sStatusText := 'RUNNING';
    ELSIF GVL_WEG.stCFW900[i].bReady THEN
        GVL_HMI.stCFW_Detail.sStatusText := 'READY';
    ELSE
        GVL_HMI.stCFW_Detail.sStatusText := 'OFF';
    END_IF;

    // Fault text
    GVL_HMI.stCFW_Detail.sFaultText := FC_CFW900_FaultText(GVL_WEG.stCFW900[i].wFaultCode);

END_IF;

// =========================================
// DETAIL: Update SSW900 detail view
// =========================================
IF GVL_HMI.iSelectedSSW >= 1 AND GVL_HMI.iSelectedSSW <= 4 THEN

    i := GVL_HMI.iSelectedSSW;

    GVL_HMI.stSSW_Detail.sDeviceName   := CONCAT('SSW900 #', INT_TO_STRING(i));
    GVL_HMI.stSSW_Detail.rCurrent      := GVL_WEG.stSSW900[i].rMotorCurrent;
    GVL_HMI.stSSW_Detail.rVoltage      := GVL_WEG.stSSW900[i].rMotorVoltage;
    GVL_HMI.stSSW_Detail.rPower        := GVL_WEG.stSSW900[i].rMotorPower;
    GVL_HMI.stSSW_Detail.bOnline       := GVL_WEG.stSSW900[i].bOnline;
    GVL_HMI.stSSW_Detail.uiCommErrors  := GVL_WEG.stSSW900[i].uiCommErrCount;
    GVL_HMI.stSSW_Detail.iStatusColor  := GVL_HMI.arSSW_StatusColor[i];

    // Bar graphs
    GVL_HMI.stSSW_Detail.rCurrentBar := LIMIT(0.0, GVL_HMI.arSSW_CurrentPct[i], 120.0);
    GVL_HMI.stSSW_Detail.rVoltageBar := LIMIT(0.0, GVL_WEG.stSSW900[i].rMotorVoltage / 5.0, 120.0);
    GVL_HMI.stSSW_Detail.rPowerBar   := LIMIT(0.0, GVL_WEG.stSSW900[i].rMotorPower / 1.0, 120.0);

    // Status text
    IF GVL_WEG.stSSW900[i].bFault THEN
        GVL_HMI.stSSW_Detail.sStatusText := 'FAULT';
    ELSIF GVL_WEG.stSSW900[i].bRunning THEN
        GVL_HMI.stSSW_Detail.sStatusText := 'RUNNING';
    ELSIF GVL_WEG.stSSW900[i].bStarting THEN
        GVL_HMI.stSSW_Detail.sStatusText := 'STARTING';
    ELSIF GVL_WEG.stSSW900[i].bReady THEN
        GVL_HMI.stSSW_Detail.sStatusText := 'READY';
    ELSE
        GVL_HMI.stSSW_Detail.sStatusText := 'OFF';
    END_IF;

    GVL_HMI.stSSW_Detail.sFaultText := FC_SSW900_FaultText(GVL_WEG.stSSW900[i].wFaultCode);

END_IF;

// =========================================
// ALARMS: Update alarm summary
// =========================================
GVL_HMI.iAlarmCount := 0;
GVL_HMI.bAlarmActive := FALSE;

FOR i := 1 TO 4 DO
    IF GVL_WEG.stCFW900[i].bFault THEN
        GVL_HMI.iAlarmCount := GVL_HMI.iAlarmCount + 1;
        GVL_HMI.bAlarmActive := TRUE;
        GVL_HMI.asAlarmText[i] := CONCAT(CONCAT('CFW900 #', INT_TO_STRING(i)),
            CONCAT(' - FAULT: ', FC_CFW900_FaultText(GVL_WEG.stCFW900[i].wFaultCode)));
    ELSIF NOT GVL_WEG.stCFW900[i].bOnline THEN
        GVL_HMI.iAlarmCount := GVL_HMI.iAlarmCount + 1;
        GVL_HMI.bAlarmActive := TRUE;
        GVL_HMI.asAlarmText[i] := CONCAT('CFW900 #', CONCAT(INT_TO_STRING(i), ' - COMM LOST'));
    ELSE
        GVL_HMI.asAlarmText[i] := '';
    END_IF;
END_FOR;

FOR i := 1 TO 4 DO
    IF GVL_WEG.stSSW900[i].bFault THEN
        GVL_HMI.iAlarmCount := GVL_HMI.iAlarmCount + 1;
        GVL_HMI.bAlarmActive := TRUE;
        GVL_HMI.asAlarmText[i + 4] := CONCAT(CONCAT('SSW900 #', INT_TO_STRING(i)),
            CONCAT(' - FAULT: ', FC_SSW900_FaultText(GVL_WEG.stSSW900[i].wFaultCode)));
    ELSIF NOT GVL_WEG.stSSW900[i].bOnline THEN
        GVL_HMI.iAlarmCount := GVL_HMI.iAlarmCount + 1;
        GVL_HMI.bAlarmActive := TRUE;
        GVL_HMI.asAlarmText[i + 4] := CONCAT('SSW900 #', CONCAT(INT_TO_STRING(i), ' - COMM LOST'));
    ELSE
        GVL_HMI.asAlarmText[i + 4] := '';
    END_IF;
END_FOR;


// ============================================================================
// FUNCTION: FC_CFW900_FaultText
// Returns fault description from CFW900 fault code
// ============================================================================

FUNCTION FC_CFW900_FaultText : STRING(40)
VAR_INPUT
    wFaultCode : WORD;
END_VAR

CASE WORD_TO_INT(wFaultCode) OF
    0:  FC_CFW900_FaultText := 'No Fault';
    2:  FC_CFW900_FaultText := 'F002: Overcurrent';
    3:  FC_CFW900_FaultText := 'F003: DC Link Overvoltage';
    4:  FC_CFW900_FaultText := 'F004: IGBT Overtemp';
    5:  FC_CFW900_FaultText := 'F005: Motor Overload';
    6:  FC_CFW900_FaultText := 'F006: Drive Overtemp';
    7:  FC_CFW900_FaultText := 'F007: Overcurrent Phase U';
    8:  FC_CFW900_FaultText := 'F008: Overcurrent Phase V';
    9:  FC_CFW900_FaultText := 'F009: Overcurrent Phase W';
    12: FC_CFW900_FaultText := 'F012: Phase Loss Input';
    21: FC_CFW900_FaultText := 'F021: Earth Fault';
    22: FC_CFW900_FaultText := 'F022: Motor Overtemp PTC';
    33: FC_CFW900_FaultText := 'F033: Undervoltage';
    49: FC_CFW900_FaultText := 'F049: Motor Stalled';
    70: FC_CFW900_FaultText := 'F070: Communication Error';
    72: FC_CFW900_FaultText := 'F072: Fieldbus Timeout';
    74: FC_CFW900_FaultText := 'F074: Serial Comm Error';
ELSE
    FC_CFW900_FaultText := CONCAT('Fault Code: ', WORD_TO_STRING(wFaultCode));
END_CASE;


// ============================================================================
// FUNCTION: FC_SSW900_FaultText
// Returns fault description from SSW900 fault code
// ============================================================================

FUNCTION FC_SSW900_FaultText : STRING(40)
VAR_INPUT
    wFaultCode : WORD;
END_VAR

CASE WORD_TO_INT(wFaultCode) OF
    0:  FC_SSW900_FaultText := 'No Fault';
    1:  FC_SSW900_FaultText := 'F01: Motor Overcurrent';
    2:  FC_SSW900_FaultText := 'F02: Phase Sequence';
    3:  FC_SSW900_FaultText := 'F03: Phase Loss Input';
    4:  FC_SSW900_FaultText := 'F04: Phase Loss Output';
    5:  FC_SSW900_FaultText := 'F05: Thyristor Short';
    6:  FC_SSW900_FaultText := 'F06: Heatsink Overtemp';
    7:  FC_SSW900_FaultText := 'F07: Motor Overload';
    8:  FC_SSW900_FaultText := 'F08: Undervoltage';
    9:  FC_SSW900_FaultText := 'F09: Overvoltage';
    10: FC_SSW900_FaultText := 'F10: Phase Imbalance';
    11: FC_SSW900_FaultText := 'F11: Motor PTC Overtemp';
    20: FC_SSW900_FaultText := 'F20: Bypass Contactor';
    30: FC_SSW900_FaultText := 'F30: Communication Error';
    51: FC_SSW900_FaultText := 'F51: Locked Rotor';
    73: FC_SSW900_FaultText := 'F73: Serial Timeout';
ELSE
    FC_SSW900_FaultText := CONCAT('Fault Code: ', WORD_TO_STRING(wFaultCode));
END_CASE;
