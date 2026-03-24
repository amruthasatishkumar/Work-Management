Set shell = CreateObject("WScript.Shell")
appDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

' Start backend silently (window style 0 = hidden)
shell.Run "cmd /c set NODE_OPTIONS=--no-warnings && cd /d """ & appDir & "work-management\backend"" && npx ts-node-dev --transpile-only src/index.ts", 0, False

' Wait for backend to initialize
WScript.Sleep 4000

' Start frontend silently
shell.Run "cmd /c cd /d """ & appDir & "work-management\frontend"" && npm run dev", 0, False

' Wait for frontend to be ready, then open browser
WScript.Sleep 5000
shell.Run "http://localhost:5173"
