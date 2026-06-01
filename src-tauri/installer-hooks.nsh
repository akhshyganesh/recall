; "Open in Recall" shell verbs for folders, folder backgrounds, and drives.
; HKCU matches installer currentUser scope. %V = clicked path.
; NoWorkingDirectory keeps Explorer from overriding %V (System32 on Drive).

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInRecall" "" "Open in Recall"
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInRecall" "Icon" '"$INSTDIR\recall.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInRecall" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInRecall\command" "" '"$INSTDIR\recall.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInRecall" "" "Open in Recall"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInRecall" "Icon" '"$INSTDIR\recall.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInRecall" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInRecall\command" "" '"$INSTDIR\recall.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInRecall" "" "Open in Recall"
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInRecall" "Icon" '"$INSTDIR\recall.exe",0'
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInRecall" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInRecall\command" "" '"$INSTDIR\recall.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInRecall"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInRecall"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\OpenInRecall"
!macroend
