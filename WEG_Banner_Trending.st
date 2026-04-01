// ============================================================================
// WEG ALARM BANNER + TRENDING SUPPORT
// Single scrolling banner showing active faults from all 8 devices
// Trending buffer for WebVisu Trend element
// ============================================================================


// ============================================================================
// GVL: GVL_Banner (add to existing GVL_HMI or create separate)
// ============================================================================

{attribute 'qualified_only'}
VAR_GLOBAL

    // ---- Alarm Banner ----
    sBannerText         : STRING(255);      // Current text displayed in banner
    sBannerFull         : STRING(255);      // Full concatenated alarm string
    bBannerBlink        : BOOL;             // Blink flag for banner background
    iBannerColor        : INT;              // 0=No alarms(green), 1=Warning(yellow), 2=Fault(red)
    bHasFaults          : BOOL;             // At least one fault active

    // ---- Trending Data (WebVisu Trend uses these directly) ----
    // CFW900 Currents
    rTrend_CFW1_Current : REAL;
    rTrend_CFW2_Current : REAL;
    rTrend_CFW3_Current : REAL;
    rTrend_CFW4_Current : REAL;

    // CFW900 Frequencies
    rTrend_CFW1_Freq    : REAL;
    rTrend_CFW2_Freq    : REAL;
    rTrend_CFW3_Freq    : REAL;
    rTrend_CFW4_Freq    : REAL;

    // SSW900 Currents
    rTrend_SSW1_Current : REAL;
    rTrend_SSW2_Current : REAL;
    rTrend_SSW3_Current : REAL;
    rTrend_SSW4_Current : REAL;

END_VAR


// ============================================================================
// PROGRAM: PRG_AlarmBanner
// Builds a single scrolling text with all active faults
// Task: MAST
// ============================================================================

PROGRAM PRG_AlarmBanner
VAR
    i               : INT;
    sTemp           : STRING(255);
    iFaultCount     : INT;

    // Scroll control
    iScrollPos      : INT := 0;
    iScrollLen      : INT;
    tScrollTimer    : TON;
    tBlinkTimer     : TON;
    bBlinkState     : BOOL;

    // Rotation: cycle through faults one at a time
    iDisplayIndex   : INT := 0;         // Which fault to show (0..iFaultCount-1)
    tRotateTimer    : TON;
    aFaultMessages  : ARRAY[0..7] OF STRING(80);
    iFaultTotal     : INT;
END_VAR

// =========================================
// STEP 1: Collect all active faults
// =========================================
iFaultTotal := 0;

// Check CFW900 devices
FOR i := 1 TO 4 DO
    IF GVL_WEG.stCFW900[i].bFault THEN
        aFaultMessages[iFaultTotal] := CONCAT(
            CONCAT('CFW900#', INT_TO_STRING(i)),
            CONCAT(': ', FC_CFW900_FaultText(GVL_WEG.stCFW900[i].wFaultCode))
        );
        iFaultTotal := iFaultTotal + 1;

    ELSIF NOT GVL_WEG.stCFW900[i].bOnline AND GVL_WEG.stCFW900[i].uiCommErrCount > 5 THEN
        aFaultMessages[iFaultTotal] := CONCAT('CFW900#', CONCAT(INT_TO_STRING(i), ': COMM LOST'));
        iFaultTotal := iFaultTotal + 1;
    END_IF;
END_FOR;

// Check SSW900 devices
FOR i := 1 TO 4 DO
    IF GVL_WEG.stSSW900[i].bFault THEN
        aFaultMessages[iFaultTotal] := CONCAT(
            CONCAT('SSW900#', INT_TO_STRING(i)),
            CONCAT(': ', FC_SSW900_FaultText(GVL_WEG.stSSW900[i].wFaultCode))
        );
        iFaultTotal := iFaultTotal + 1;

    ELSIF NOT GVL_WEG.stSSW900[i].bOnline AND GVL_WEG.stSSW900[i].uiCommErrCount > 5 THEN
        aFaultMessages[iFaultTotal] := CONCAT('SSW900#', CONCAT(INT_TO_STRING(i), ': COMM LOST'));
        iFaultTotal := iFaultTotal + 1;
    END_IF;
