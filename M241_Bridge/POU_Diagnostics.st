(*
  POU_Diagnostics - OPCIONAL

  Este programa es OPCIONAL. El M241 funciona como bridge transparente
  sin necesidad de programacion. Solo agregar este POU si se quiere
  monitorear el estado de comunicacion desde el PLC.

  Importar en Machine Expert: Project > Import > PLCOpen XML
  Asignar a MAST task si se usa.
*)

PROGRAM POU_Diagnostics
VAR
    (* Timers para detectar perdida de comunicacion *)
    tSSW1_Watchdog : TON;
    tSSW2_Watchdog : TON;

    (* Valores anteriores para detectar cambios *)
    wSSW1_PrevStatus : WORD := 16#FFFF;
    wSSW2_PrevStatus : WORD := 16#FFFF;

    (* Comunicacion OK flags *)
    bSSW1_Alive : BOOL;
    bSSW2_Alive : BOOL;

    (* Contadores de error *)
    udiSSW1_Errors : UDINT;
    udiSSW2_Errors : UDINT;

    (* LED output para diagnostico - usar salida digital del M241 *)
    bLED_AllOK     AT %QX0.0 : BOOL;  (* Q0 = Todos los esclavos OK *)
    bLED_SSW1_Fail AT %QX0.1 : BOOL;  (* Q1 = SSW1 sin comunicacion *)
    bLED_SSW2_Fail AT %QX0.2 : BOOL;  (* Q2 = SSW2 sin comunicacion *)
END_VAR

(* Detectar si SSW900 #1 esta respondiendo *)
(* Si el status word cambia, el esclavo esta vivo *)
IF GVL_SSW900.SSW1_StatusWord <> wSSW1_PrevStatus THEN
    wSSW1_PrevStatus := GVL_SSW900.SSW1_StatusWord;
    bSSW1_Alive := TRUE;
    tSSW1_Watchdog(IN := FALSE);  (* Reset timer *)
END_IF

tSSW1_Watchdog(IN := TRUE, PT := T#10S);
IF tSSW1_Watchdog.Q THEN
    bSSW1_Alive := FALSE;
    udiSSW1_Errors := udiSSW1_Errors + 1;
    tSSW1_Watchdog(IN := FALSE);
END_IF

(* Detectar si SSW900 #2 esta respondiendo *)
IF GVL_SSW900.SSW2_StatusWord <> wSSW2_PrevStatus THEN
    wSSW2_PrevStatus := GVL_SSW900.SSW2_StatusWord;
    bSSW2_Alive := TRUE;
    tSSW2_Watchdog(IN := FALSE);
END_IF

tSSW2_Watchdog(IN := TRUE, PT := T#10S);
IF tSSW2_Watchdog.Q THEN
    bSSW2_Alive := FALSE;
    udiSSW2_Errors := udiSSW2_Errors + 1;
    tSSW2_Watchdog(IN := FALSE);
END_IF

(* Actualizar variables globales *)
GVL_SSW900.SSW1_CommOK := bSSW1_Alive;
GVL_SSW900.SSW2_CommOK := bSSW2_Alive;
GVL_SSW900.SSW1_CommErrors := udiSSW1_Errors;
GVL_SSW900.SSW2_CommErrors := udiSSW2_Errors;

(* LEDs de diagnostico *)
bLED_AllOK := bSSW1_Alive AND bSSW2_Alive;
bLED_SSW1_Fail := NOT bSSW1_Alive;
bLED_SSW2_Fail := NOT bSSW2_Alive;
