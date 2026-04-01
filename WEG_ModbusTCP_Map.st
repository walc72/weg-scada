// ============================================================================
// PRG_ModbusTCP_Map
// Maps GVL_WEG variables to %MW registers for Node-RED access
// Add to MAST task AFTER PRG_WEG_Modbus_SL1 and PRG_WEG_Modbus_SL2
// ============================================================================

PROGRAM PRG_ModbusTCP_Map
VAR
    i       : INT;
    iBase   : INT;
END_VAR

// =========================================
// CFW900 -> %MW0 to %MW39 (4 devices x 10 registers)
// =========================================
FOR i := 1 TO 4 DO
    iBase := (i - 1) * 10;

    %MW[iBase + 0]  := WORD_TO_INT(GVL_WEG.stCFW900[i].wStatusWord);
    %MW[iBase + 1]  := REAL_TO_INT(GVL_WEG.stCFW900[i].rSpeedRPM);
    %MW[iBase + 2]  := REAL_TO_INT(GVL_WEG.stCFW900[i].rOutputCurrent * 10.0);
    %MW[iBase + 3]  := REAL_TO_INT(GVL_WEG.stCFW900[i].rOutputFreq * 10.0);
    %MW[iBase + 4]  := REAL_TO_INT(GVL_WEG.stCFW900[i].rDCBusVoltage * 10.0);
    %MW[iBase + 5]  := REAL_TO_INT(GVL_WEG.stCFW900[i].rMotorTorque * 10.0);
    %MW[iBase + 6]  := WORD_TO_INT(GVL_WEG.stCFW900[i].wFaultCode);
    %MW[iBase + 7]  := BOOL_TO_INT(GVL_WEG.stCFW900[i].bOnline);
    %MW[iBase + 8]  := UINT_TO_INT(GVL_WEG.stCFW900[i].uiCommErrCount);
    %MW[iBase + 9]  := 0;  // Reserved
END_FOR;

// =========================================
// SSW900 -> %MW40 to %MW79 (4 devices x 10 registers)
// =========================================
FOR i := 1 TO 4 DO
    iBase := 40 + (i - 1) * 10;

    %MW[iBase + 0]  := WORD_TO_INT(GVL_WEG.stSSW900[i].wStatusWord);
    %MW[iBase + 1]  := REAL_TO_INT(GVL_WEG.stSSW900[i].rMotorCurrent * 10.0);
    %MW[iBase + 2]  := REAL_TO_INT(GVL_WEG.stSSW900[i].rMotorVoltage * 10.0);
    %MW[iBase + 3]  := REAL_TO_INT(GVL_WEG.stSSW900[i].rMotorPower * 10.0);
    %MW[iBase + 4]  := WORD_TO_INT(GVL_WEG.stSSW900[i].wFaultCode);
    %MW[iBase + 5]  := BOOL_TO_INT(GVL_WEG.stSSW900[i].bOnline);
    %MW[iBase + 6]  := UINT_TO_INT(GVL_WEG.stSSW900[i].uiCommErrCount);
    %MW[iBase + 7]  := 0;
    %MW[iBase + 8]  := 0;
    %MW[iBase + 9]  := 0;
END_FOR;
