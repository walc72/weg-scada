// ============================================================================
// WEG CFW900 & SSW900 - Modbus RTU Monitoring
// PLC: TM241CEC24T
// SL1: 4x CFW900 (Addr 1-4) | SL2: 4x SSW900 (Addr 5-8)
// Library: ModbusComLib (Add in Library Manager)
// ============================================================================

// ============================================================================
// GLOBAL VARIABLE LIST (GVL): GVL_WEG
// Add this as a Global Variable List in your Machine Expert project
// ============================================================================

{attribute 'qualified_only'}
VAR_GLOBAL

    // ---- CFW900 Data (4 drives) ----
    stCFW900 : ARRAY[1..4] OF ST_CFW900_Data;

    // ---- SSW900 Data (4 soft starters) ----
    stSSW900 : ARRAY[1..4] OF ST_SSW900_Data;

    // ---- Communication Status ----
    bComm_SL1_OK    : BOOL;     // SL1 bus healthy
    bComm_SL2_OK    : BOOL;     // SL2 bus healthy
    uiComm_Errors   : UINT;     // Total communication errors

END_VAR


// ============================================================================
// DUT: ST_CFW900_Data
// Create this as a DUT (Data Unit Type) in your project
// ============================================================================

TYPE ST_CFW900_Data :
STRUCT
    // --- Monitoring Data ---
    wStatusWord     : WORD;         // Reg 0x0002 - Drive Status Word
    rSpeedRPM       : REAL;         // Reg 0x0003 - Motor Speed (RPM)
    rOutputCurrent  : REAL;         // Reg 0x0005 - Output Current (A)
    rOutputFreq     : REAL;         // Reg 0x0007 - Output Frequency (Hz)
    rDCBusVoltage   : REAL;         // Reg 0x0009 - DC Bus Voltage (V)
    rMotorTorque    : REAL;         // Reg 0x000B - Motor Torque (%)
    wFaultCode      : WORD;         // Reg 0x002F - Active Fault Code

    // --- Decoded Status Bits ---
    bReady          : BOOL;         // Drive ready
    bRunning        : BOOL;         // Drive running
    bFault          : BOOL;         // Drive in fault
    bWarning        : BOOL;         // Warning active

    // --- Communication ---
    bOnline         : BOOL;         // Device responding
    bCommError      : BOOL;         // Communication error
    uiCommErrCount  : UINT;         // Error counter

END_STRUCT
END_TYPE


// ============================================================================
// DUT: ST_SSW900_Data
// Create this as a DUT (Data Unit Type) in your project
// ============================================================================

TYPE ST_SSW900_Data :
STRUCT
    // --- Monitoring Data ---
    wStatusWord     : WORD;         // Reg 0x0002 - Status Word
    rMotorCurrent   : REAL;         // Reg 0x0005 - Motor Current (A)
    wFaultCode      : WORD;         // Reg 0x0007 - Active Fault
    rMotorVoltage   : REAL;         // Reg 0x0009 - Motor Voltage (V)
    rMotorPower     : REAL;         // Reg 0x000B - Motor Power (kW)

    // --- Decoded Status Bits ---
    bReady          : BOOL;         // Ready to start
    bRunning        : BOOL;         // Motor running (bypass)
    bStarting       : BOOL;         // Soft start in progress
    bFault          : BOOL;         // Fault active

    // --- Communication ---
    bOnline         : BOOL;         // Device responding
    bCommError      : BOOL;         // Communication error
    uiCommErrCount  : UINT;         // Error counter

END_STRUCT
END_TYPE


// ============================================================================
// PROGRAM: PRG_WEG_Modbus_SL1
// Reads 4x CFW900 on Serial Line 1
// Task: MAST (default cycle)
// ============================================================================