END_FOR;

// =========================================
// STEP 2: Update banner state
// =========================================
GVL_Banner.bHasFaults := (iFaultTotal > 0);

IF iFaultTotal = 0 THEN
    // No faults - show OK message
    GVL_Banner.sBannerText := 'SYSTEM OK - All drives operating normally';
    GVL_Banner.iBannerColor := 0;       // Green
    GVL_Banner.bBannerBlink := FALSE;
    iDisplayIndex := 0;

ELSIF iFaultTotal = 1 THEN
    // Single fault - show it fixed (no rotation needed)
    GVL_Banner.sBannerText := CONCAT('!! ', CONCAT(aFaultMessages[0], ' !!'));
    GVL_Banner.iBannerColor := 2;       // Red
    GVL_Banner.bBannerBlink := TRUE;

ELSE
    // Multiple faults - rotate display every 3 seconds
    tRotateTimer(IN := TRUE, PT := T#3S);
    IF tRotateTimer.Q THEN
        tRotateTimer(IN := FALSE);
        iDisplayIndex := iDisplayIndex + 1;
        IF iDisplayIndex >= iFaultTotal THEN
            iDisplayIndex := 0;
        END_IF;
    END_IF;

    // Build display: "!! [2/3] CFW900#1: F002 Overcurrent !!"
    GVL_Banner.sBannerText := CONCAT(
        CONCAT('!! [', CONCAT(INT_TO_STRING(iDisplayIndex + 1), CONCAT('/', INT_TO_STRING(iFaultTotal)))),
        CONCAT('] ', CONCAT(aFaultMessages[iDisplayIndex], ' !!'))
    );
    GVL_Banner.iBannerColor := 2;       // Red
    GVL_Banner.bBannerBlink := TRUE;

END_IF;

// =========================================
// STEP 3: Blink control (500ms toggle)
// =========================================
tBlinkTimer(IN := NOT tBlinkTimer.Q, PT := T#500MS);
IF tBlinkTimer.Q THEN
    bBlinkState := NOT bBlinkState;
END_IF;

IF GVL_Banner.bBannerBlink THEN
    GVL_Banner.bBannerBlink := bBlinkState;    // Toggle for HMI animation
END_IF;


// ============================================================================
// PROGRAM: PRG_Trending
// Copies monitoring data to trending variables
// Task: MAST
// ============================================================================

PROGRAM PRG_Trending
VAR
END_VAR

// CFW900 Currents
GVL_Banner.rTrend_CFW1_Current := GVL_WEG.stCFW900[1].rOutputCurrent;
GVL_Banner.rTrend_CFW2_Current := GVL_WEG.stCFW900[2].rOutputCurrent;
GVL_Banner.rTrend_CFW3_Current := GVL_WEG.stCFW900[3].rOutputCurrent;
GVL_Banner.rTrend_CFW4_Current := GVL_WEG.stCFW900[4].rOutputCurrent;

// CFW900 Frequencies
GVL_Banner.rTrend_CFW1_Freq := GVL_WEG.stCFW900[1].rOutputFreq;
GVL_Banner.rTrend_CFW2_Freq := GVL_WEG.stCFW900[2].rOutputFreq;
GVL_Banner.rTrend_CFW3_Freq := GVL_WEG.stCFW900[3].rOutputFreq;
GVL_Banner.rTrend_CFW4_Freq := GVL_WEG.stCFW900[4].rOutputFreq;

// SSW900 Currents
GVL_Banner.rTrend_SSW1_Current := GVL_WEG.stSSW900[1].rMotorCurrent;
GVL_Banner.rTrend_SSW2_Current := GVL_WEG.stSSW900[2].rMotorCurrent;
GVL_Banner.rTrend_SSW3_Current := GVL_WEG.stSSW900[3].rMotorCurrent;
GVL_Banner.rTrend_SSW4_Current := GVL_WEG.stSSW900[4].rMotorCurrent;