PROGRAM PRG_WEG_Modbus_SL1
VAR
    // Modbus Read Function Block (one instance, reused sequentially)
    fbReadReg       : READ_VAR;

    // Sequencer
    iStep           : INT := 0;
    iDevice         : INT := 1;         // Current device (1..4)
    iRegIndex       : INT := 0;         // Current register to read

    // Modbus parameters
    aSlaveAddr      : ARRAY[1..4] OF BYTE := [1, 2, 3, 4];

    // Register addresses to read for CFW900
    // Addr, Qty pairs
    aRegAddr        : ARRAY[0..3] OF WORD := [16#0002, 16#0005, 16#0007, 16#002F];
    aRegQty         : ARRAY[0..3] OF WORD := [2, 2, 2, 1];     // Words to read

    // Receive buffer
    awRxBuffer      : ARRAY[0..3] OF WORD;

    // Timeout
    tTimeout        : TON;
    tPollDelay      : TON;

    // Error tracking
    bError          : BOOL;
    uiTotalErrors   : UINT;
END_VAR

// --- Implementation ---

CASE iStep OF

    0: // ---- INIT: Start polling cycle ----
        iDevice := 1;
        iRegIndex := 0;
        iStep := 10;

    10: // ---- SEND READ REQUEST ----
        fbReadReg(
            Execute     := TRUE,
            SlaveId     := aSlaveAddr[iDevice],
            FunctionCode:= 3,                      // FC03: Read Holding Registers
            Quantity    := aRegQty[iRegIndex],
            StartAddress:= aRegAddr[iRegIndex],
            Timeout     := T#500MS,
            Buffer      := ADR(awRxBuffer),
            BufferLength:= SIZEOF(awRxBuffer)
        );
        iStep := 20;

    20: // ---- WAIT FOR RESPONSE ----
        fbReadReg(
            Execute := FALSE
        );

        IF fbReadReg.Done THEN
            // Success - store data
            bError := FALSE;
            GVL_WEG.stCFW900[iDevice].bOnline := TRUE;
            GVL_WEG.stCFW900[iDevice].bCommError := FALSE;

            CASE iRegIndex OF
                0: // Status Word + Speed
                    GVL_WEG.stCFW900[iDevice].wStatusWord := awRxBuffer[0];
                    GVL_WEG.stCFW900[iDevice].rSpeedRPM := WORD_TO_REAL(awRxBuffer[1]);
                1: // Current + Frequency
                    GVL_WEG.stCFW900[iDevice].rOutputCurrent := WORD_TO_REAL(awRxBuffer[0]) / 10.0;
                    GVL_WEG.stCFW900[iDevice].rOutputFreq := WORD_TO_REAL(awRxBuffer[1]) / 10.0;
                2: // DC Bus Voltage + Torque
                    GVL_WEG.stCFW900[iDevice].rDCBusVoltage := WORD_TO_REAL(awRxBuffer[0]) / 10.0;
                    GVL_WEG.stCFW900[iDevice].rMotorTorque := WORD_TO_REAL(awRxBuffer[1]) / 10.0;
                3: // Fault Code
                    GVL_WEG.stCFW900[iDevice].wFaultCode := awRxBuffer[0];
            END_CASE;

            iStep := 30;

        ELSIF fbReadReg.Error THEN
            // Communication error
            bError := TRUE;
            GVL_WEG.stCFW900[iDevice].bCommError := TRUE;
            GVL_WEG.stCFW900[iDevice].uiCommErrCount := GVL_WEG.stCFW900[iDevice].uiCommErrCount + 1;
            uiTotalErrors := uiTotalErrors + 1;
            iStep := 30;
        END_IF;

    30: // ---- NEXT REGISTER OR NEXT DEVICE ----
        iRegIndex := iRegIndex + 1;

        IF iRegIndex > 3 THEN
            // All registers read for this device, decode status
            FC_DecodeCFW900Status(iDevice);

            iRegIndex := 0;
            iDevice := iDevice + 1;

            IF iDevice > 4 THEN
                // All devices polled, small delay then restart
                iStep := 40;
            ELSE
                iStep := 10;
            END_IF;
        ELSE
            iStep := 10;
        END_IF;

    40: // ---- POLL CYCLE DELAY ----
        tPollDelay(IN := TRUE, PT := T#100MS);
        IF tPollDelay.Q THEN
            tPollDelay(IN := FALSE);
            GVL_WEG.bComm_SL1_OK := (uiTotalErrors = 0);
            uiTotalErrors := 0;
            iStep := 0;
        END_IF;

END_CASE;


// ============================================================================
// PROGRAM: PRG_WEG_Modbus_SL2
// Reads 4x SSW900 on Serial Line 2
// Task: MAST (default cycle)
// ============================================================================

PROGRAM PRG_WEG_Modbus_SL2
VAR
    fbReadReg       : READ_VAR;

    iStep           : INT := 0;
    iDevice         : INT := 1;
    iRegIndex       : INT := 0;

    // SSW900 Modbus addresses (5,6,7,8)
    aSlaveAddr      : ARRAY[1..4] OF BYTE := [5, 6, 7, 8];

    // Registers to read for SSW900
    aRegAddr        : ARRAY[0..2] OF WORD := [16#0002, 16#0005, 16#0009];
    aRegQty         : ARRAY[0..2] OF WORD := [1, 2, 2];

    awRxBuffer      : ARRAY[0..3] OF WORD;

    tPollDelay      : TON;
    bError          : BOOL;
    uiTotalErrors   : UINT;
END_VAR

// --- Implementation ---

CASE iStep OF

    0: // ---- INIT ----
        iDevice := 1;
        iRegIndex := 0;
        iStep := 10;

    10: // ---- SEND READ REQUEST ----
        fbReadReg(
            Execute     := TRUE,
            SlaveId     := aSlaveAddr[iDevice],
            FunctionCode:= 3,
            Quantity    := aRegQty[iRegIndex],
            StartAddress:= aRegAddr[iRegIndex],
            Timeout     := T#500MS,
            Buffer      := ADR(awRxBuffer),
            BufferLength:= SIZEOF(awRxBuffer)
        );
        iStep := 20;

    20: // ---- WAIT FOR RESPONSE ----
        fbReadReg(
            Execute := FALSE
        );

        IF fbReadReg.Done THEN
            bError := FALSE;
            GVL_WEG.stSSW900[iDevice].bOnline := TRUE;
            GVL_WEG.stSSW900[iDevice].bCommError := FALSE;

            CASE iRegIndex OF
                0: // Status Word
                    GVL_WEG.stSSW900[iDevice].wStatusWord := awRxBuffer[0];
                1: // Current + Fault
                    GVL_WEG.stSSW900[iDevice].rMotorCurrent := WORD_TO_REAL(awRxBuffer[0]) / 10.0;
                    GVL_WEG.stSSW900[iDevice].wFaultCode := awRxBuffer[1];
                2: // Voltage + Power
                    GVL_WEG.stSSW900[iDevice].rMotorVoltage := WORD_TO_REAL(awRxBuffer[0]) / 10.0;
                    GVL_WEG.stSSW900[iDevice].rMotorPower := WORD_TO_REAL(awRxBuffer[1]) / 10.0;
            END_CASE;

            iStep := 30;

        ELSIF fbReadReg.Error THEN
            bError := TRUE;
            GVL_WEG.stSSW900[iDevice].bCommError := TRUE;
            GVL_WEG.stSSW900[iDevice].uiCommErrCount := GVL_WEG.stSSW900[iDevice].uiCommErrCount + 1;
            uiTotalErrors := uiTotalErrors + 1;
            iStep := 30;
        END_IF;

    30: // ---- NEXT REGISTER OR NEXT DEVICE ----
        iRegIndex := iRegIndex + 1;

        IF iRegIndex > 2 THEN
            FC_DecodeSSW900Status(iDevice);
            iRegIndex := 0;
            iDevice := iDevice + 1;

            IF iDevice > 4 THEN
                iStep := 40;
            ELSE
                iStep := 10;
            END_IF;
        ELSE
            iStep := 10;
        END_IF;

    40: // ---- POLL CYCLE DELAY ----
        tPollDelay(IN := TRUE, PT := T#100MS);
        IF tPollDelay.Q THEN
            tPollDelay(IN := FALSE);
            GVL_WEG.bComm_SL2_OK := (uiTotalErrors = 0);
            uiTotalErrors := 0;
            iStep := 0;
        END_IF;

END_CASE;


// ============================================================================
// FUNCTION: FC_DecodeCFW900Status
// Decodes CFW900 Status Word into boolean flags
// ============================================================================

FUNCTION FC_DecodeCFW900Status : BOOL
VAR_INPUT
    iDevIdx : INT;
END_VAR
VAR
    wStatus : WORD;
END_VAR

wStatus := GVL_WEG.stCFW900[iDevIdx].wStatusWord;

// CFW900 Status Word bit mapping
GVL_WEG.stCFW900[iDevIdx].bReady   := (wStatus AND 16#0001) <> 0;  // Bit 0: Ready
GVL_WEG.stCFW900[iDevIdx].bRunning := (wStatus AND 16#0002) <> 0;  // Bit 1: Running
GVL_WEG.stCFW900[iDevIdx].bFault   := (wStatus AND 16#0008) <> 0;  // Bit 3: Fault
GVL_WEG.stCFW900[iDevIdx].bWarning := (wStatus AND 16#0080) <> 0;  // Bit 7: Warning

FC_DecodeCFW900Status := TRUE;


// ============================================================================
// FUNCTION: FC_DecodeSSW900Status
// Decodes SSW900 Status Word into boolean flags
// ============================================================================

FUNCTION FC_DecodeSSW900Status : BOOL
VAR_INPUT
    iDevIdx : INT;
END_VAR
VAR
    wStatus : WORD;
END_VAR

wStatus := GVL_WEG.stSSW900[iDevIdx].wStatusWord;

// SSW900 Status Word bit mapping
GVL_WEG.stSSW900[iDevIdx].bReady    := (wStatus AND 16#0001) <> 0;  // Bit 0: Ready
GVL_WEG.stSSW900[iDevIdx].bRunning  := (wStatus AND 16#0002) <> 0;  // Bit 1: Running (bypass)
GVL_WEG.stSSW900[iDevIdx].bStarting := (wStatus AND 16#0004) <> 0;  // Bit 2: Starting
GVL_WEG.stSSW900[iDevIdx].bFault    := (wStatus AND 16#0008) <> 0;  // Bit 3: Fault

FC_DecodeSSW900Status := TRUE;
